import { hostname } from 'node:os';
import { env } from '../../config/environment.js';
import { logger } from '../../config/logger.js';
import { NewsletterWorkerHeartbeat } from './newsletter-worker-heartbeat.model.js';
import type { NewsletterWorkerClaimStatus, NewsletterWorkerRuntimeStatus } from './newsletter-worker-heartbeat.model.js';

export type WorkerHealthStatus = NewsletterWorkerRuntimeStatus | 'stale' | 'offline';
export type ClaimHealthStatus = NewsletterWorkerClaimStatus;
export type SmtpHealthStatus = 'ready' | 'auth_failed' | 'unavailable' | 'not_configured' | 'unknown';
export type DatabaseHealthStatus = 'ready' | 'unavailable' | 'unknown';

export interface WorkerHeartbeatRecord {
  workerInstanceId: string;
  processId: number;
  hostname: string;
  status: NewsletterWorkerRuntimeStatus;
  claimStatus: ClaimHealthStatus;
  databaseReady: boolean;
  smtpReady: boolean;
  startedAt: Date | string;
  lastHeartbeatAt: Date | string;
  lastSuccessfulPollAt: Date | string | null;
  lastSuccessfulClaimAt: Date | string | null;
  lastSuccessfulSendAt: Date | string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  consecutivePollFailures: number;
  consecutiveClaimFailures: number;
  lastClaimErrorAt: Date | string | null;
  lastHeartbeatErrorAt: Date | string | null;
  lastRecoveryAt: Date | string | null;
  stoppedAt: Date | string | null;
}

export interface LatestWorkerHealth {
  worker_instance_id: string;
  process_id: number;
  hostname: string;
  status: NewsletterWorkerRuntimeStatus;
  claim_status: ClaimHealthStatus;
  started_at: string | null;
  last_heartbeat_at: string;
  heartbeat_age_seconds: number;
  last_successful_poll_at: string | null;
  last_successful_claim_at: string | null;
  last_successful_send_at: string | null;
  database_ready: boolean;
  smtp_ready: boolean;
  last_error_code: string | null;
  last_error_message: string | null;
  consecutive_poll_failures: number;
  consecutive_claim_failures: number;
  last_claim_error_at: string | null;
  last_heartbeat_error_at: string | null;
  last_recovery_at: string | null;
  stopped_at: string | null;
}

export interface WorkerHealthResponse {
  worker_status: WorkerHealthStatus;
  claim_status: ClaimHealthStatus;
  database_status: DatabaseHealthStatus;
  smtp_status: SmtpHealthStatus;
  active_worker_count: number;
  stale_worker_count: number;
  latest_heartbeat_at: string | null;
  heartbeat_age_seconds: number | null;
  latest_worker: LatestWorkerHealth | null;
  thresholds: {
    heartbeat_interval_seconds: number;
    stale_after_seconds: number;
  };
}

let heartbeatTimer: NodeJS.Timeout | null = null;
let heartbeatFailureAt: Date | null = null;

function safeError(error: unknown): { code: string; message: string } {
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
  const code = String(candidate?.code || candidate?.name || 'WORKER_ERROR').slice(0, 100);
  const message = String(candidate?.message || error || 'Unknown Worker error').slice(0, 1000);
  return { code, message };
}

