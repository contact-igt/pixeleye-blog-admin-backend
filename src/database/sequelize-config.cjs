require('dotenv').config();

const requestedStage = process.env.APP_STAGE || (process.env.NODE_ENV === 'production' ? 'production' : 'local');
const appStage = requestedStage === 'dev' ? 'development' : requestedStage === 'prod' ? 'production' : requestedStage;
const prefix = appStage.toUpperCase();
const stageValue = (key, fallback = '') => process.env[`${prefix}_${key}`] ?? process.env[key] ?? fallback;
const environment = process.env.NODE_ENV === 'test' ? 'test' : appStage === 'production' ? 'production' : 'development';

const selected = {
  DB_HOST: stageValue('DB_HOST', '127.0.0.1'),
  DB_PORT: stageValue('DB_PORT', '3306'),
  DB_NAME: stageValue('DB_NAME', 'pixel_eye_blog_db'),
  DB_USER: stageValue('DB_USER', 'pixel_eye_blog'),
  DB_PASSWORD: stageValue('DB_PASSWORD')
};

if (environment === 'production') {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter((key) => !selected[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing production database configuration: ${missing.join(', ')}`);
  }
}

const shared = {
  username: selected.DB_USER,
  password: selected.DB_PASSWORD,
  database: selected.DB_NAME,
  host: selected.DB_HOST,
  port: Number(selected.DB_PORT),
  dialect: 'mysql',
  dialectOptions: { charset: 'utf8mb4' },
  timezone: '+00:00',
  logging: false
};

module.exports = {
  development: shared,
  test: { ...shared, database: process.env.DB_TEST_NAME || 'pixel_eye_blog_test' },
  production: shared
};