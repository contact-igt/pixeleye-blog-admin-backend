import { spawnSync } from 'node:child_process';
import { env } from '../config/environment.js';
import { logger } from '../config/logger.js';

const resetSteps = [
    { step: 'sequelize-cli db:drop', allowFailure: true },
    { step: 'sequelize-cli db:create', allowFailure: false },
    { step: 'sequelize-cli db:migrate', allowFailure: false },
    { step: 'sequelize-cli db:seed:all', allowFailure: false }
] as const;

function runStep(step: string, allowFailure: boolean): void {
    logger.info({ step }, 'Executing database reset step');

    const result = spawnSync(step, {
        stdio: 'inherit',
        env: process.env,
        shell: true
    });

    if (result.status !== 0 && !allowFailure) {
        throw new Error(`Database reset step failed: ${step}`);
    }

    if (result.status !== 0 && allowFailure) {
        logger.warn({ step }, 'Database reset step reported a non-zero exit code but was allowed to continue');
    }
}

async function main(): Promise<void> {
    logger.warn(
        {
            database: env.DB_NAME,
            host: env.DB_HOST,
            port: env.DB_PORT,
            app_stage: env.APP_STAGE,
            node_env: env.NODE_ENV
        },
        'Database reset requested: all data in the configured database will be dropped and recreated'
    );

    for (const { step, allowFailure } of resetSteps) {
        runStep(step, allowFailure);
    }

    logger.info({ database: env.DB_NAME }, 'Database reset completed successfully');
}

void main().catch((error: unknown) => {
    logger.error({ err: error }, 'Database reset failed');
    process.exitCode = 1;
});
