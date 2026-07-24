import pino from 'pino';
import { env } from './environment.js';

const developmentTransport =
  env.NODE_ENV === 'development'
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname,service'
        }
      })
    : undefined;

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'password',
      '*.password',
      'DB_PASSWORD',
      '*.DB_PASSWORD',
      'token',
      '*.token',
      'accessToken',
      '*.accessToken',
      'refreshToken',
      '*.refreshToken',
      'authorization',
      '*.authorization',
      'req.headers.authorization',
      'cookie',
      '*.cookie',
      'cookies',
      '*.cookies',
      'req.headers.cookie',
      'SMTP_PASSWORD',
      '*.SMTP_PASSWORD',
      'R2_ACCESS_KEY_ID',
      '*.R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      '*.R2_SECRET_ACCESS_KEY'
    ],
    censor: '[REDACTED]'
  },
  base: { service: 'pixel-eye-blog-backend' },
  timestamp: pino.stdTimeFunctions.isoTime
}, developmentTransport);

