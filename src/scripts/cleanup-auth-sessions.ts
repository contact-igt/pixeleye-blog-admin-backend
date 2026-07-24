import { closeDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { cleanupOldAdminSessions } from '../modules/admin/auth/auth-session-lifecycle.service.js';

async function run(): Promise<void> {
  try {
    const result = await cleanupOldAdminSessions();
    logger.info(
      {
        retention_days: result.retention_days,
        cutoff: result.cutoff.toISOString(),
        deleted_count: result.deleted_count
      },
      'Admin session cleanup completed'
    );
  } finally {
    await closeDatabase();
  }
}

void run().catch(async (error) => {
  logger.error({ err: error }, 'Admin session cleanup failed');
  await closeDatabase().catch(() => undefined);
  process.exitCode = 1;
});
