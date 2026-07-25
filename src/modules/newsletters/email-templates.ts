export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

const PUBLIC_WEBSITE_URL = process.env.PUBLIC_WEBSITE_URL || 'https://pixeleye.in';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Pixel Eye Blog';

export function generateVerificationEmail(
  verificationUrl: string,
  _email: string
): EmailTemplate {
  const subject = 'Confirm Your Subscription to Pixel Eye Blog';
  const expiryHours = parseInt(process.env.NEWSLETTER_VERIFICATION_TOKEN_TTL_HOURS || '24', 10);

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9f9f9; padding: 30px 20px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { font-size: 12px; color: #999; text-align: center; margin-top: 30px; }
    .link-fallback { word-break: break-all; font-size: 12px; color: #667eea; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Confirm Your Subscription</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>Thank you for your interest in ${MAIL_FROM_NAME}! To complete your subscription, please confirm your email address by clicking the button below:</p>
      <a href="${verificationUrl}" class="button">Confirm Subscription</a>
      <p>Or copy and paste this link in your browser:</p>
      <p class="link-fallback">${verificationUrl}</p>
      <p><strong>This link will expire in ${expiryHours} hours.</strong></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="font-size: 13px; color: #666;">
        We respect your privacy. You'll only receive emails when we publish new articles. You can unsubscribe anytime by clicking the unsubscribe link in any email we send.
      </p>
      <p style="font-size: 13px; color: #666;">
        If you didn't sign up for this newsletter, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      <p>${MAIL_FROM_NAME}</p>
      <p>${PUBLIC_WEBSITE_URL}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const textBody = `
Confirm Your Subscription to ${MAIL_FROM_NAME}

Hello,

Thank you for your interest in ${MAIL_FROM_NAME}! To complete your subscription, please confirm your email address by visiting:

${verificationUrl}

This link will expire in ${expiryHours} hours.

---

We respect your privacy. You'll only receive emails when we publish new articles. You can unsubscribe anytime by clicking the unsubscribe link in any email we send.

If you didn't sign up for this newsletter, you can safely ignore this email.

${MAIL_FROM_NAME}
${PUBLIC_WEBSITE_URL}
  `.trim();

  return { subject, htmlBody, textBody };
}

export interface CampaignEmailParams {
  blogTitle: string;
  blogExcerpt: string;
  blogSlug: string;
  blogUrl: string;
  featuredImageUrl?: string;
  unsubscribeUrl: string;
  isTest?: boolean;
}

export function generateCampaignEmail(params: CampaignEmailParams): EmailTemplate {
  const testLabel = params.isTest ? '[TEST] ' : '';
  const subject = `${testLabel}${params.blogTitle}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9f9f9; padding: 30px 20px; border-radius: 0 0 8px 8px; }
    .featured-image { max-width: 100%; height: auto; border-radius: 4px; margin: 20px 0; }
    .excerpt { font-size: 16px; color: #555; margin: 20px 0; font-style: italic; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { font-size: 12px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; }
    .test-badge { background: #ff9800; color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    ${
      params.isTest
        ? '<div style="background: #ff9800; color: white; padding: 10px; text-align: center; border-radius: 4px; margin-bottom: 20px;"><strong>TEST EMAIL</strong> - This is a test and will not be sent to all subscribers</div>'
        : ''
    }
    <div class="header">
      <h1>${params.blogTitle}</h1>
      ${params.isTest ? '<p style="margin: 10px 0 0 0;">Test Email</p>' : ''}
    </div>
    <div class="content">
      ${
        params.featuredImageUrl
          ? `<img src="${params.featuredImageUrl}" alt="${params.blogTitle}" class="featured-image">`
          : ''
      }
      <p class="excerpt">${params.blogExcerpt}</p>
      <a href="${params.blogUrl}" class="button">Read Full Article</a>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="font-size: 13px; color: #666;">
        This email was sent to you because you subscribed to our newsletter.
        ${
          params.isTest
            ? '<strong>As a test email, the unsubscribe link below is not functional.</strong>'
            : `You can <a href="${params.unsubscribeUrl}" style="color: #667eea;">unsubscribe here</a> if you no longer wish to receive our emails.`
        }
      </p>
    </div>
    <div class="footer">
      <p>${MAIL_FROM_NAME}</p>
      <p>${PUBLIC_WEBSITE_URL}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const textBody = `
${params.isTest ? '[TEST EMAIL]\n\n' : ''}
${params.blogTitle}

${params.blogExcerpt}

Read the full article:
${params.blogUrl}

${
  params.isTest
    ? '\nThis is a test email and has not been sent to subscribers.'
    : `\nUnsubscribe: ${params.unsubscribeUrl}`
}

---

${MAIL_FROM_NAME}
${PUBLIC_WEBSITE_URL}
  `.trim();

  return { subject, htmlBody, textBody };
}
