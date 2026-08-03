import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ campaignFindByPk: vi.fn(), deliveryCount: vi.fn(), reconcile: vi.fn(), audit: vi.fn(), readHealth: vi.fn(), transaction: vi.fn() }));
vi.mock('../src/modules/newsletters/newsletter-campaign.model.js', () => ({ NewsletterCampaign: { findByPk: mocks.campaignFindByPk, findAndCountAll: vi.fn(), count: vi.fn(), create: vi.fn() } }));
vi.mock('../src/modules/newsletters/newsletter-delivery.model.js', () => ({ NewsletterDelivery: { count: mocks.deliveryCount, findAll: vi.fn(), update: vi.fn(), bulkCreate: vi.fn() } }));
vi.mock('../src/modules/newsletters/newsletter-subscriber.model.js', () => ({ NewsletterSubscriber: { findAll: vi.fn() } }));
vi.mock('../src/modules/blogs/blog.model.js', () => ({ Blog: class Blog {} }));
vi.mock('../src/modules/blogs/blog-version.model.js', () => ({ BlogVersion: class BlogVersion {} }));
vi.mock('../src/modules/media/media.model.js', () => ({ MediaAsset: class MediaAsset {} }));
vi.mock('../src/services/integrations/mail.service.js', () => ({ createMailTransporter: vi.fn(), isMailConfigured: vi.fn() }));
vi.mock('../src/modules/newsletters/email-templates.js', () => ({ generateCampaignEmail: vi.fn() }));
vi.mock('../src/modules/newsletters/newsletter-campaign.service.js', () => ({ reconcileCampaignState: mocks.reconcile }));
vi.mock('../src/config/database.js', () => ({ sequelize: { transaction: mocks.transaction } }));
vi.mock('../src/modules/newsletters/newsletter-audit.service.js', () => ({ writeNewsletterAuditSafely: mocks.audit }));
vi.mock('../src/modules/newsletters/newsletter-eligibility.js', () => ({ eligibleSubscriberWhere: {}, isEligibleSubscriber: vi.fn() }));
vi.mock('../src/modules/newsletters/newsletter-worker-health.js', () => ({ readWorkerHealth: mocks.readHealth }));

import { createAdminCampaignController } from '../src/modules/newsletters/admin-campaign.controller.js';

function campaign(status: string) {
  const data: Record<string, any> = { id: '8', blogId: '1', blogVersionId: '2', subject: 'Eye care', previewText: null, status, totalRecipients: 2, queuedCount: 2, sentCount: 0, failedCount: 0, cancelledCount: 0, createdBy: '1', queuedAt: new Date(), startedAt: status === 'sending' ? new Date() : null, completedAt: null, pausedAt: null, pausedBy: null, pauseReasonCode: null, pauseReasonMessage: null, autoPaused: false, resumeAt: null, createdAt: new Date(), updatedAt: new Date() };
  return { get: (field?: string | { plain: true }) => typeof field === 'string' ? data[field] : data, update: vi.fn(async (values: Record<string, unknown>) => Object.assign(data, values)), destroy: vi.fn() };
}
function response() { const value: any = {}; value.status = vi.fn(() => value); value.json = vi.fn(() => value); return value; }

describe('Campaign pause/resume/delete actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (t: any) => unknown) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
    mocks.audit.mockResolvedValue(true);
    mocks.reconcile.mockResolvedValue(null);
    mocks.readHealth.mockResolvedValue({ worker_status: 'active', database_status: 'ready', smtp_status: 'ready' });
  });
  it.each(['queued', 'sending'])('%s Campaign can pause without changing delivery rows', async (status) => {
    const row = campaign(status);
    mocks.campaignFindByPk.mockResolvedValue(row);
    const next = vi.fn();
    await createAdminCampaignController().pause({ params: { id: '8' }, body: {}, authenticatedAdmin: { id: '1' } } as any, response(), next);
    expect(next).not.toHaveBeenCalled();
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused', autoPaused: false }), expect.anything());
  });
  it('resumes existing delivery rows without creating duplicates', async () => {
    const row = campaign('paused');
    mocks.campaignFindByPk.mockResolvedValue(row);
    mocks.deliveryCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const next = vi.fn();
    await createAdminCampaignController().resume({ params: { id: '8' }, body: {}, authenticatedAdmin: { id: '1' } } as any, response(), next);
    expect(next).not.toHaveBeenCalled();
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued', pausedAt: null }), expect.anything());
  });
  it('hard-deletes a draft with no deliveries', async () => {
    const row = campaign('draft'); mocks.campaignFindByPk.mockResolvedValue(row); mocks.deliveryCount.mockResolvedValue(0);
    await createAdminCampaignController().delete({ params: { id: '8' }, body: {}, authenticatedAdmin: { id: '1' } } as any, response(), vi.fn());
    expect(row.destroy).toHaveBeenCalled();
  });
  it('rejects active Campaign deletion', async () => {
    mocks.campaignFindByPk.mockResolvedValue(campaign('queued')); const next = vi.fn();
    await createAdminCampaignController().delete({ params: { id: '8' }, body: {}, authenticatedAdmin: { id: '1' } } as any, response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });
  it('soft-deletes a terminal Campaign and preserves deliveries', async () => {
    const row = campaign('completed'); mocks.campaignFindByPk.mockResolvedValue(row);
    await createAdminCampaignController().delete({ params: { id: '8' }, body: {}, authenticatedAdmin: { id: '1' } } as any, response(), vi.fn());
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date), deletedBy: '1' }), expect.anything());
    expect(mocks.deliveryCount).not.toHaveBeenCalled();
  });
});
