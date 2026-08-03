import {
  EMAIL_MAIL_FROM_NAME,
  EMAIL_PUBLIC_WEBSITE_URL,
  absoluteWebsiteUrl,
  emailBrand,
  escapeEmailHtml,
  escapeEmailMultilineText,
  renderBrandedEmailShell,
  renderEmailButton,
  renderEmailTestBanner,
  safeEmailHttpUrl
} from './email-theme.js';

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export function generateVerificationEmail(
  verificationUrl: string,
  _email: string
): EmailTemplate {
  const subject = 'Confirm Your Subscription to Pixel Eye Blog';
  const expiryHours = parseInt(process.env.NEWSLETTER_VERIFICATION_TOKEN_TTL_HOURS || '24', 10);
  const safeVerificationUrl = safeEmailHttpUrl(verificationUrl, EMAIL_PUBLIC_WEBSITE_URL) as string;
  const previewText = `Confirm your Pixel Eye newsletter subscription. This link expires in ${expiryHours} hours.`;

  const contentHtml = `
    <p style="color: ${emailBrand.gold}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; line-height: 18px; margin: 0 0 12px; text-align: center; text-transform: uppercase;">
      Pixel Eye Newsletter
    </p>
    <h1 class="email-title" style="color: ${emailBrand.heading}; font-family: 'Bricolage Grotesque', 'Segoe UI', Arial, sans-serif; font-size: 34px; font-weight: 700; letter-spacing: -0.5px; line-height: 41px; margin: 0 0 18px; text-align: center;">
      Confirm your subscription
    </h1>
    <p style="color: ${emailBrand.body}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 16px; line-height: 26px; margin: 0 0 28px; text-align: center;">
      Thank you for joining ${escapeEmailHtml(EMAIL_MAIL_FROM_NAME)}. Confirm your email address to receive trusted eye-health articles and updates.
    </p>
    ${renderEmailButton('Confirm Subscription', safeVerificationUrl)}
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${emailBrand.lightBlue}" style="background-color: ${emailBrand.lightBlue}; border: 1px solid ${emailBrand.border}; border-radius: 12px; margin: 30px 0 0;">
      <tr>
        <td style="padding: 18px 20px;">
          <p style="color: ${emailBrand.heading}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 700; line-height: 21px; margin: 0 0 4px;">Link expires in ${expiryHours} hours</p>
          <p style="color: ${emailBrand.body}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; line-height: 20px; margin: 0;">For your security, use the confirmation button before the link expires.</p>
        </td>
      </tr>
    </table>
    <p style="color: ${emailBrand.muted}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 19px; margin: 24px 0 7px;">If the button does not work, copy and paste this link into your browser:</p>
    <p style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 19px; margin: 0; overflow-wrap: anywhere; word-break: break-all;">
      <a href="${escapeEmailHtml(safeVerificationUrl)}" style="color: ${emailBrand.blue}; text-decoration: underline;">${escapeEmailHtml(safeVerificationUrl)}</a>
    </p>
    <div style="border-top: 1px solid ${emailBrand.border}; margin: 30px 0 20px;"></div>
    <p style="color: ${emailBrand.muted}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 19px; margin: 0 0 8px; text-align: center;">You will only receive emails when we publish new articles, and you can unsubscribe at any time.</p>
    <p style="color: ${emailBrand.muted}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 19px; margin: 0; text-align: center;">If you did not request this subscription, you can safely ignore this email.</p>
  `.trim();

  const htmlBody = renderBrandedEmailShell({ documentTitle: subject, previewText, contentHtml });
  const textBody = `
Confirm Your Subscription to ${EMAIL_MAIL_FROM_NAME}

Thank you for joining ${EMAIL_MAIL_FROM_NAME}.

Confirm your email address by visiting:
${safeVerificationUrl}

This link expires in ${expiryHours} hours.

You will only receive emails when we publish new articles, and you can unsubscribe at any time.

If you did not request this subscription, you can safely ignore this email.

${EMAIL_MAIL_FROM_NAME}
${EMAIL_PUBLIC_WEBSITE_URL}
  `.trim();

  return { subject, htmlBody, textBody };
}

