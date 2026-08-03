import nodemailer from 'nodemailer';
import { env } from '../../config/environment.js';
import type { Transporter } from 'nodemailer';

let transporter: Transporter | undefined;

export function isMailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.MAIL_FROM_EMAIL);
}

export function createMailTransporter() {
  if (!isMailConfigured()) throw new Error('SMTP configuration is incomplete');
  const serviceMode = !env.SMTP_HOST.includes('.') && !env.SMTP_HOST.includes(':');
  transporter ??= nodemailer.createTransport({
    ...(serviceMode ? { service: env.SMTP_HOST } : { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE }),
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: env.SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: env.SMTP_SOCKET_TIMEOUT_MS,
    pool: true
  });
  return transporter;
}

export async function verifyMailConnection(): Promise<void> {
  const mailTransporter = createMailTransporter();
  try {
    await mailTransporter.verify();
  } catch (error) {
    throw new Error('SMTP verification failed', { cause: error });
  }
}

export type SmtpFailureStatus = 'auth_failed' | 'unavailable';

export interface SmtpErrorClassification {
  status: SmtpFailureStatus;
  code: string;
  responseCode: number | null;
  command: string | null;
  /** Safe to log: code/response/command only, never credentials. */
  message: string;
}

/**
 * Extracts a safe-to-log summary of an SMTP failure. Reads only `code` /
 * `responseCode` / `command` off the (possibly wrapped, see
 * verifyMailConnection's `cause`) error — never the transporter config or
 * the raw error object, so SMTP_PASSWORD can never end up in a log line.
 */
export function classifySmtpError(error: unknown): SmtpErrorClassification {
  const wrapped = error as { cause?: unknown } | undefined;
  const source = (wrapped?.cause ?? error) as { code?: string; responseCode?: number; command?: string } | undefined;
  const code = source?.code || 'ESMTP';
  const responseCode = typeof source?.responseCode === 'number' ? source.responseCode : null;
  const command = source?.command || null;
  const status: SmtpFailureStatus = code === 'EAUTH' || responseCode === 535 ? 'auth_failed' : 'unavailable';
  const message = `SMTP ${code}${responseCode ? ` ${responseCode}` : ''}${command ? ` (${command})` : ''}`;
  return { status, code, responseCode, command, message };
}
