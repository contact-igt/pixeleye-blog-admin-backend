import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ subscriberFindByPk: vi.fn(), deliveryCount: vi.fn(), deliveryFindAll: vi.fn(), deliveryUpdate: vi.fn(), reconcile: vi.fn(), audit: vi.fn(), sendMail: vi.fn(), transaction: vi.fn() }));
vi.mock('../src/modules/newsletters/newsletter-subscriber.model.js', () => ({ NewsletterSubscriber: { findByPk: mocks.subscriberFindByPk, findOne: vi.fn(), findAll: vi.fn(), count: vi.fn(), create: vi.fn() } }));
vi.mock('../src/modules/newsletters/newsletter-delivery.model.js', () => ({ NewsletterDelivery: { count: mocks.deliveryCount, findAll: mocks.deliveryFindAll, update: mocks.deliveryUpdate } }));
vi.mock('../src/modules/newsletters/newsletter-campaign.service.js', () => ({ reconcileCampaignState: mocks.reconcile }));
vi.mock('../src/modules/admin/auth/auth-audit.service.js', () => ({ writeAuthAuditLog: mocks.audit }));
vi.mock('../src/modules/newsletters/newsletter-subscription.service.js', () => ({ generateToken: () => 'new-one-time-token', hashToken: (token: string) => `hash:${token}`, normalizeEmail: (email: string) => email.toLowerCase(), requestSubscriberResubscription: vi.fn() }));
vi.mock('../src/modules/newsletters/unsubscribe-token.service.js', () => ({ createUnsubscribeToken: vi.fn() }));
vi.mock('../src/services/integrations/mail.service.js', () => ({ isMailConfigured: () => true, createMailTransporter: () => ({ sendMail: mocks.sendMail }) }));
vi.mock('../src/modules/newsletters/email-templates.js', () => ({ generateVerificationEmail: () => ({ subject: 'Verify', htmlBody: '<p>Verify</p>', textBody: 'Verify' }), generateSmtpDiagnosticEmail: vi.fn() }));
vi.mock('../src/config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../src/config/database.js', () => ({ sequelize: { transaction: mocks.transaction } }));

import { createAdminSubscriberController } from '../src/modules/newsletters/admin-subscriber.controller.js';

function subscriber(status = 'pending') {
  const data: Record<string, any> = { id: '5', email: 'reader@example.com', status, source: 'website', consentText: null, consentVersion: 'v1', consentAt: new Date(), verificationSentAt: new Date(0), lastVerificationSentAt: new Date(0), verifiedAt: null, unsubscribedAt: null, resubscriptionRequestedAt: null, createdAt: new Date(), updatedAt: new Date() };
  return { id: '5', get: (value?: string | { plain: true }) => typeof value === 'string' ? data[value] : data, update: vi.fn(async (values: Record<string, unknown>) => Object.assign(data, values)), destroy: vi.fn() };
}
function response() { const value: any = {}; value.status = vi.fn(() => value); value.json = vi.fn(() => value); return value; }

describe('Subscriber delete and verification actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (t: any) => unknown) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
    mocks.audit.mockResolvedValue(undefined); mocks.reconcile.mockResolvedValue(null); mocks.sendMail.mockResolvedValue({ messageId: 'mocked' });
  });
  it('cancels pending/retry deliveries and reconciles affected Campaigns before anonymizing history', async () => {
    const row = subscriber('subscribed'); mocks.subscriberFindByPk.mockResolvedValue(row);
    mocks.deliveryCount.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    mocks.deliveryFindAll.mockResolvedValue([{ campaignId: '9' }]); mocks.deliveryUpdate.mockResolvedValue([1]);
    await createAdminSubscriberController().delete({ params: { id: '5' }, body: {}, authenticatedAdmin: { id: '1' } } as any, response(), vi.fn());
    expect(mocks.deliveryUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }), expect.anything());
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'unsubscribed', deletedAt: expect.any(Date), anonymizedAt: expect.any(Date) }), expect.anything());
    expect(mocks.reconcile).toHaveBeenCalledWith('9');
  });
  it('invalidates the old pending verification token and stores a new hash', async () => {
    const row = subscriber('pending'); mocks.subscriberFindByPk.mockResolvedValue(row);
    await createAdminSubscriberController().resendVerification({ params: { id: '5' }, authenticatedAdmin: { id: '1' } } as any, response(), vi.fn());
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ verificationTokenHash: 'hash:new-one-time-token', verificationExpiresAt: expect.any(Date) }), expect.anything());
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(row.get('status')).toBe('pending');
  });
});
