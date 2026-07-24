import { Sequelize } from 'sequelize';
import { env } from './environment.js';
import { logger } from './logger.js';

export const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'mysql',
  dialectOptions: { charset: 'utf8mb4' },
  timezone: '+00:00',
  logging: env.DB_LOGGING ? (message) => logger.debug({ sql: message }, 'Database query') : false,
  define: {
    underscored: true,
    timestamps: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  },
  pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 }
});

export async function authenticateDatabase(): Promise<void> {
  await sequelize.authenticate();
}

export async function closeDatabase(): Promise<void> {
  await sequelize.close();
}
