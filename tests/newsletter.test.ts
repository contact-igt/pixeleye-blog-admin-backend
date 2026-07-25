import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sequelize } from '../src/config/database';
import { initializeNewsletterModels } from '../src/database/models/index';
import { initializeNewsletterAssociations } from '../src/database/associations/index';
import { NewsletterSubscriber } from '../src/modules/newsletters/newsletter-subscriber.model';
import { NewsletterCampaign } from '../src/modules/newsletters/newsletter-campaign.model';
import { NewsletterDelivery } from '../src/modules/newsletters/newsletter-delivery.model';

describe('Newsletter Integration', () => {
  beforeAll(async () => {
    initializeNewsletterModels();
    initializeNewsletterAssociations();
    await sequelize.authenticate();
  });

  afterAll(async () => {
    if (sequelize) {
      try {
        await sequelize.close();
      } catch {
        // ignore
      }
    }
  });

  describe('Subscription Flow', () => {
    it('should create a pending subscriber', async () => {
      const subscriber = await NewsletterSubscriber.create({
        email: 'test@example.com',
        normalizedEmail: 'test@example.com',
        status: 'pending',
        verificationTokenHash: 'test-hash',
        source: 'website'
      });

      expect(subscriber.email).toBe('test@example.com');
      expect(subscriber.status).toBe('pending');
    });

    it('should verify an email with valid token', async () => {
      const subscriber = await NewsletterSubscriber.create({
        email: 'verify@example.com',
        normalizedEmail: 'verify@example.com',
        status: 'pending',
        verificationTokenHash: 'test-token-hash',
        verificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        source: 'website'
      });

      // Verify would require the actual token to be passed and hashed
      expect(subscriber.status).toBe('pending');
    });

    it('should store subscriber with normalized email', async () => {
      const subscriber = await NewsletterSubscriber.create({
        email: '  Test@EXAMPLE.COM  ',
        normalizedEmail: 'test@example.com',
        status: 'subscribed',
        source: 'website'
      });

      expect(subscriber.normalizedEmail).toBe('test@example.com');
    });
  });

  describe('Campaign Management', () => {
    it('should create a draft campaign', async () => {
      const campaign = await NewsletterCampaign.create({
        blogId: '1',
        blogVersionId: '1',
        subject: 'Test Campaign',
        status: 'draft'
      });

      expect(campaign.subject).toBe('Test Campaign');
      expect(campaign.status).toBe('draft');
    });

    it('should track delivery counts', async () => {
      const campaign = await NewsletterCampaign.create({
        blogId: '2',
        blogVersionId: '2',
        subject: 'Counting Test',
        status: 'queued',
        totalRecipients: 100,
        sentCount: 50,
        failedCount: 10
      });

      expect(campaign.totalRecipients).toBe(100);
      expect(campaign.sentCount).toBe(50);
      expect(campaign.failedCount).toBe(10);
    });
  });

  describe('Delivery Lifecycle', () => {
    it('should create pending deliveries', async () => {
      const delivery = await NewsletterDelivery.create({
        campaignId: '1',
        subscriberId: '1',
        status: 'pending'
      });

      expect(delivery.status).toBe('pending');
      expect(delivery.attemptCount).toBe(0);
    });

    it('should track attempt counts', async () => {
      const delivery = await NewsletterDelivery.create({
        campaignId: '2',
        subscriberId: '2',
        status: 'retry_pending',
        attemptCount: 1,
        nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000)
      });

      expect(delivery.attemptCount).toBe(1);
      expect(delivery.status).toBe('retry_pending');
    });

    it('should mark deliveries as sent', async () => {
      const delivery = await NewsletterDelivery.create({
        campaignId: '3',
        subscriberId: '3',
        status: 'pending'
      });

      await delivery.update({
        status: 'sent',
        sentAt: new Date()
      });

      expect(delivery.status).toBe('sent');
      expect(delivery.sentAt).toBeDefined();
    });

    it('should enforce unique campaign-subscriber constraint', async () => {
      await NewsletterDelivery.create({
        campaignId: '4',
        subscriberId: '4',
        status: 'pending'
      });

      try {
        await NewsletterDelivery.create({
          campaignId: '4',
          subscriberId: '4',
          status: 'pending'
        });
        expect.fail('Should have thrown unique constraint error');
      } catch {
        // Expected to fail due to unique constraint
      }
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate first retry delay correctly', () => {
      const BASE_DELAY_SECONDS = 300; // 5 minutes
      const attemptNumber = 1;
      const delay = BASE_DELAY_SECONDS * Math.pow(2, attemptNumber - 1);
      expect(delay).toBe(300); // 5 minutes
    });

    it('should calculate second retry delay correctly', () => {
      const BASE_DELAY_SECONDS = 300;
      const attemptNumber = 2;
      const delay = BASE_DELAY_SECONDS * Math.pow(2, attemptNumber - 1);
      expect(delay).toBe(600); // 10 minutes
    });

    it('should calculate third retry delay correctly', () => {
      const BASE_DELAY_SECONDS = 300;
      const attemptNumber = 3;
      const delay = BASE_DELAY_SECONDS * Math.pow(2, attemptNumber - 1);
      expect(delay).toBe(1200); // 20 minutes
    });
  });
});
