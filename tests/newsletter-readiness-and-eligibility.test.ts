import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ELIGIBLE_EMAIL_REGEXP,
  eligibleSubscriberWhere,
  isEligibleSubscriber
} from '../src/modules/newsletters/newsletter-eligibility.js';
import { classifySmtpError } from '../src/services/integrations/mail.service.js';

describe('SMTP readiness classification', () => {
  it('classifies wrapped Nodemailer EAUTH failures without exposing credentials', () => {
    const password = 'smtp-password-that-must-not-leak';
    const error = new Error('SMTP verification failed', {
      cause: Object.assign(new Error(`Authentication failed using ${password}`), {
        code: 'EAUTH',
        responseCode: 535,
        command: 'AUTH PLAIN'
      })
    });

    const result = classifySmtpError(error);

    expect(result).toEqual({
      status: 'auth_failed',
      code: 'EAUTH',
      responseCode: 535,
      command: 'AUTH PLAIN',
      message: 'SMTP EAUTH 535 (AUTH PLAIN)'
    });
    expect(JSON.stringify(result)).not.toContain(password);
  });
});

describe('shared subscriber eligibility', () => {
  it.each([
    {
      name: 'subscribed normalized address',
      subscriber: {
        status: 'subscribed',
        deletedAt: null,
        email: 'Reader@Example.com',
        normalizedEmail: 'reader@example.com'
      },
      expected: true
    },
    {
      name: 'unsubscribed address',
      subscriber: {
        status: 'unsubscribed',
        deletedAt: null,
        email: 'reader@example.com',
        normalizedEmail: 'reader@example.com'
      },
      expected: false
    },
    {
      name: 'soft-deleted address',
      subscriber: {
        status: 'subscribed',
        deletedAt: new Date(),
        email: 'reader@example.com',
        normalizedEmail: 'reader@example.com'
      },
      expected: false
    },
    {
      name: 'malformed address',
      subscriber: {
        status: 'subscribed',
        deletedAt: null,
        email: 'not-an-email',
        normalizedEmail: 'not-an-email'
      },
      expected: false
    },
    {
      name: 'anonymized deleted address',
      subscriber: {
        status: 'subscribed',
        deletedAt: null,
        email: 'deleted-subscriber-123@example.invalid',
        normalizedEmail: 'deleted-subscriber-123@example.invalid'
      },
      expected: false
    }
  ])('$name eligibility is $expected', ({ subscriber, expected }) => {
    expect(isEligibleSubscriber(subscriber as never)).toBe(expected);
  });

  it('keeps queue, preview, and worker wired to the shared eligibility module', async () => {
    const testDirectory = fileURLToPath(new URL('.', import.meta.url));
    const controllerSource = await readFile(
      fileURLToPath(new URL('../src/modules/newsletters/admin-campaign.controller.ts', import.meta.url)),
      'utf8'
    );
    const workerSource = await readFile(
      fileURLToPath(new URL('../src/workers/newsletter-delivery.worker.ts', import.meta.url)),
      'utf8'
    );

    expect(controllerSource).toContain(
      "import { eligibleSubscriberWhere, isEligibleSubscriber } from './newsletter-eligibility.js'"
    );
    expect(controllerSource).toMatch(/where:\s*eligibleSubscriberWhere/);
    expect(controllerSource.match(/isEligibleSubscriber\(subscriber\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(workerSource).toContain(
      "import { ELIGIBLE_EMAIL_REGEXP } from '../modules/newsletters/newsletter-eligibility.js'"
    );
    expect(workerSource).toContain('emailRegexp: ELIGIBLE_EMAIL_REGEXP');
    expect(testDirectory).toBeTruthy();
    expect(ELIGIBLE_EMAIL_REGEXP).toContain('@');
    expect(eligibleSubscriberWhere).toBeTruthy();
  });
});
