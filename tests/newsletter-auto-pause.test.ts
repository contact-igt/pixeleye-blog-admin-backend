import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ campaignFindByPk: vi.fn(), campaignFindAll: vi.fn(), campaignUpdate: vi.fn(), deliveryFindAll: vi.fn(), deliveryCount: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock('../src/config/environment.js', () => ({ env: { NEWSLETTER_AUTO_PAUSE_CONSECUTIVE_ERRORS: 3, NEWSLETTER_AUTO_PAUSE_MIN_ATTEMPTS: 4, NEWSLETTER_AUTO_PAUSE_FAILURE_PERCENT: 50, NEWSLETTER_RATE_LIMIT_PAUSE_SECONDS: 300 } }));
vi.mock('../src/config/database.js', () => ({ sequelize: { transaction: mocks.transaction } }));
vi.mock('../src/modules/newsletters/newsletter-campaign.model.js', () => ({ NewsletterCampaign: { findByPk: mocks.campaignFindByPk, findAll: mocks.campaignFindAll, update: mocks.campaignUpdate } }));
vi.mock('../src/modules/newsletters/newsletter-delivery.model.js', () => ({ NewsletterDelivery: { findAll: mocks.deliveryFindAll, count: mocks.deliveryCount } }));
vi.mock('../src/modules/newsletters/newsletter-audit.service.js', () => ({ writeNewsletterAuditSafely: mocks.audit }));

import { autoPauseActiveCampaignsForSmtp, autoPauseCampaignForDeliveryFailures, autoResumeDueRateLimitedCampaigns } from '../src/modules/newsletters/newsletter-auto-pause.service.js';

describe('newsletter automatic Campaign pause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (t: any) => unknown) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
    mocks.audit.mockResolvedValue(true);
  });
  it('auto-pauses after the configured consecutive provider rate-limit threshold', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    mocks.campaignFindByPk.mockResolvedValue({ get: (field: string) => field === 'status' ? 'sending' : null, update });
    mocks.deliveryFindAll.mockResolvedValue([421, 451, 429].map((code) => ({ status: 'retry_pending', lastErrorCode: `DELIVERY_PROVIDER_RATE_LIMIT_${code}`, lastErrorMessage: null })));
    expect(await autoPauseCampaignForDeliveryFailures('9')).toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused', autoPaused: true, pauseReasonCode: 'provider_rate_limited', resumeAt: expect.any(Date) }), expect.anything());
  });
  it('auto-pauses active Campaigns globally for SMTP authentication/configuration failure', async () => {
    mocks.campaignFindAll.mockResolvedValue([{ id: '1' }, { id: '2' }]);
    mocks.campaignUpdate.mockResolvedValue([2]);
    expect(await autoPauseActiveCampaignsForSmtp()).toBe(2);
    expect(mocks.campaignUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused', pauseReasonCode: 'smtp_unavailable', resumeAt: null }), expect.anything());
  });
  it('auto-pauses after the configured high Campaign failure percentage', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    mocks.campaignFindByPk.mockResolvedValue({ get: (field: string) => field === 'status' ? 'sending' : null, update });
    mocks.deliveryFindAll.mockResolvedValue([
      { status: 'failed', lastErrorCode: 'DELIVERY_PERMANENT_FAILURE' },
      { status: 'failed', lastErrorCode: 'DELIVERY_PERMANENT_FAILURE' },
      { status: 'sent', lastErrorCode: null },
      { status: 'sent', lastErrorCode: null }
    ]);
    expect(await autoPauseCampaignForDeliveryFailures('10')).toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ pauseReasonCode: 'high_failure_rate', resumeAt: null }), expect.anything());
  });
  it('auto-resumes only due provider-rate-limit pauses with pending deliveries', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const row = { id: '11', get: (field: string) => ({ status: 'paused', pauseReasonCode: 'provider_rate_limited', startedAt: null } as Record<string, unknown>)[field], update };
    mocks.campaignFindAll.mockResolvedValue([{ id: '11' }]); mocks.campaignFindByPk.mockResolvedValue(row); mocks.deliveryCount.mockResolvedValue(1);
    expect(await autoResumeDueRateLimitedCampaigns()).toBe(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued', autoPaused: false, resumeAt: null }), expect.anything());
  });
});
