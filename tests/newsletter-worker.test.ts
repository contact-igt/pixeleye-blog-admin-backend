import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  query: vi.fn(),
  deliveryUpdate: vi.fn(),
  subscriberFindByPk: vi.fn(),
  campaignFindByPk: vi.fn(),
  sendMail: vi.fn(),
  reconcileCampaignState: vi.fn(),
  reconcileActiveCampaignsSweep: vi.fn(),
  authenticateDatabase: vi.fn(),
  verifyMailConnection: vi.fn(),
  markWorkerDatabaseState: vi.fn(),
  markWorkerSmtpState: vi.fn(),
  recordWorkerPollFailure: vi.fn(),
  recordWorkerPollSuccess: vi.fn(),
  recordWorkerClaimSuccess: vi.fn(),
  recordWorkerSendSuccess: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('../src/config/database.js', () => ({
  authenticateDatabase: mocks.authenticateDatabase,
  sequelize: {
    transaction: mocks.transaction,
    query: mocks.query
  }
}));

vi.mock('../src/config/environment.js', () => ({
  env: {
    NEWSLETTER_WORKER_BATCH_SIZE: 2,
    NEWSLETTER_MAX_ATTEMPTS: 3,
    NEWSLETTER_RETRY_BASE_DELAY_SECONDS: 60,
    NEWSLETTER_WORKER_CONCURRENCY: 2,
    NEWSLETTER_WORKER_POLL_INTERVAL_MS: 10_000,
    PUBLIC_WEBSITE_URL: 'https://www.example.com',
    MAIL_FROM_EMAIL: 'newsletter@example.com'
  }
}));

