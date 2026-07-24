import 'dotenv/config';
import { env } from '../config/environment.js';
import { logger } from '../config/logger.js';
import { sequelize } from '../config/database.js';
import { createMediaService } from '../modules/media/media.service.js';
import '../modules/auth/index.js';
import '../modules/media/media.model.js';

async function main() {
  const service = createMediaService();
  const result = await service.purgeExpiredTrashedMediaAssets({ batchSize: env.MEDIA_TRASH_PURGE_BATCH_SIZE });
  logger.info(result, 'Media trash purge completed');
}

main()
  .catch((error) => {
    logger.error({ err: error }, 'Media trash purge failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => undefined);
  });