export function generateResubscriptionEmail(resubscriptionUrl: string, email: string): EmailTemplate {
  const base = generateVerificationEmail(resubscriptionUrl, email);
  return {
    subject: 'Confirm Your New Subscription Request to Pixel Eye Blog',
    htmlBody: base.htmlBody
      .replace(/Confirm your subscription/gi, 'Confirm your new subscription request')
      .replace(/Thank you for joining/gi, 'You previously unsubscribed. If you want to rejoin'),
    textBody: `You previously unsubscribed from Pixel Eye Blog. You will remain unsubscribed unless you personally confirm this new request.\n\nConfirm your new subscription request:\n${resubscriptionUrl}\n\nIf you did not request this, ignore this email.`
  };
}

export interface CampaignEmailParams {
  campaignSubject: string;
  previewText?: string | null;
  blogTitle: string;
  blogExcerpt: string;
  blogSlug: string;
  blogUrl: string;
  featuredImageUrl?: string;
  unsubscribeUrl: string;
  isTest?: boolean;
}

export function generateCampaignEmail(params: CampaignEmailParams): EmailTemplate {
  const subject = `${params.isTest ? '[TEST] ' : ''}${params.campaignSubject}`;
  const safeBlogUrl = safeEmailHttpUrl(params.blogUrl, EMAIL_PUBLIC_WEBSITE_URL) as string;
  const safeFeaturedImageUrl = safeEmailHttpUrl(params.featuredImageUrl);
  const safeUnsubscribeUrl = params.isTest
    ? undefined
    : safeEmailHttpUrl(params.unsubscribeUrl, absoluteWebsiteUrl('/newsletter/unsubscribe'));
  const previewText = params.previewText?.trim() || `New from Pixel Eye: ${params.blogTitle}`;

  const featuredImageHtml = safeFeaturedImageUrl
    ? `
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 0 0 28px;">
        <tr>
          <td><img class="featured-image" src="${escapeEmailHtml(safeFeaturedImageUrl)}" width="508" alt="${escapeEmailHtml(params.blogTitle)}" style="border-radius: 14px; height: auto; max-width: 508px; object-fit: cover; width: 100%;"></td>
        </tr>
      </table>
    `.trim()
    : '';

  const subscriptionHtml = params.isTest
    ? '<strong>This is a test email. The unsubscribe action is intentionally disabled.</strong>'
    : `You can <a href="${escapeEmailHtml(safeUnsubscribeUrl as string)}" style="color: ${emailBrand.blue}; font-weight: 700; text-decoration: underline;">unsubscribe here</a> at any time.`;

  const contentHtml = `
    ${params.isTest ? renderEmailTestBanner('Test email — not sent to subscribers') : ''}
    <p style="color: ${emailBrand.gold}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; line-height: 18px; margin: 0 0 12px; text-align: center; text-transform: uppercase;">Latest Eye Health Article</p>
    ${featuredImageHtml}
    <h1 class="email-title" style="color: ${emailBrand.heading}; font-family: 'Bricolage Grotesque', 'Segoe UI', Arial, sans-serif; font-size: 34px; font-weight: 700; letter-spacing: -0.5px; line-height: 42px; margin: 0 0 18px; text-align: center;">${escapeEmailHtml(params.blogTitle)}</h1>
    <p style="color: ${emailBrand.body}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 16px; line-height: 27px; margin: 0 0 28px; text-align: center;">${escapeEmailMultilineText(params.blogExcerpt)}</p>
    ${renderEmailButton('Read Full Article', safeBlogUrl)}
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${emailBrand.lightBlue}" style="background-color: ${emailBrand.lightBlue}; border: 1px solid ${emailBrand.border}; border-radius: 12px; margin: 30px 0 0;">
      <tr>
        <td style="padding: 18px 20px;">
          <p style="color: ${emailBrand.heading}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; font-weight: 700; line-height: 20px; margin: 0 0 4px;">A note about our health information</p>
          <p style="color: ${emailBrand.body}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 19px; margin: 0;">This article is for general education and does not replace an examination or advice from a qualified eye-care professional.</p>
        </td>
      </tr>
    </table>
    <div style="border-top: 1px solid ${emailBrand.border}; margin: 30px 0 20px;"></div>
    <p style="color: ${emailBrand.muted}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 19px; margin: 0; text-align: center;">This email was sent because you subscribed to the Pixel Eye newsletter. ${subscriptionHtml}</p>
  `.trim();

  const htmlBody = renderBrandedEmailShell({ documentTitle: subject, previewText, contentHtml });
  const textBody = `
${params.isTest ? '[TEST EMAIL — NOT SENT TO SUBSCRIBERS]\n\n' : ''}${previewText}

${params.blogTitle}

${params.blogExcerpt}

Read the full article:
${safeBlogUrl}

This article is for general education and does not replace an examination or advice from a qualified eye-care professional.

${
  params.isTest
    ? 'This is a test email. The unsubscribe action is intentionally disabled.'
    : `You received this email because you subscribed to the Pixel Eye newsletter.\nUnsubscribe: ${safeUnsubscribeUrl}`
}

${EMAIL_MAIL_FROM_NAME}
${EMAIL_PUBLIC_WEBSITE_URL}
  `.trim();

  return { subject, htmlBody, textBody };
}

