import { describe, expect, it } from 'vitest';
import { getEnvironmentCompleteness, validateEnvironment } from '../src/config/environment.js';

describe('environment validation', () => {
  it('parses safe numeric and boolean values', () => {
    const result = validateEnvironment({
      NODE_ENV: 'test',
      PORT: '5001',
      DB_PORT: '3307',
      DB_LOGGING: 'true',
      SMTP_SECURE: 'false'
    });
    expect(result.PORT).toBe(5001);
    expect(result.DB_PORT).toBe(3307);
    expect(result.DB_LOGGING).toBe(true);
    expect(result.SMTP_SECURE).toBe(false);
  });


  it('reports missing required integration variables without exposing secret values', () => {
    const result = getEnvironmentCompleteness({ NODE_ENV: 'test', JWT_ACCESS_SECRET: 'super-secret-value-that-must-not-appear' });

    expect(result.r2.complete).toBe(false);
    expect(result.r2.missing).toContain('R2_ACCESS_KEY_ID');
    expect(JSON.stringify(result)).not.toContain('super-secret-value-that-must-not-appear');
  });

  it('rejects short JWT access secrets', () => {
    expect(() => validateEnvironment({ JWT_ACCESS_SECRET: 'short' })).toThrow('JWT_ACCESS_SECRET');
  });

  it('supports EMAIL_* aliases for local SMTP-style configuration', () => {
    const result = validateEnvironment({
      NODE_ENV: 'test',
      EMAIL_SERVICE: 'gmail',
      EMAIL_USER: 'sender@example.com',
      EMAIL_PASS: 'mail-secret',
      MAIL_FROM_EMAIL: 'sender@example.com'
    });

    expect(result.SMTP_HOST).toBe('gmail');
    expect(result.SMTP_USER).toBe('sender@example.com');
    expect(result.SMTP_PASSWORD).toBe('mail-secret');
  });
  it('rejects invalid ports', () => {
    expect(() => validateEnvironment({ PORT: '70000' })).toThrow('Invalid environment configuration');
  });

  it('requires deployment values in production without exposing values', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'Invalid production environment configuration'
    );
  });

  it('rejects invalid CORS origins', () => {
    expect(() => validateEnvironment({ CORS_ORIGINS: 'not-a-url' })).toThrow('CORS_ORIGINS');
  });
  it('selects the development database with the dev alias', () => {
    const result = validateEnvironment({
      APP_STAGE: 'dev',
      DEVELOPMENT_DB_HOST: 'development-db',
      DEVELOPMENT_DB_PORT: '3307',
      DEVELOPMENT_DB_NAME: 'pixel_eye_blog_development',
      DEVELOPMENT_DB_USER: 'development_user',
      DEVELOPMENT_DB_PASSWORD: 'development_password'
    });

    expect(result.APP_STAGE).toBe('development');
    expect(result.NODE_ENV).toBe('development');
    expect(result.DB_HOST).toBe('development-db');
    expect(result.DB_PORT).toBe(3307);
    expect(result.DB_NAME).toBe('pixel_eye_blog_development');
  });

  it('selects and validates the production database with the prod alias', () => {
    const result = validateEnvironment({
      APP_STAGE: 'prod',
      PRODUCTION_DB_HOST: 'production-db',
      PRODUCTION_DB_PORT: '3306',
      PRODUCTION_DB_NAME: 'pixel_eye_blog_production',
      PRODUCTION_DB_USER: 'production_user',
      PRODUCTION_DB_PASSWORD: 'production_password',
      ADMIN_FRONTEND_URL: 'https://admin.example.com',
      PUBLIC_WEBSITE_URL: 'https://example.com',
      CORS_ORIGINS: 'https://admin.example.com',
      JWT_ACCESS_SECRET: 'production-jwt-secret-with-32-chars-minimum'
    });

    expect(result.APP_STAGE).toBe('production');
    expect(result.NODE_ENV).toBe('production');
    expect(result.DB_HOST).toBe('production-db');
  });
});


