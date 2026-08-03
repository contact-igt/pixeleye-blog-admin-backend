import { describe, expect, it } from 'vitest';
import {
  generateCampaignEmail,
  generateSmtpDiagnosticEmail,
  generateVerificationEmail
} from '../src/modules/newsletters/email-templates.js';

describe('Pixel Eye email templates', () => {
  it('renders the verification email with Pixel Eye branding and the confirmation URL', () => {
    const verificationUrl = 'https://pixeleye.in/newsletter/verify?token=abc123&source=email';
    const template = generateVerificationEmail(verificationUrl, 'reader@example.com');

    expect(template.subject).toBe('Confirm Your Subscription to Pixel Eye Blog');
    expect(template.htmlBody).toContain('#293B77');
    expect(template.htmlBody).toContain('#D39A52');
    expect(template.htmlBody).toContain('/assets/Footer/brandlogo-white.png');
    expect(template.htmlBody).toContain('Confirm Subscription');
    expect(template.htmlBody).toContain('token=abc123&amp;source=email');
    expect(template.textBody).toContain(verificationUrl);
    expect(template.textBody).toContain('This link expires in');
  });

  it('renders a production campaign with preview text, image, article link and unsubscribe link', () => {
    const template = generateCampaignEmail({
      campaignSubject: 'Protect your vision',
      previewText: 'A practical guide from Pixel Eye',
      blogTitle: 'Five ways to protect your eyes',
      blogExcerpt: 'Simple habits that support long-term eye health.',
      blogSlug: 'protect-your-eyes',
      blogUrl: 'https://pixeleye.in/blog/protect-your-eyes',
      featuredImageUrl: 'https://media.example.com/eye-care.webp',
      unsubscribeUrl: 'https://pixeleye.in/newsletter/unsubscribe?token=unsubscribe-token'
    });

    expect(template.subject).toBe('Protect your vision');
    expect(template.htmlBody).toContain('A practical guide from Pixel Eye');
    expect(template.htmlBody).toContain('https://media.example.com/eye-care.webp');
    expect(template.htmlBody).toContain('Read Full Article');
    expect(template.htmlBody).toContain('https://pixeleye.in/blog/protect-your-eyes');
    expect(template.htmlBody).toContain('unsubscribe-token');
    expect(template.textBody).toContain('Unsubscribe:');
  });

  it('escapes campaign content and omits unsafe image URLs', () => {
    const template = generateCampaignEmail({
      campaignSubject: 'Campaign',
      blogTitle: '<script>alert("title")</script>',
      blogExcerpt: '<img src=x onerror=alert(1)>',
      blogSlug: 'safe-slug',
      blogUrl: 'https://pixeleye.in/blog/safe-slug',
      featuredImageUrl: 'javascript:alert(1)',
      unsubscribeUrl: 'https://pixeleye.in/newsletter/unsubscribe?token=safe'
    });

    expect(template.htmlBody).not.toContain('<script>');
    expect(template.htmlBody).not.toContain('<img src=x');
    expect(template.htmlBody).not.toContain('javascript:alert(1)');
    expect(template.htmlBody).toContain('&lt;script&gt;');
    expect(template.htmlBody).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('renders a campaign test variant without a functional unsubscribe link', () => {
    const template = generateCampaignEmail({
      campaignSubject: 'Campaign',
      blogTitle: 'Eye health',
      blogExcerpt: 'A useful article.',
      blogSlug: 'eye-health',
      blogUrl: 'https://pixeleye.in/blog/eye-health',
      unsubscribeUrl: '#',
      isTest: true
    });

    expect(template.subject).toBe('[TEST] Campaign');
    expect(template.htmlBody).toContain('Test email');
    expect(template.htmlBody).toContain('unsubscribe action is intentionally disabled');
    expect(template.htmlBody).not.toContain('href="#"');
    expect(template.textBody).not.toContain('Unsubscribe: #');
  });

  it('renders a standalone branded SMTP diagnostic email', () => {
    const timestamp = new Date('2026-07-30T12:00:00.000Z');
    const template = generateSmtpDiagnosticEmail({ timestamp });

    expect(template.subject).toBe('[TEST] Pixel Eye email delivery check');
    expect(template.htmlBody).toContain('Email delivery is working');
    expect(template.htmlBody).toContain(timestamp.toISOString());
    expect(template.htmlBody).toContain('/assets/Footer/brandlogo-white.png');
    expect(template.htmlBody).not.toContain('TEST_TOKEN');
    expect(template.textBody).toContain('No subscriber confirmation or unsubscribe action');
  });
});