export interface SmtpDiagnosticEmailParams {
  timestamp?: Date;
}

export function generateSmtpDiagnosticEmail(
  params: SmtpDiagnosticEmailParams = {}
): EmailTemplate {
  const timestamp = (params.timestamp || new Date()).toISOString();
  const subject = '[TEST] Pixel Eye email delivery check';
  const previewText = 'Your Pixel Eye SMTP configuration delivered this diagnostic email successfully.';

  const contentHtml = `
    ${renderEmailTestBanner('SMTP diagnostic email')}
    <p style="color: ${emailBrand.gold}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; line-height: 18px; margin: 0 0 12px; text-align: center; text-transform: uppercase;">Delivery Check</p>
    <h1 class="email-title" style="color: ${emailBrand.heading}; font-family: 'Bricolage Grotesque', 'Segoe UI', Arial, sans-serif; font-size: 32px; font-weight: 700; line-height: 39px; margin: 0 0 18px; text-align: center;">Email delivery is working</h1>
    <p style="color: ${emailBrand.body}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 16px; line-height: 26px; margin: 0 0 26px; text-align: center;">The backend connected to the configured mail provider and delivered this message successfully.</p>
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${emailBrand.lightBlue}" style="background-color: ${emailBrand.lightBlue}; border: 1px solid ${emailBrand.border}; border-radius: 12px;">
      <tr>
        <td style="padding: 18px 20px;">
          <p style="color: ${emailBrand.muted}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.8px; line-height: 17px; margin: 0 0 4px; text-transform: uppercase;">Generated at</p>
          <p style="color: ${emailBrand.heading}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 700; line-height: 21px; margin: 0;">${escapeEmailHtml(timestamp)}</p>
        </td>
      </tr>
    </table>
    <p style="color: ${emailBrand.muted}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 19px; margin: 24px 0 0; text-align: center;">No subscriber confirmation or unsubscribe action is attached to this diagnostic message.</p>
  `.trim();

  const htmlBody = renderBrandedEmailShell({ documentTitle: subject, previewText, contentHtml });
  const textBody = `
Pixel Eye email delivery check

Email delivery is working.

The backend connected to the configured mail provider and delivered this message successfully.

Generated at: ${timestamp}

No subscriber confirmation or unsubscribe action is attached to this diagnostic message.

${EMAIL_MAIL_FROM_NAME}
${EMAIL_PUBLIC_WEBSITE_URL}
  `.trim();

  return { subject, htmlBody, textBody };
}