vi.mock('../src/config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}));

vi.mock('../src/modules/newsletters/newsletter-delivery.model.js', () => ({
  NewsletterDelivery: { update: mocks.deliveryUpdate }
}));

vi.mock('../src/modules/newsletters/newsletter-subscriber.model.js', () => ({
  NewsletterSubscriber: { findByPk: mocks.subscriberFindByPk }
}));

vi.mock('../src/modules/newsletters/newsletter-campaign.model.js', () => ({
  NewsletterCampaign: { findByPk: mocks.campaignFindByPk }
}));

vi.mock('../src/modules/blogs/blog.model.js', () => ({ Blog: class Blog {} }));
vi.mock('../src/modules/blogs/blog-version.model.js', () => ({ BlogVersion: class BlogVersion {} }));
vi.mock('../src/modules/media/media.model.js', () => ({ MediaAsset: class MediaAsset {} }));

vi.mock('../src/services/integrations/mail.service.js', () => ({
  isMailConfigured: () => true,
  createMailTransporter: () => ({ sendMail: mocks.sendMail }),
  verifyMailConnection: mocks.verifyMailConnection,
  classifySmtpError: (error: any) => ({
    status: error?.code === 'EAUTH' ? 'auth_failed' : 'unavailable',
    code: error?.code || 'ESMTP', responseCode: null, command: null, message: `SMTP ${error?.code || 'ESMTP'}`
  })
}));

vi.mock('../src/modules/newsletters/email-templates.js', () => ({
  generateCampaignEmail: () => ({
    subject: 'Campaign subject',
    htmlBody: '<p>Campaign</p>',
    textBody: 'Campaign'
  })
}));

vi.mock('../src/modules/newsletters/unsubscribe-token.service.js', () => ({
  createUnsubscribeToken: () => 'unsubscribe-token'
}));

vi.mock('../src/modules/newsletters/newsletter-campaign.service.js', () => ({
  reconcileCampaignState: mocks.reconcileCampaignState,
  reconcileActiveCampaignsSweep: mocks.reconcileActiveCampaignsSweep
}));

vi.mock('../src/modules/newsletters/newsletter-worker-health.js', () => ({
  markWorkerDatabaseState: mocks.markWorkerDatabaseState,
  markWorkerSmtpState: mocks.markWorkerSmtpState,
  recordWorkerPollFailure: mocks.recordWorkerPollFailure,
  recordWorkerPollSuccess: mocks.recordWorkerPollSuccess,
  recordWorkerClaimSuccess: mocks.recordWorkerClaimSuccess,
  recordWorkerSendSuccess: mocks.recordWorkerSendSuccess
}));

vi.mock('../src/modules/newsletters/newsletter-auto-pause.service.js', () => ({
  autoPauseActiveCampaignsForSmtp: vi.fn().mockResolvedValue(0),
  autoPauseCampaignForDeliveryFailures: vi.fn().mockResolvedValue(false),
  autoResumeDueRateLimitedCampaigns: vi.fn().mockResolvedValue(0)
}));

import {
  claimDeliveries,
  processDeliveryBatch,
  processDeliveries,
  runPollingIteration,
  setInitialWorkerReadiness
} from '../src/workers/newsletter-delivery.worker.js';

const claimedDelivery = {
  id: 'delivery-1',
  campaign_id: 'campaign-1',
  subscriber_id: 'subscriber-1',
  attempt_count: 0,
  next_attempt_at: null,
  processing_started_at: null,
  provider_message_id: null
};

function eligibleSubscriber() {
  return {
    get: () => ({
      id: 'subscriber-1',
      email: 'reader@example.com',
      normalizedEmail: 'reader@example.com',
      status: 'subscribed',
      deletedAt: null
    })
  };
}

function sendableCampaign(status = 'sending') {
  return {
    get: () => ({
      id: 'campaign-1',
      subject: 'Campaign subject',
      previewText: 'Preview',
      status,
      blog: { slug: 'eye-care' },
      blogVersion: {
        title: 'Eye care',
        excerpt: 'Article excerpt',
        featuredMedia: null
      }
    })
  };
}

describe('newsletter worker delivery claiming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (transaction: object) => unknown) =>
      callback({ id: 'transaction-1' })
    );
    mocks.query.mockResolvedValue([claimedDelivery]);
    mocks.deliveryUpdate.mockResolvedValue([1]);
    mocks.reconcileActiveCampaignsSweep.mockResolvedValue({ reconciled: 0, failed: 0 });
    mocks.authenticateDatabase.mockResolvedValue(undefined);
    mocks.verifyMailConnection.mockResolvedValue(undefined);
    mocks.recordWorkerPollSuccess.mockResolvedValue(undefined);
    mocks.recordWorkerClaimSuccess.mockResolvedValue(undefined);
    mocks.recordWorkerPollFailure.mockResolvedValue(undefined);
    mocks.recordWorkerSendSuccess.mockResolvedValue(undefined);
  });

  it('uses a MariaDB 10.4-compatible locking read and updates in the same transaction', async () => {
    const claimed = await claimDeliveries();

    expect(claimed).toEqual([claimedDelivery]);
    const [sql, queryOptions] = mocks.query.mock.calls[0]!;
    expect(sql).toMatch(/\bFOR UPDATE\s*$/);
    expect(sql).not.toMatch(/SKIP\s+LOCKED/i);
    expect(sql).toMatch(/status IN \('queued', 'sending'\)/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(queryOptions.transaction).toEqual({ id: 'transaction-1' });
    expect(mocks.deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'processing',
        nextAttemptAt: null,
        lastErrorCode: null,
        lastErrorMessage: null
      }),
      expect.objectContaining({
        transaction: { id: 'transaction-1' }
      })
    );
  });

  it('serializes concurrent claim transactions so a delivery is returned once', async () => {
    let transactionTail = Promise.resolve();
    let isPending = true;

    mocks.transaction.mockImplementation((callback: (transaction: object) => Promise<unknown>) => {
      const result = transactionTail.then(() => callback({ id: 'locked-transaction' }));
      transactionTail = result.then(() => undefined, () => undefined);
      return result;
    });
    mocks.query.mockImplementation(async () => isPending ? [claimedDelivery] : []);
    mocks.deliveryUpdate.mockImplementation(async () => {
      isPending = false;
      return [1];
    });

    const claims = await Promise.all([claimDeliveries(), claimDeliveries()]);

    expect(claims.flat().map((delivery) => delivery.id)).toEqual(['delivery-1']);
    expect(mocks.deliveryUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('newsletter worker delivery lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deliveryUpdate.mockResolvedValue([1]);
    mocks.subscriberFindByPk.mockResolvedValue(eligibleSubscriber());
    mocks.campaignFindByPk.mockResolvedValue(sendableCampaign());
    mocks.sendMail.mockResolvedValue({ messageId: '<provider-message@example.com>' });
  });

  it('finalizes a successful send and clears stale lifecycle fields', async () => {
    await processDeliveryBatch([claimedDelivery]);

    expect(mocks.deliveryUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.deliveryUpdate.mock.calls[1]![0]).toMatchObject({
      status: 'sent',
      providerMessageId: '<provider-message@example.com>',
      processingStartedAt: null,
      nextAttemptAt: null,
      failedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      failureReason: null
    });
  });

  it('marks a successfully accepted message uncertain when finalization matches no row', async () => {
    mocks.deliveryUpdate
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([0])
      .mockResolvedValueOnce([1]);

    await processDeliveryBatch([claimedDelivery]);

    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.deliveryUpdate.mock.calls[2]![0]).toMatchObject({
      status: 'uncertain',
      lastErrorCode: 'DELIVERY_FINALIZATION_UNCERTAIN',
      processingStartedAt: null,
      nextAttemptAt: null,
      failedAt: null
    });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: 'delivery-1' }),
      'Delivery finalization uncertain'
    );
  });

  it('moves a temporary send failure to retry_pending and clears stale terminal fields', async () => {
    mocks.sendMail.mockRejectedValueOnce(new Error('SMTP connection timed out'));

    await processDeliveryBatch([claimedDelivery]);

    expect(mocks.deliveryUpdate.mock.calls[1]![0]).toMatchObject({
      status: 'retry_pending',
      attemptCount: 1,
      processingStartedAt: null,
      failedAt: null,
      sentAt: null
    });
    expect(mocks.deliveryUpdate.mock.calls[1]![0].nextAttemptAt).toBeInstanceOf(Date);
  });

  it('allows an already processing delivery to finish after its Campaign is paused', async () => {
    mocks.campaignFindByPk.mockResolvedValue(sendableCampaign('paused'));
    await processDeliveryBatch([claimedDelivery]);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.deliveryUpdate.mock.calls[1]![0]).toMatchObject({ status: 'sent' });
  });

  it('runs a bounded reconciliation sweep even when there is nothing to claim', async () => {
    mocks.transaction.mockImplementation(async (callback: (transaction: object) => unknown) =>
      callback({ id: 'transaction-1' })
    );
    mocks.query.mockResolvedValue([]);
    mocks.reconcileActiveCampaignsSweep.mockResolvedValue({ reconciled: 2, failed: 0 });

    await processDeliveries();

    expect(mocks.reconcileActiveCampaignsSweep).toHaveBeenCalledWith(2);
  });
});