export function parseUtcTimestamp(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  const trimmed = value.trim();
  if (!trimmed) return null;
  const includesTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalized = includesTimezone ? trimmed : `${trimmed.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function utcIso(value: Date | string | null | undefined): string | null {
  return parseUtcTimestamp(value)?.toISOString() ?? null;
}

function smtpStatusFor(row: WorkerHeartbeatRecord): SmtpHealthStatus {
  if (row.smtpReady) return 'ready';
  const code = (row.lastErrorCode || '').toUpperCase();
  if (code === 'SMTP_NOT_CONFIGURED') return 'not_configured';
  if (/EAUTH|AUTH|535|534/.test(code)) return 'auth_failed';
  if (code.startsWith('SMTP_') || code === 'ECONNECTION' || code === 'ETIMEDOUT') return 'unavailable';
  return 'unknown';
}

function serializeWorker(row: WorkerHeartbeatRecord, heartbeat: Date, now: Date): LatestWorkerHealth {
  return {
    worker_instance_id: row.workerInstanceId,
    process_id: row.processId,
    hostname: row.hostname,
    status: row.status,
    claim_status: row.claimStatus || 'unknown',
    started_at: utcIso(row.startedAt),
    last_heartbeat_at: heartbeat.toISOString(),
    heartbeat_age_seconds: Math.floor(Math.max(0, now.getTime() - heartbeat.getTime()) / 1000),
    last_successful_poll_at: utcIso(row.lastSuccessfulPollAt),
    last_successful_claim_at: utcIso(row.lastSuccessfulClaimAt),
    last_successful_send_at: utcIso(row.lastSuccessfulSendAt),
    database_ready: Boolean(row.databaseReady),
    smtp_ready: Boolean(row.smtpReady),
    last_error_code: row.lastErrorCode,
    last_error_message: row.lastErrorMessage,
    consecutive_poll_failures: Number(row.consecutivePollFailures || 0),
    consecutive_claim_failures: Number(row.consecutiveClaimFailures || 0),
    last_claim_error_at: utcIso(row.lastClaimErrorAt),
    last_heartbeat_error_at: utcIso(row.lastHeartbeatErrorAt),
    last_recovery_at: utcIso(row.lastRecoveryAt),
    stopped_at: utcIso(row.stoppedAt)
  };
}

export function evaluateWorkerHealth(
  rows: WorkerHeartbeatRecord[],
  staleThresholdMs: number,
  heartbeatIntervalMs: number,
  now: Date = new Date()
): WorkerHealthResponse {
  const thresholdMs = Math.max(1, Math.floor(staleThresholdMs));
  const intervalMs = Math.max(1, Math.floor(heartbeatIntervalMs));
  const entries = rows
    .map((row) => ({ row, heartbeat: parseUtcTimestamp(row.lastHeartbeatAt) }))
    .filter((entry): entry is { row: WorkerHeartbeatRecord; heartbeat: Date } => entry.heartbeat !== null)
    .sort((left, right) => right.heartbeat.getTime() - left.heartbeat.getTime());
  const thresholds = {
    heartbeat_interval_seconds: intervalMs / 1000,
    stale_after_seconds: thresholdMs / 1000
  };

  if (entries.length === 0) {
    return {
      worker_status: 'offline', claim_status: 'unknown', database_status: 'unknown', smtp_status: 'unknown',
      active_worker_count: 0, stale_worker_count: 0, latest_heartbeat_at: null, heartbeat_age_seconds: null,
      latest_worker: null, thresholds
    };
  }

  const isRecent = (entry: { heartbeat: Date }) => Math.max(0, now.getTime() - entry.heartbeat.getTime()) <= thresholdMs;
  const recent = entries.filter(isRecent);
  const activeReady = recent.filter(({ row }) => row.status === 'active' && row.databaseReady && row.smtpReady);
  const absoluteLatest = entries[0]!;
  const preferred = activeReady[0] ?? recent.find(({ row }) => row.status === 'degraded') ?? recent[0] ?? absoluteLatest;
  const staleWorkerCount = entries.filter((entry) => !isRecent(entry)).length;
  const latestWorker = serializeWorker(preferred.row, preferred.heartbeat, now);

  let workerStatus: WorkerHealthStatus;
  if (recent.length === 0) workerStatus = 'stale';
  else if (activeReady.length > 0) {
    const active = activeReady[0]!.row;
    workerStatus = active.status === 'degraded' || active.consecutivePollFailures > 0 || active.consecutiveClaimFailures > 0
      ? 'degraded'
      : 'active';
  } else if (preferred.row.status === 'failed') workerStatus = 'failed';
  else if (preferred.row.status === 'stopped' || preferred.row.status === 'stopping') workerStatus = preferred.row.status;
  else if (preferred.row.status === 'degraded' || (preferred.row.databaseReady && !preferred.row.smtpReady)) workerStatus = 'degraded';
  else workerStatus = 'starting';

  return {
    worker_status: workerStatus,
    claim_status: latestWorker.claim_status,
    database_status: latestWorker.database_ready ? 'ready' : 'unavailable',
    smtp_status: smtpStatusFor(preferred.row),
    active_worker_count: activeReady.length,
    stale_worker_count: staleWorkerCount,
    latest_heartbeat_at: absoluteLatest.heartbeat.toISOString(),
    heartbeat_age_seconds: Math.floor(Math.max(0, now.getTime() - absoluteLatest.heartbeat.getTime()) / 1000),
    latest_worker: latestWorker,
    thresholds
  };
}

async function updateWorkerRow(workerInstanceId: string, values: Record<string, unknown>): Promise<void> {
  const [affected] = await NewsletterWorkerHeartbeat.update(values, { where: { workerInstanceId } });
  if (affected === 0) throw new Error(`Newsletter Worker heartbeat row not found: ${workerInstanceId}`);
}

export async function createWorkerHeartbeat(workerInstanceId: string, now: Date = new Date()): Promise<void> {
  await NewsletterWorkerHeartbeat.create({
    workerInstanceId,
    processId: process.pid,
    hostname: hostname(),
    status: 'starting',
    claimStatus: 'unknown',
    databaseReady: true,
    smtpReady: false,
    startedAt: now,
    lastHeartbeatAt: now,
    lastSuccessfulPollAt: null,
    lastSuccessfulClaimAt: null,
    lastSuccessfulSendAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    consecutivePollFailures: 0,
    consecutiveClaimFailures: 0,
    lastClaimErrorAt: null,
    lastHeartbeatErrorAt: null,
    lastRecoveryAt: null,
    stoppedAt: null
  });
  logger.info({ workerInstanceId, lastHeartbeatAt: now.toISOString() }, 'Newsletter Worker heartbeat created');
}

export async function markWorkerState(
  workerInstanceId: string,
  status: NewsletterWorkerRuntimeStatus,
  values: Record<string, unknown> = {},
  now: Date = new Date()
): Promise<void> {
  await updateWorkerRow(workerInstanceId, { status, ...values, lastHeartbeatAt: now });
}

export async function markWorkerSmtpState(
  workerInstanceId: string,
  ready: boolean,
  error?: unknown,
  now: Date = new Date()
): Promise<void> {
  const safe = error ? safeError(error) : null;
  await updateWorkerRow(workerInstanceId, {
    smtpReady: ready,
    status: ready ? 'active' : 'degraded',
    claimStatus: ready ? 'idle' : 'blocked',
    lastErrorCode: safe?.code ?? null,
    lastErrorMessage: safe?.message ?? null,
    lastHeartbeatAt: now,
    ...(ready ? { lastRecoveryAt: now } : {})
  });
}

export async function markWorkerDatabaseState(
  workerInstanceId: string,
  ready: boolean,
  error?: unknown,
  now: Date = new Date()
): Promise<void> {
  const safe = error ? safeError(error) : null;
  await updateWorkerRow(workerInstanceId, {
    databaseReady: ready,
    status: ready ? 'active' : 'degraded',
    claimStatus: ready ? 'idle' : 'blocked',
    lastErrorCode: safe?.code ?? null,
    lastErrorMessage: safe?.message ?? null,
    ...(ready ? { lastRecoveryAt: now } : {})
  });
}

export async function updateWorkerHeartbeat(workerInstanceId: string, now: Date = new Date()): Promise<void> {
  const values: Record<string, unknown> = { lastHeartbeatAt: now };
  if (heartbeatFailureAt) {
    values.lastHeartbeatErrorAt = heartbeatFailureAt;
    values.lastRecoveryAt = now;
  }
  await updateWorkerRow(workerInstanceId, values);
  heartbeatFailureAt = null;
  logger.debug({ workerInstanceId, lastHeartbeatAt: now.toISOString() }, 'Newsletter Worker heartbeat updated');
}

export function startWorkerHeartbeatTimer(
  workerInstanceId: string,
  intervalMs: number = env.NEWSLETTER_WORKER_HEARTBEAT_INTERVAL_MS
): void {
  stopWorkerHeartbeatTimer();
  const tick = () => {
    void updateWorkerHeartbeat(workerInstanceId).catch((error) => {
      heartbeatFailureAt = new Date();
      logger.error({ workerInstanceId, error: safeError(error).message }, 'Newsletter Worker heartbeat update failed');
    });
  };
  tick();
  heartbeatTimer = setInterval(tick, intervalMs);
  heartbeatTimer.unref?.();
}

export function stopWorkerHeartbeatTimer(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

export async function recordWorkerPollSuccess(
  workerInstanceId: string,
  claimedCount: number,
  now: Date = new Date()
): Promise<void> {
  await updateWorkerRow(workerInstanceId, {
    status: 'active',
    claimStatus: claimedCount > 0 ? 'healthy' : 'idle',
    lastSuccessfulPollAt: now,
    lastSuccessfulClaimAt: now,
    lastErrorCode: null,
    lastErrorMessage: null,
    consecutivePollFailures: 0,
    consecutiveClaimFailures: 0,
    lastRecoveryAt: now
  });
}

export async function recordWorkerClaimSuccess(
  workerInstanceId: string,
  claimedCount: number,
  now: Date = new Date()
): Promise<void> {
  await updateWorkerRow(workerInstanceId, {
    claimStatus: claimedCount > 0 ? 'processing' : 'idle',
    lastSuccessfulClaimAt: now,
    consecutiveClaimFailures: 0,
    lastClaimErrorAt: null
  });
}

export async function recordWorkerPollFailure(
  workerInstanceId: string,
  error: unknown,
  claimFailed = false,
  now: Date = new Date()
): Promise<void> {
  const row = await NewsletterWorkerHeartbeat.findByPk(workerInstanceId, { raw: true }) as unknown as WorkerHeartbeatRecord | null;
  const safe = safeError(error);
  await updateWorkerRow(workerInstanceId, {
    status: 'degraded',
    claimStatus: claimFailed ? 'claim_failed' : 'blocked',
    lastErrorCode: safe.code,
    lastErrorMessage: safe.message,
    consecutivePollFailures: Number(row?.consecutivePollFailures || 0) + 1,
    consecutiveClaimFailures: claimFailed ? Number(row?.consecutiveClaimFailures || 0) + 1 : Number(row?.consecutiveClaimFailures || 0),
    ...(claimFailed ? { lastClaimErrorAt: now } : {})
  });
}

export async function recordWorkerSendSuccess(workerInstanceId: string, now: Date = new Date()): Promise<void> {
  await updateWorkerRow(workerInstanceId, { lastSuccessfulSendAt: now });
}

export async function markWorkerStopping(workerInstanceId: string, now: Date = new Date()): Promise<void> {
  await markWorkerState(workerInstanceId, 'stopping', { claimStatus: 'blocked' }, now);
}

export async function markWorkerStopped(workerInstanceId: string, now: Date = new Date()): Promise<void> {
  await markWorkerState(workerInstanceId, 'stopped', { claimStatus: 'blocked', stoppedAt: now }, now);
}

export async function markWorkerFailed(workerInstanceId: string, error?: unknown, now: Date = new Date()): Promise<void> {
  const safe = error ? safeError(error) : null;
  await markWorkerState(workerInstanceId, 'failed', {
    claimStatus: 'blocked', stoppedAt: now,
    lastErrorCode: safe?.code ?? null,
    lastErrorMessage: safe?.message ?? null
  }, now);
}

export async function readWorkerHealth(
  now: Date = new Date(),
  staleThresholdMs: number = env.NEWSLETTER_WORKER_HEARTBEAT_STALE_MS,
  heartbeatIntervalMs: number = env.NEWSLETTER_WORKER_HEARTBEAT_INTERVAL_MS
): Promise<WorkerHealthResponse> {
  const rows = await NewsletterWorkerHeartbeat.findAll({ raw: true }) as unknown as WorkerHeartbeatRecord[];
  const health = evaluateWorkerHealth(rows, staleThresholdMs, heartbeatIntervalMs, now);
  logger.debug({
    latestHeartbeatAt: health.latest_heartbeat_at,
    heartbeatAgeSeconds: health.heartbeat_age_seconds,
    workerStatus: health.worker_status,
    activeWorkerCount: health.active_worker_count,
    staleWorkerCount: health.stale_worker_count
  }, 'Newsletter Worker health evaluated');
  return health;
}
