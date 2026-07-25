import 'dotenv/config';
import { z } from 'zod';
const appStageSchema = z.enum(['local', 'development', 'production']);
const databaseKeys = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;

function selectStageEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const requestedStage = input.APP_STAGE || (input.NODE_ENV === 'production' ? 'production' : 'local');
  const appStage = requestedStage === 'dev' ? 'development' : requestedStage === 'prod' ? 'production' : requestedStage;
  const prefix = appStage.toUpperCase();
  const selected: NodeJS.ProcessEnv = {
    ...input,
    APP_STAGE: appStage,
    NODE_ENV: input.NODE_ENV === 'test' ? 'test' : appStage === 'production' ? 'production' : 'development'
  };

  for (const key of databaseKeys) {
    selected[key] = input[`${prefix}_${key}`] ?? input[key];
  }

  selected.SMTP_HOST = input.SMTP_HOST ?? input.EMAIL_SERVICE;
  selected.SMTP_USER = input.SMTP_USER ?? input.EMAIL_USER;
  selected.SMTP_PASSWORD = input.SMTP_PASSWORD ?? input.EMAIL_PASS;

  return selected;
}

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const requiredEnvironmentGroups = {
  database: ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER'],
  jwt: ['JWT_ACCESS_SECRET', 'JWT_ACCESS_EXPIRES_IN', 'JWT_ISSUER', 'JWT_AUDIENCE'],
  initialSuperAdmin: ['INITIAL_SUPER_ADMIN_NAME', 'INITIAL_SUPER_ADMIN_EMAIL', 'INITIAL_SUPER_ADMIN_PASSWORD'],
  r2: [
    'CLOUDFLARE_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_REGION',
    'R2_ENDPOINT',
    'R2_PUBLIC_BASE_URL',
    'R2_OBJECT_PREFIX',
    'R2_MAX_FILE_SIZE_MB',
    'R2_ALLOWED_IMAGE_TYPES'
  ],
  smtp: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM_NAME', 'MAIL_FROM_EMAIL']
} as const;

export function getEnvironmentCompleteness(input: NodeJS.ProcessEnv) {
  const selectedInput = selectStageEnvironment(input);
  return Object.fromEntries(
    Object.entries(requiredEnvironmentGroups).map(([group, keys]) => {
      const missing = [...keys].filter((key) => !selectedInput[key]?.trim());
      return [group, { complete: missing.length === 0, missing }];
    })
  ) as Record<keyof typeof requiredEnvironmentGroups, { complete: boolean; missing: string[] }>;
}
const environmentSchema = z.object({
  APP_STAGE: appStageSchema.default('local'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  APP_VERSION: z.string().default('0.1.0'),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65_535).default(3306),
  DB_NAME: z.string().min(1).default('pixel_eye_blog_db'),
  DB_USER: z.string().min(1).default('pixel_eye_blog'),
  DB_PASSWORD: z.string().default(''),
  DB_LOGGING: booleanString,
  ADMIN_FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  PUBLIC_WEBSITE_URL: z.string().url().default('https://pixeleye.in'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  JWT_ACCESS_SECRET: z.string().min(32).default('local-development-jwt-secret-change-me-32'),
  JWT_ACCESS_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/).default('15m'),
  JWT_ISSUER: z.string().min(1).default('pixel-eye-blog-backend'),
  JWT_AUDIENCE: z.string().min(1).default('pixel-eye-blog-admin'),
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().int().positive().max(90).default(30),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().max(20).default(5),
  AUTH_LOCK_MINUTES: z.coerce.number().int().positive().max(1440).default(15),
  AUTH_SESSION_HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().max(3650).default(30),
  AUTH_MAX_ACTIVE_SESSIONS_PER_USER: z.coerce.number().int().positive().max(100).default(5),
  MEDIA_TRASH_RETENTION_DAYS: z.coerce.number().int().positive().max(3650).default(30),
  MEDIA_TRASH_PURGE_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(50),
  CLOUDFLARE_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET_NAME: z.string().default('pixel-eye-blog-media'),
  R2_REGION: z.string().default('auto'),
  R2_ENDPOINT: z.string().url().or(z.literal('')).default(''),
  R2_PUBLIC_BASE_URL: z.string().url().or(z.literal('')).default(''),
  R2_OBJECT_PREFIX: z.string().default('pixel-eye-blog'),
  R2_MAX_FILE_SIZE_MB: z.coerce.number().positive().max(25).default(5),
  R2_ALLOWED_IMAGE_TYPES: z.string().default('image/jpeg,image/png,image/webp,image/avif'),
  EMAIL_SERVICE: z.string().default(''),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_SECURE: booleanString,
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  MAIL_FROM_NAME: z.string().default('Pixel Eye Hospitals'),
  MAIL_FROM_EMAIL: z.union([z.literal(''), z.string().email()]).default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
});

export type Environment = z.infer<typeof environmentSchema> & { corsOrigins: string[] };

export function validateEnvironment(input: NodeJS.ProcessEnv): Environment {
  const selectedInput = selectStageEnvironment(input);
  const result = environmentSchema.safeParse(selectedInput);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const corsOrigins = result.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (corsOrigins.includes('*')) {
    throw new Error('Invalid environment configuration: CORS_ORIGINS cannot use wildcard when credentials are enabled');
  }
  const invalidOrigin = corsOrigins.some((origin) => !z.string().url().safeParse(origin).success);
  if (invalidOrigin) {
    throw new Error('Invalid environment configuration: CORS_ORIGINS must contain valid URLs');
  }

  if (result.data.NODE_ENV === 'production') {
    const requiredProductionKeys = [
      'DB_HOST',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
      'ADMIN_FRONTEND_URL',
      'PUBLIC_WEBSITE_URL',
      'CORS_ORIGINS',
      'JWT_ACCESS_SECRET'
    ] as const;
    const missing = requiredProductionKeys.filter((key) => !selectedInput[key]?.trim());
    if (missing.length > 0) {
      throw new Error(`Invalid production environment configuration: missing ${missing.join(', ')}`);
    }
  }

  return {
    ...result.data,
    corsOrigins
  };
}

export const env = validateEnvironment(process.env);













