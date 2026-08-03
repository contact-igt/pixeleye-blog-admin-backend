import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  subscriberFindAll: vi.fn(),
  audit: vi.fn()
}));

vi.mock('../src/modules/newsletters/newsletter-subscriber.model.js', () => ({
  NewsletterSubscriber: {
    findAll: mocks.subscriberFindAll,
    findAndCountAll: vi.fn(),
    findByPk: vi.fn(),
    findOne: vi.fn(),
    count: vi.fn(),
    create: vi.fn()
  }
}));
vi.mock('../src/modules/newsletters/newsletter-delivery.model.js', () => ({
  NewsletterDelivery: { count: vi.fn(), findAll: vi.fn(), update: vi.fn() }
}));
vi.mock('../src/modules/newsletters/newsletter-campaign.service.js', () => ({
  reconcileCampaignState: vi.fn()
}));
vi.mock('../src/modules/admin/auth/auth-audit.service.js', () => ({
  writeAuthAuditLog: mocks.audit
}));
vi.mock('../src/modules/newsletters/newsletter-subscription.service.js', () => ({
  generateToken: vi.fn(),
  hashToken: vi.fn(),
  normalizeEmail: vi.fn(),
  requestSubscriberResubscription: vi.fn()
}));
vi.mock('../src/modules/newsletters/unsubscribe-token.service.js', () => ({
  createUnsubscribeToken: vi.fn()
}));
vi.mock('../src/services/integrations/mail.service.js', () => ({
  createMailTransporter: vi.fn(),
  isMailConfigured: vi.fn()
}));
vi.mock('../src/modules/newsletters/email-templates.js', () => ({
  generateSmtpDiagnosticEmail: vi.fn(),
  generateVerificationEmail: vi.fn()
}));
vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../src/config/database.js', () => ({
  sequelize: { transaction: vi.fn() }
}));

import { createAdminSubscriberController } from '../src/modules/newsletters/admin-subscriber.controller.js';

function response() {
  const value: any = {};
  value.setHeader = vi.fn();
  value.send = vi.fn(() => value);
  value.status = vi.fn(() => value);
  value.json = vi.fn(() => value);
  return value;
}

async function exportCsv(query: Record<string, unknown> = {}, requestOverrides: Record<string, unknown> = {}) {
  const res = response();
  const next = vi.fn();
  const request = {
    query,
    authenticatedAdmin: { id: 'admin-1', role: 'editor' },
    ...requestOverrides
  };

  await createAdminSubscriberController().exportCsv(request as any, res, next);
  return { res, next };
}

describe('newsletter subscriber CSV export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscriberFindAll.mockResolvedValue([]);
    mocks.audit.mockResolvedValue(undefined);
  });

  it.each(['editor', 'super_admin'])('allows an authenticated %s actor', async (role) => {
    const { res, next } = await exportCsv({}, {
      authenticatedAdmin: { id: 'admin-1', role }
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledTimes(1);
  });

  it('rejects a request without authenticatedAdmin', async () => {
    const { res, next } = await exportCsv({}, { authenticatedAdmin: undefined });

    expect(res.send).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('uses authenticatedAdmin rather than request.user for the audit actor', async () => {
    await exportCsv({}, {
      authenticatedAdmin: { id: 'right-admin', role: 'editor' },
      user: { id: 'wrong-user' }
    });

    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SUBSCRIBER_CSV_EXPORTED',
      adminUserId: 'right-admin'
    }));
  });

  it('applies trimmed search, status, and source filters without pagination', async () => {
    await exportCsv({
      search: '  retina  ',
      status: 'pending',
      source: '  website  ',
      page: '3',
      limit: '10'
    });

    const options = mocks.subscriberFindAll.mock.calls[0][0];
    expect(options).not.toHaveProperty('limit');
    expect(options).not.toHaveProperty('offset');
    expect(options.where).toMatchObject({
      deletedAt: null,
      status: 'pending',
      source: 'website'
    });

    const emailFilterValues = Reflect.ownKeys(options.where.email).map((key) =>
      Reflect.get(options.where.email, key)
    );
    expect(emailFilterValues).toContain('%retina%');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        filters: { search: 'retina', status: 'pending', source: 'website' }
      })
    }));
  });

  it('returns a header-only CSV with download and no-cache headers for no matches', async () => {
    const { res } = await exportCsv();

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/^attachment; filename="subscribers_\d{4}-\d{2}-\d{2}\.csv"$/)
    );
    expect(res.send).toHaveBeenCalledWith(
      'Email,Status,Source,Consent Version,Consent Date,Verification Sent,Verified Date,Unsubscribed Date,Created Date'
    );
  });

  it('encodes every CSV cell and neutralizes spreadsheet formulas', async () => {
    mocks.subscriberFindAll.mockResolvedValue([{
      email: '=1+1',
      status: '+1',
      source: '-1',
      consentVersion: '@SUM(1,1)',
      consentAt: '\tformula',
      verificationSentAt: '\rformula',
      verifiedAt: 'line one\nline "two"',
      unsubscribedAt: null,
      createdAt: new Date('2026-08-03T10:00:00.000Z'),
      verificationTokenHash: 'must-not-leak',
      unsubscribeTokenHash: 'must-not-leak'
    }]);

    const { res } = await exportCsv();
    const csv = res.send.mock.calls[0][0] as string;
    const dataRow = csv.split('\r\n')[1];

    expect(dataRow).toContain("'=1+1");
    expect(dataRow).toContain("'+1");
    expect(dataRow).toContain("'-1");
    expect(dataRow).toContain("\"'@SUM(1,1)\"");
    expect(dataRow).toContain("'\tformula");
    expect(dataRow).toContain("'\rformula");
    expect(dataRow).toContain('\"line one\nline \"\"two\"\"\"');
    expect(dataRow).toContain('2026-08-03T10:00:00.000Z');
    expect(csv).not.toContain('must-not-leak');
  });
});
