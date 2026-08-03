import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readWorkerHealth: vi.fn() }));

vi.mock('../src/modules/newsletters/newsletter-campaign.model.js', () => ({ NewsletterCampaign: class {} }));
vi.mock('../src/modules/newsletters/newsletter-delivery.model.js', () => ({ NewsletterDelivery: class {} }));
vi.mock('../src/modules/newsletters/newsletter-subscriber.model.js', () => ({ NewsletterSubscriber: class {} }));
vi.mock('../src/modules/blogs/blog.model.js', () => ({ Blog: class {} }));
vi.mock('../src/modules/blogs/blog-version.model.js', () => ({ BlogVersion: class {} }));
vi.mock('../src/modules/media/media.model.js', () => ({ MediaAsset: class {} }));
vi.mock('../src/services/integrations/mail.service.js', () => ({ createMailTransporter: vi.fn(), isMailConfigured: vi.fn() }));
vi.mock('../src/modules/newsletters/email-templates.js', () => ({ generateCampaignEmail: vi.fn() }));
vi.mock('../src/modules/newsletters/newsletter-campaign.service.js', () => ({ reconcileCampaignState: vi.fn() }));
vi.mock('../src/config/database.js', () => ({ sequelize: {} }));
vi.mock('../src/modules/newsletters/newsletter-audit.service.js', () => ({ writeNewsletterAuditSafely: vi.fn() }));
vi.mock('../src/modules/newsletters/newsletter-errors.js', () => ({ newsletterError: vi.fn(), newsletterErrorCodes: {} }));
vi.mock('../src/modules/newsletters/newsletter-eligibility.js', () => ({ eligibleSubscriberWhere: {}, isEligibleSubscriber: vi.fn() }));
vi.mock('../src/modules/newsletters/newsletter-worker-health.js', () => ({ readWorkerHealth: mocks.readWorkerHealth }));

import { createAdminCampaignController } from '../src/modules/newsletters/admin-campaign.controller.js';

describe('newsletter Worker health API', () => {
  it('queries fresh health and disables response caching', async () => {
    const health = { worker_status: 'active', claim_status: 'idle' };
    mocks.readWorkerHealth.mockResolvedValue(health);
    const headers = new Map<string, string>();
    const response = {
      set: vi.fn((name: string, value: string) => { headers.set(name, value); return response; }),
      status: vi.fn(() => response),
      json: vi.fn(() => response)
    };
    const next = vi.fn();

    await createAdminCampaignController().workerHealth({} as never, response as never, next);

    expect(mocks.readWorkerHealth).toHaveBeenCalledTimes(1);
    expect(headers.get('Cache-Control')).toContain('no-store');
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ data: health }));
    expect(next).not.toHaveBeenCalled();
  });
});
