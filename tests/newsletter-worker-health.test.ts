import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), findAll: vi.fn(), findByPk: vi.fn(),
  loggerInfo: vi.fn(), loggerDebug: vi.fn(), loggerError: vi.fn()
}));

vi.mock('../src/modules/newsletters/newsletter-worker-heartbeat.model.js', () => ({
  NewsletterWorkerHeartbeat: {
    create: mocks.create, update: mocks.update, findAll: mocks.findAll, findByPk: mocks.findByPk
  }
}));

vi.mock('../src/config/environment.js', () => ({
  env: {
    NEWSLETTER_WORKER_HEARTBEAT_INTERVAL_MS: 10_000,
    NEWSLETTER_WORKER_HEARTBEAT_STALE_MS: 45_000
  }
}));

vi.mock('../src/config/logger.js', () => ({
  logger: { info: mocks.loggerInfo, debug: mocks.loggerDebug, error: mocks.loggerError }
}));

import {
  createWorkerHeartbeat, evaluateWorkerHealth, parseUtcTimestamp, readWorkerHealth,
  startWorkerHeartbeatTimer, stopWorkerHeartbeatTimer, updateWorkerHeartbeat,
  type WorkerHeartbeatRecord
} from '../src/modules/newsletters/newsletter-worker-health.js';

const now = new Date('2026-07-29T12:00:30.000Z');

function row(workerInstanceId: string, lastHeartbeatAt: Date | string, overrides: Partial<WorkerHeartbeatRecord> = {}): WorkerHeartbeatRecord {
  return {
    workerInstanceId, processId: 123, hostname: 'worker-host', status: 'active', claimStatus: 'idle',
    databaseReady: true, smtpReady: true, startedAt: '2026-07-29T12:00:00.000Z', lastHeartbeatAt,
    lastSuccessfulPollAt: null, lastSuccessfulClaimAt: null, lastSuccessfulSendAt: null,
    lastErrorCode: null, lastErrorMessage: null, consecutivePollFailures: 0, consecutiveClaimFailures: 0,
    lastClaimErrorAt: null, lastHeartbeatErrorAt: null, lastRecoveryAt: null, stoppedAt: null,
    ...overrides
  };
}

describe('newsletter Worker heartbeat persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({});
    mocks.update.mockResolvedValue([1]);
    mocks.findAll.mockResolvedValue([]);
    mocks.findByPk.mockResolvedValue(null);
  });

  afterEach(() => {
    stopWorkerHeartbeatTimer();
    vi.useRealTimers();
  });

  it('creates an immediate UTC heartbeat with unique process metadata', async () => {
    await createWorkerHeartbeat('worker-1', now);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      workerInstanceId: 'worker-1', processId: process.pid, hostname: expect.any(String), status: 'starting',
      databaseReady: true, smtpReady: false, startedAt: now, lastHeartbeatAt: now
    }));
  });

  it('keeps multiple Worker instance rows independent', async () => {
    await createWorkerHeartbeat('worker-1', now);
    await createWorkerHeartbeat('worker-2', now);
    expect(mocks.create.mock.calls.map(([value]) => value.workerInstanceId)).toEqual(['worker-1', 'worker-2']);
  });

  it('updates heartbeat with zero deliveries', async () => {
    vi.useFakeTimers();
    startWorkerHeartbeatTimer('worker-with-zero-deliveries', 2_000);
    await vi.advanceTimersByTimeAsync(4_100);
    expect(mocks.update).toHaveBeenCalledTimes(3);
  });

  it('continues heartbeat after one update failure', async () => {
    vi.useFakeTimers();
    mocks.update.mockRejectedValueOnce(new Error('temporary database error')).mockResolvedValue([1]);
    startWorkerHeartbeatTimer('worker-1', 1_000);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(mocks.update).toHaveBeenCalledTimes(3);
    expect(mocks.loggerError).toHaveBeenCalledWith(expect.objectContaining({ error: 'temporary database error' }), 'Newsletter Worker heartbeat update failed');
  });

  it('updates one running heartbeat directly', async () => {
    await updateWorkerHeartbeat('worker-1', now);
    expect(mocks.update).toHaveBeenCalledWith({ lastHeartbeatAt: now }, { where: { workerInstanceId: 'worker-1' } });
  });
});

describe('newsletter Worker health classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAll.mockResolvedValue([]);
  });

  it('returns active for a recent ready heartbeat', () => {
    expect(evaluateWorkerHealth([row('worker-1', '2026-07-29T12:00:25.000Z')], 45_000, 10_000, now)).toMatchObject({
      worker_status: 'active', claim_status: 'idle', active_worker_count: 1, heartbeat_age_seconds: 5,
      thresholds: { heartbeat_interval_seconds: 10, stale_after_seconds: 45 }
    });
  });

  it('returns stale only after the millisecond threshold', () => {
    expect(evaluateWorkerHealth([row('worker-1', '2026-07-29T11:59:44.999Z')], 45_000, 10_000, now).worker_status).toBe('stale');
    expect(evaluateWorkerHealth([row('worker-1', '2026-07-29T11:59:45.000Z')], 45_000, 10_000, now).worker_status).toBe('active');
  });

  it('returns offline when no heartbeat exists', () => {
    expect(evaluateWorkerHealth([], 45_000, 10_000, now)).toMatchObject({ worker_status: 'offline', active_worker_count: 0, latest_worker: null });
  });

  it('uses a newer active Worker instead of an old stale Worker', () => {
    const health = evaluateWorkerHealth([
      row('old-worker', '2026-07-29T11:50:00.000Z'),
      row('current-worker', '2026-07-29T12:00:27.000Z')
    ], 45_000, 10_000, now);
    expect(health.worker_status).toBe('active');
    expect(health.latest_worker?.worker_instance_id).toBe('current-worker');
    expect(health.stale_worker_count).toBe(1);
  });

  it('reports degraded Worker and claim failure separately', () => {
    const health = evaluateWorkerHealth([
      row('worker-1', '2026-07-29T12:00:27.000Z', { status: 'degraded', claimStatus: 'claim_failed', consecutiveClaimFailures: 2 })
    ], 45_000, 10_000, now);
    expect(health.worker_status).toBe('degraded');
    expect(health.claim_status).toBe('claim_failed');
  });

  it('parses timezone-less MariaDB timestamps as UTC', () => {
    expect(parseUtcTimestamp('2026-07-29 12:00:25.000')?.toISOString()).toBe('2026-07-29T12:00:25.000Z');
    expect(evaluateWorkerHealth([row('worker-1', '2026-07-29 12:00:25.000')], 45_000, 10_000, now).heartbeat_age_seconds).toBe(5);
  });

  it('queries all database rows on every health read', async () => {
    mocks.findAll.mockResolvedValue([row('worker-1', '2026-07-29T12:00:25.000Z')]);
    const first = await readWorkerHealth(now, 45_000, 10_000);
    const second = await readWorkerHealth(now, 45_000, 10_000);
    expect(first.worker_status).toBe('active');
    expect(second.worker_status).toBe('active');
    expect(mocks.findAll).toHaveBeenCalledTimes(2);
    expect(mocks.findAll).toHaveBeenCalledWith({ raw: true });
  });
});