describe('newsletter Worker durable polling loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInitialWorkerReadiness({ database: true, smtp: true });
    mocks.recordWorkerPollSuccess.mockResolvedValue(undefined);
    mocks.recordWorkerPollFailure.mockResolvedValue(undefined);
    mocks.reconcileActiveCampaignsSweep.mockResolvedValue({ reconciled: 0, failed: 0 });
  });

  it('runs startup reconciliation before processing pending deliveries', async () => {
    const order: string[] = [];
    const startupReconciler = vi.fn()
      .mockRejectedValueOnce(new Error('one reconciliation failed'))
      .mockImplementationOnce(async () => { order.push('reconcile'); });
    expect(await runPollingIteration(
      async () => { order.push('claim'); return 2; },
      startupReconciler
    )).toBe('failed');
    const result = await runPollingIteration(
      async () => { order.push('claim'); return 2; },
      startupReconciler
    );
    expect(result).toBe('completed');
    expect(order).toEqual(['reconcile', 'claim']);
    expect(startupReconciler).toHaveBeenCalledTimes(2);
  });

  it('records a claim failure separately and permits the next poll', async () => {
    mocks.transaction.mockImplementation(async (callback: (transaction: object) => unknown) => callback({ id: 'transaction-1' }));
    mocks.query.mockResolvedValueOnce([]).mockRejectedValueOnce(Object.assign(new Error('claim query failed'), { code: 'ER_LOCK_WAIT_TIMEOUT' }));
    expect(await runPollingIteration(processDeliveries)).toBe('failed');
    expect(mocks.recordWorkerPollFailure).toHaveBeenCalledWith(expect.any(String), expect.any(Error), true);
    expect(await runPollingIteration(async () => 0)).toBe('completed');
  });

  it('continues with a later poll after one failed iteration', async () => {
    const processor = vi.fn()
      .mockRejectedValueOnce(new Error('one poll failed'))
      .mockResolvedValueOnce(0);
    expect(await runPollingIteration(processor)).toBe('failed');
    expect(await runPollingIteration(processor)).toBe('completed');
    expect(processor).toHaveBeenCalledTimes(2);
    expect(mocks.recordWorkerPollFailure).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping polling iterations', async () => {
    let release!: () => void;
    const active = new Promise<void>((resolve) => { release = resolve; });
    const processor = vi.fn(async () => { await active; return 0; });
    const first = runPollingIteration(processor);
    await Promise.resolve();
    expect(await runPollingIteration(processor)).toBe('skipped');
    release();
    expect(await first).toBe('completed');
    expect(processor).toHaveBeenCalledTimes(1);
  });
});
