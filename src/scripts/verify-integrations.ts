import { authenticateDatabase, closeDatabase } from '../config/database.js';
import { env, getEnvironmentCompleteness } from '../config/environment.js';
import { getR2Configuration, verifyR2Connection } from '../services/integrations/cloudflare.service.js';
import { isMailConfigured, verifyMailConnection } from '../services/integrations/mail.service.js';

let failed = false;

async function report(label: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
    console.info(`${label}: passed`);
  } catch (error) {
    failed = true;
    console.error(`${label}: ${error instanceof Error ? error.message : 'failed'}`);
  }
}

const completeness = getEnvironmentCompleteness(process.env);

if (completeness.database.complete) {
  console.info('Database configuration: complete');
  await report('Database connection', authenticateDatabase);
} else {
  failed = true;
  console.error(`Database configuration: incomplete (${completeness.database.missing.join(', ')})`);
}

const r2Config = getR2Configuration();
if (r2Config.configured) {
  console.info('R2 configuration: complete');
  await report('R2 connection', verifyR2Connection);
} else {
  failed = true;
  console.error(`R2 configuration: incomplete (${completeness.r2.missing.join(', ') || 'R2_PUBLIC_BASE_URL'})`);
}

if (isMailConfigured()) {
  console.info('SMTP configuration: complete');
  await report('SMTP connection', verifyMailConnection);
} else {
  failed = true;
  console.error(`SMTP configuration: incomplete (${completeness.smtp.missing.join(', ')})`);
}

if (completeness.jwt.complete && env.JWT_ACCESS_SECRET.length >= 32) {
  console.info('JWT configuration: complete');
} else {
  failed = true;
  console.error(`JWT configuration: incomplete (${completeness.jwt.missing.join(', ') || 'JWT_ACCESS_SECRET'})`);
}

await closeDatabase().catch(() => undefined);
if (failed) process.exitCode = 1;
