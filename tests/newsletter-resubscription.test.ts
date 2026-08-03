import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findByPk: vi.fn(), findOne: vi.fn(), create: vi.fn(), sendMail: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock('../src/config/environment.js', () => ({ env: { NEWSLETTER_HASH_SECRET: 'test-secret-at-least-thirty-two-characters' } }));
vi.mock('../src/config/database.js', () => ({ sequelize: { transaction: mocks.transaction } }));
vi.mock('../src/config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../src/modules/newsletters/newsletter-subscriber.model.js', () => ({ NewsletterSubscriber: { findByPk: mocks.findByPk, findOne: mocks.findOne, create: mocks.create } }));
vi.mock('../src/modules/newsletters/newsletter-delivery.model.js', () => ({ NewsletterDelivery: { findAll: vi.fn(), update: vi.fn() } }));
vi.mock('../src/modules/newsletters/newsletter-campaign.service.js', () => ({ reconcileCampaignState: vi.fn() }));
vi.mock('../src/services/integrations/mail.service.js', () => ({ isMailConfigured: () => true, createMailTransporter: () => ({ sendMail: mocks.sendMail }) }));
vi.mock('../src/modules/newsletters/email-templates.js', () => ({ generateVerificationEmail: vi.fn(), generateResubscriptionEmail: () => ({ subject: 'Confirm again', htmlBody: '<p>Confirm</p>', textBody: 'Confirm' }) }));
vi.mock('../src/modules/newsletters/newsletter-audit.service.js', () => ({ writeNewsletterAuditSafely: mocks.audit }));
vi.mock('../src/modules/newsletters/unsubscribe-token.service.js', () => ({ createUnsubscribeToken: vi.fn(), verifyUnsubscribeToken: vi.fn() }));

import { confirmSubscriberResubscription, requestSubscriberResubscription } from '../src/modules/newsletters/newsletter-subscription.service.js';

function subscriber(status = 'unsubscribed') {
  const values: Record<string, any> = { id: '4', email: 'reader@example.com', status, deletedAt: null, resubscriptionRequestedAt: null };
  return { id: '4', get: (field: string) => values[field], update: vi.fn(async (updates: Record<string, unknown>) => Object.assign(values, updates)) };
}

describe('newsletter resubscription lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (_options: unknown, callback: (t: any) => unknown) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
    mocks.sendMail.mockResolvedValue({ messageId: 'mocked' });
    mocks.audit.mockResolvedValue(true);
  });
  it('keeps an unsubscribed subscriber ineligible after sending a new request', async () => {
    const row = subscriber();
    mocks.findByPk.mockResolvedValue(row);
    const result = await requestSubscriberResubscription('4', '1');
    expect(row.get('status')).toBe('unsubscribed');
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ resubscriptionTokenHash: expect.any(String), resubscriptionExpiresAt: expect.any(Date) }), expect.anything());
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(result.emailSent).toBe(true);
  });
  it('subscribes only after a valid one-time resubscription token is confirmed', async () => {
    const row = subscriber();
    mocks.findOne.mockResolvedValue(row);
    const result = await confirmSubscriberResubscription('valid-token');
    expect(result.success).toBe(true);
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'subscribed', unsubscribedAt: null, resubscriptionTokenHash: null }), expect.anything());
  });
  it('does not subscribe for an expired or already-used token', async () => {
    mocks.findOne.mockResolvedValue(null);
    await expect(confirmSubscriberResubscription('expired-token')).rejects.toThrow(/invalid, expired, or already used/);
  });
});
