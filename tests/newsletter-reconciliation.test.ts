import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  campaignFindAll: vi.fn(),
  campaignFindByPk: vi.fn(),
  deliveryFindAll: vi.fn(),
  transaction: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../src/config/database.js', () => ({
  sequelize: {
    transaction: mocks.transaction
  }
}));

vi.mock('../src/config/logger.js', () => ({
  logger: { error: mocks.loggerError }
}));

vi.mock('../src/modules/newsletters/newsletter-campaign.model.js', () => ({
  NewsletterCampaign: {
    findAll: mocks.campaignFindAll,
    findByPk: mocks.campaignFindByPk
  }
}));

vi.mock('../src/modules/newsletters/newsletter-delivery.model.js', () => ({
  NewsletterDelivery: { findAll: mocks.deliveryFindAll }
}));

vi.mock('../src/modules/blogs/blog.model.js', () => ({ Blog: class Blog {} }));
vi.mock('../src/modules/blogs/blog-version.model.js', () => ({ BlogVersion: class BlogVersion {} }));
vi.mock('../src/utils/api-error.js', () => ({
  ApiError: class ApiError extends Error {}
}));

import {
  deriveCampaignStatus,
  reconcileActiveCampaignsSweep
} from '../src/modules/newsletters/newsletter-campaign.service.js';

const emptyCounts = {
  total: 0,
  pending: 0,
  processing: 0,
  retryPending: 0,
  sent: 0,
  failed: 0,
  cancelled: 0,
  uncertain: 0
};

describe('newsletter campaign reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (_options: unknown, callback: (transaction: object) => unknown) =>
      callback({ LOCK: { UPDATE: 'UPDATE' } })
    );
    mocks.deliveryFindAll.mockResolvedValue([]);
  });

  it('treats uncertain deliveries as terminal failures and never reopens cancelled campaigns', () => {
    expect(deriveCampaignStatus('sending', {
      ...emptyCounts,
      total: 2,
      sent: 1,
      uncertain: 1
    })).toBe('partially_failed');
    expect(deriveCampaignStatus('sending', {
      ...emptyCounts,
      total: 1,
      uncertain: 1
    })).toBe('failed');
    expect(deriveCampaignStatus('cancelled', {
      ...emptyCounts,
      total: 1,
      pending: 1
    })).toBe('cancelled');
  });

  it('preserves paused while pending remains and permits terminal completion', () => {
    expect(deriveCampaignStatus('paused', { ...emptyCounts, total: 2, pending: 1, sent: 1 })).toBe('paused');
    expect(deriveCampaignStatus('paused', { ...emptyCounts, total: 2, sent: 2 })).toBe('completed');
    expect(deriveCampaignStatus('paused', { ...emptyCounts, total: 2, sent: 1, failed: 1 })).toBe('partially_failed');
  });

  it('limits the periodic sweep and continues after one campaign fails', async () => {
    const goodCampaign = {
      get: vi.fn((field: string) => field === 'status' ? 'sending' : null),
      update: vi.fn().mockResolvedValue(undefined)
    };
    mocks.campaignFindAll.mockResolvedValue([{ id: 'campaign-1' }, { id: 'campaign-2' }]);
    mocks.campaignFindByPk
      .mockRejectedValueOnce(new Error('row lock timeout'))
      .mockResolvedValueOnce(goodCampaign);

    const result = await reconcileActiveCampaignsSweep(2);

    expect(mocks.campaignFindAll).toHaveBeenCalledWith(expect.objectContaining({
      limit: 2,
      order: [['updatedAt', 'ASC']]
    }));
    expect(result).toEqual({ reconciled: 1, failed: 1 });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 'campaign-1' }),
      'Reconciliation sweep failed for campaign'
    );
  });
});
