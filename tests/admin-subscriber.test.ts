import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { sequelize } from '../src/config/database';
import { createApp } from '../src/app';
import { AdminUser } from '../src/modules/auth/index';
import { NewsletterSubscriber } from '../src/modules/newsletters/newsletter-subscriber.model';
import { NewsletterDelivery } from '../src/modules/newsletters/newsletter-delivery.model';
import { NewsletterCampaign } from '../src/modules/newsletters/newsletter-campaign.model';
import { createAdminSession, generateAccessToken } from '../src/services/security/jwt.service';

// Mock mail service
vi.mock('../src/services/integrations/mail.service', () => ({
  isMailConfigured: () => true,
  createMailTransporter: () => ({
    sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' })
  })
}));

describe('Admin Subscriber Management', () => {
  let app: any;
  let adminUser: any;
  let authToken: string;

  beforeAll(async () => {
    app = createApp();
    await sequelize.sync({ force: true });

    adminUser = await AdminUser.create({
      name: 'Test Admin',
      email: 'admin@test.com',
      passwordHash: 'hash',
      role: 'super_admin'
    });

    const session = await createAdminSession(String(adminUser.id), 'test-device');
    authToken = generateAccessToken({
      sub: String(adminUser.id),
      session_id: String(session.id)
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('POST /api/v1/admin/newsletter/subscribers', () => {
    it('should create a pending subscriber and send verification email', async () => {
      const response = await request(app)
        .post('/api/v1/admin/newsletter/subscribers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'newreader@example.com',
          source: 'admin_manual',
          consent_note: 'Requested via phone'
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe('newreader@example.com');
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.verification_sent_at).toBeTruthy();

      const subscriber = await NewsletterSubscriber.findOne({
        where: { email: 'newreader@example.com' }
      });
      expect(subscriber).toBeTruthy();
      expect(subscriber?.get('status')).toBe('pending');
      expect(subscriber?.get('verificationTokenHash')).toBeTruthy();
    });

    it('should reject admin directly creating subscribed subscriber', async () => {
      const response = await request(app)
        .post('/api/v1/admin/newsletter/subscribers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'reader@example.com',
          status: 'subscribed' // This should be ignored
        });

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('pending'); // Must be pending
    });

    it('should reject duplicate subscribed subscriber', async () => {
      await NewsletterSubscriber.create({
        email: 'subscribed@example.com',
        normalizedEmail: 'subscribed@example.com',
        status: 'subscribed',
        verificationTokenHash: 'hash',
        unsubscribeTokenHash: 'hash'
      });

      const response = await request(app)
        .post('/api/v1/admin/newsletter/subscribers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'subscribed@example.com'
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('already subscribed');
    });

    it('should allow re-subscribing unsubscribed email', async () => {
      await NewsletterSubscriber.create({
        email: 'unsubscribed@example.com',
        normalizedEmail: 'unsubscribed@example.com',
        status: 'unsubscribed',
        unsubscribedAt: new Date(),
        unsubscribeTokenHash: 'hash'
      });

      const response = await request(app)
        .post('/api/v1/admin/newsletter/subscribers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'unsubscribed@example.com'
        });

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('pending');

      const subscriber = await NewsletterSubscriber.findOne({
        where: { email: 'unsubscribed@example.com' }
      });
      expect(subscriber?.get('status')).toBe('pending');
      expect(subscriber?.get('unsubscribedAt')).toBeNull();
    });

    it('should enforce resend cooldown for pending subscribers', async () => {
      const email = 'pending@example.com';
      await NewsletterSubscriber.create({
        email,
        normalizedEmail: email,
        status: 'pending',
        verificationTokenHash: 'hash',
        lastVerificationSentAt: new Date()
      });

      const response = await request(app)
        .post('/api/v1/admin/newsletter/subscribers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email });

      expect(response.status).toBe(429);
      expect(response.body.message).toContain('wait');
    });

    it('should reject without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/admin/newsletter/subscribers')
        .send({
          email: 'test@example.com'
        });

      expect(response.status).toBe(401);
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/admin/newsletter/subscribers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'not-an-email'
        });

      expect(response.status).toBe(422);
    });
  });

  describe('POST /api/v1/admin/newsletter/subscribers/:id/resend-verification', () => {
    it('should resend verification to pending subscriber', async () => {
      const subscriber = await NewsletterSubscriber.create({
        email: 'resend@example.com',
        normalizedEmail: 'resend@example.com',
        status: 'pending',
        verificationTokenHash: 'hash',
        lastVerificationSentAt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      });

      const response = await request(app)
        .post(`/api/v1/admin/newsletter/subscribers/${subscriber.get('id')}/resend-verification`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('pending');

      const updated = await NewsletterSubscriber.findByPk(subscriber.get('id'));
      expect(updated?.get('verificationTokenHash')).not.toBe('hash');
    });

    it('should reject resend to non-pending subscriber', async () => {
      const subscriber = await NewsletterSubscriber.create({
        email: 'subscribed@example.com',
        normalizedEmail: 'subscribed@example.com',
        status: 'subscribed',
        verificationTokenHash: 'hash'
      });

      const response = await request(app)
        .post(`/api/v1/admin/newsletter/subscribers/${subscriber.get('id')}/resend-verification`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should enforce cooldown on resend', async () => {
      const subscriber = await NewsletterSubscriber.create({
        email: 'cooldown@example.com',
        normalizedEmail: 'cooldown@example.com',
        status: 'pending',
        verificationTokenHash: 'hash',
        lastVerificationSentAt: new Date() // Just now
      });

      const response = await request(app)
        .post(`/api/v1/admin/newsletter/subscribers/${subscriber.get('id')}/resend-verification`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(429);
    });
  });

  describe('DELETE /api/v1/admin/newsletter/subscribers/:id', () => {
    it('should hard delete subscriber without delivery history', async () => {
      const subscriber = await NewsletterSubscriber.create({
        email: 'nodelsub@example.com',
        normalizedEmail: 'nodelsub@example.com',
        status: 'pending',
        verificationTokenHash: 'hash'
      });

      const response = await request(app)
        .delete(`/api/v1/admin/newsletter/subscribers/${subscriber.get('id')}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'test_deletion' });

      expect(response.status).toBe(200);
      expect(response.body.data.deletion_mode).toBe('hard_delete');

      const deleted = await NewsletterSubscriber.findByPk(subscriber.get('id'));
      expect(deleted).toBeNull();
    });

    it('should anonymize subscriber with delivery history', async () => {
      const subscriber = await NewsletterSubscriber.create({
        email: 'withhistory@example.com',
        normalizedEmail: 'withhistory@example.com',
        status: 'subscribed',
        verificationTokenHash: 'hash',
        unsubscribeTokenHash: 'hash'
      });

      const campaign = await NewsletterCampaign.create({
        blogId: '1',
        blogVersionId: '1',
        subject: 'Test Campaign',
        status: 'completed',
        totalRecipients: 1,
        createdBy: String(adminUser.id)
      });

      await NewsletterDelivery.create({
        campaignId: String(campaign.get('id')),
        subscriberId: String(subscriber.get('id')),
        status: 'sent',
        sentAt: new Date()
      });

      const response = await request(app)
        .delete(`/api/v1/admin/newsletter/subscribers/${subscriber.get('id')}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'gdpr_request' });

      expect(response.status).toBe(200);
      expect(response.body.data.deletion_mode).toBe('anonymized');

      const anonymized = await NewsletterSubscriber.findByPk(subscriber.get('id'));
      expect(anonymized).toBeTruthy();
      expect(anonymized?.get('email')).toContain('deleted-subscriber-');
      expect(anonymized?.get('status')).toBe('unsubscribed');
      expect(anonymized?.get('deletedAt')).toBeTruthy();
      expect(anonymized?.get('anonymizedAt')).toBeTruthy();
      expect(anonymized?.get('verificationTokenHash')).toBeNull();
      expect(anonymized?.get('unsubscribeTokenHash')).toBeNull();
    });

    it('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete('/api/v1/admin/newsletter/subscribers/999')
        .send({});

      expect(response.status).toBe(401);
    });

    it('should return 404 for nonexistent subscriber', async () => {
      const response = await request(app)
        .delete('/api/v1/admin/newsletter/subscribers/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(404);
    });
  });
});
