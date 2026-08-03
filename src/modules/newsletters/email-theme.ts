const FALLBACK_WEBSITE_URL = 'https://pixeleye.in';

function normalizeWebsiteUrl(value: string | undefined): string {
  try {
    const parsed = new URL(value || FALLBACK_WEBSITE_URL);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return FALLBACK_WEBSITE_URL;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return FALLBACK_WEBSITE_URL;
  }
}

export const EMAIL_PUBLIC_WEBSITE_URL = normalizeWebsiteUrl(process.env.PUBLIC_WEBSITE_URL);
export const EMAIL_MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Pixel Eye Blog';

export const emailBrand = {
  navy: '#293B77',
  deepNavy: '#232A46',
  blue: '#2F4C89',
  lightBlue: '#EDF4FF',
  heading: '#293B77',
  body: '#5F6F96',
  muted: '#7F8EAE',
  gold: '#D39A52',
  border: '#D6DEEC',
  white: '#FFFFFF'
} as const;

export function absoluteWebsiteUrl(path: string): string {
  return new URL(path, `${EMAIL_PUBLIC_WEBSITE_URL}/`).toString();
}

const BRAND_LOGO_URL = absoluteWebsiteUrl('/assets/Footer/brandlogo-white.png');

export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeEmailMultilineText(value: string): string {
  return escapeEmailHtml(value).replace(/\r?\n/g, '<br>');
}

export function safeEmailHttpUrl(value: string | undefined, fallback?: string): string | undefined {
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
}

export function renderEmailButton(label: string, url: string): string {
  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
      <tr>
        <td align="center" bgcolor="${emailBrand.blue}" style="border-radius: 999px;">
          <a href="${escapeEmailHtml(url)}" style="display: inline-block; min-width: 180px; padding: 15px 28px; border: 1px solid ${emailBrand.blue}; border-radius: 999px; color: ${emailBrand.white}; font-family: 'Bricolage Grotesque', 'Segoe UI', Arial, sans-serif; font-size: 15px; font-weight: 700; line-height: 18px; text-align: center; text-decoration: none;">
            ${escapeEmailHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `.trim();
}

export function renderEmailTestBanner(message: string): string {
  return `
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center" bgcolor="${emailBrand.gold}" style="border-radius: 10px; color: ${emailBrand.deepNavy}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.6px; line-height: 18px; padding: 10px 16px; text-transform: uppercase;">
          ${escapeEmailHtml(message)}
        </td>
      </tr>
    </table>
  `.trim();
}

interface BrandedEmailShellParams {
  documentTitle: string;
  previewText: string;
  contentHtml: string;
}

export function renderBrandedEmailShell(params: BrandedEmailShellParams): string {
  const title = escapeEmailHtml(params.documentTitle);
  const preview = escapeEmailHtml(params.previewText);
  const websiteUrl = escapeEmailHtml(EMAIL_PUBLIC_WEBSITE_URL);
  const logoUrl = escapeEmailHtml(BRAND_LOGO_URL);
  const fromName = escapeEmailHtml(EMAIL_MAIL_FROM_NAME);

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${title}</title>
  <style>
    html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    table, td { border-collapse: collapse !important; }
    img { border: 0; display: block; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-gutter { padding-left: 18px !important; padding-right: 18px !important; }
      .email-header { padding: 24px 20px !important; }
      .email-content { padding: 30px 22px !important; }
      .email-footer { padding: 24px 20px !important; }
      .email-title { font-size: 28px !important; line-height: 34px !important; }
      .featured-image { width: 100% !important; }
    }
  </style>
</head>
<body bgcolor="${emailBrand.lightBlue}" style="background-color: ${emailBrand.lightBlue}; margin: 0; padding: 0;">
  <div style="display: none; font-size: 1px; color: ${emailBrand.lightBlue}; line-height: 1px; font-family: Arial, sans-serif; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">
    ${preview}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${emailBrand.lightBlue}" style="background-color: ${emailBrand.lightBlue};">
    <tr>
      <td class="email-gutter" align="center" style="padding: 30px 16px;">
        <table role="presentation" class="email-shell" width="600" border="0" cellpadding="0" cellspacing="0" style="background-color: ${emailBrand.white}; border: 1px solid ${emailBrand.border}; border-radius: 18px; max-width: 600px; overflow: hidden; width: 600px;">
          <tr>
            <td class="email-header" align="center" bgcolor="${emailBrand.navy}" style="background-color: ${emailBrand.navy}; border-radius: 18px 18px 0 0; padding: 28px 34px 24px;">
              <a href="${websiteUrl}" aria-label="Visit Pixel Eye Hospital">
                <img src="${logoUrl}" width="220" alt="Pixel Eye Hospital" style="display: block; height: auto; margin: 0 auto; max-width: 220px; width: 220px;">
              </a>
            </td>
          </tr>
          <tr><td bgcolor="${emailBrand.gold}" style="background-color: ${emailBrand.gold}; font-size: 4px; height: 4px; line-height: 4px;">&nbsp;</td></tr>
          <tr>
            <td class="email-content" bgcolor="${emailBrand.white}" style="background-color: ${emailBrand.white}; padding: 42px 46px;">
              ${params.contentHtml}
            </td>
          </tr>
          <tr>
            <td class="email-footer" align="center" bgcolor="${emailBrand.navy}" style="background-color: ${emailBrand.navy}; border-radius: 0 0 18px 18px; padding: 28px 34px;">
              <p style="color: ${emailBrand.white}; font-family: 'Bricolage Grotesque', 'Segoe UI', Arial, sans-serif; font-size: 15px; font-weight: 700; line-height: 22px; margin: 0 0 7px;">${fromName}</p>
              <p style="color: #DBE6FF; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 19px; margin: 0;">Modern diagnostics, experienced specialists and evidence-based eye care.</p>
              <p style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 19px; margin: 12px 0 0;">
                <a href="${websiteUrl}" style="color: #DBE6FF; text-decoration: underline;">Visit our website</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
