import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../src/config/environment.js';

describe('newsletter Worker timing configuration', () => {
  it('keeps heartbeat, stale, and poll values in milliseconds', () => {
    const parsed = validateEnvironment({
      ...process.env,
      APP_STAGE: 'local',
      NODE_ENV: 'test',
      NEWSLETTER_WORKER_HEARTBEAT_INTERVAL_MS: '10000',
      NEWSLETTER_WORKER_HEARTBEAT_STALE_MS: '45000',
      NEWSLETTER_WORKER_POLL_INTERVAL_MS: '10000'
    });
    expect(parsed.NEWSLETTER_WORKER_HEARTBEAT_INTERVAL_MS).toBe(10_000);
    expect(parsed.NEWSLETTER_WORKER_HEARTBEAT_STALE_MS).toBe(45_000);
    expect(parsed.NEWSLETTER_WORKER_POLL_INTERVAL_MS).toBe(10_000);
  });

  it('rejects negative values and a stale threshold below three heartbeat intervals', () => {
    expect(() => validateEnvironment({
      ...process.env,
      APP_STAGE: 'local',
      NODE_ENV: 'test',
      NEWSLETTER_WORKER_HEARTBEAT_INTERVAL_MS: '10000',
      NEWSLETTER_WORKER_HEARTBEAT_STALE_MS: '29999',
      NEWSLETTER_WORKER_POLL_INTERVAL_MS: '-1'
    })).toThrow(/Invalid environment configuration/);
  });
});
