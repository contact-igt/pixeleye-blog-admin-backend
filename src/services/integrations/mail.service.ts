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
