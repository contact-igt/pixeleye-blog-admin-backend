export const tableNames = {
  SYSTEM_SETTINGS: 'system_settings',
  MEDIA_ASSETS: 'media_assets',
  ADMIN_USERS: 'admin_users',
  ADMIN_SESSIONS: 'admin_sessions',
  AUDIT_LOGS: 'audit_logs',
  BLOGS: 'blogs',
  BLOG_VERSIONS: 'blog_versions',
  BLOG_FEEDBACK: 'blog_feedback',
  NEWSLETTER_SUBSCRIBERS: 'newsletter_subscribers',
  NEWSLETTER_CAMPAIGNS: 'newsletter_campaigns',
  NEWSLETTER_DELIVERIES: 'newsletter_deliveries',
  CUSTOM_TEMPLATES: 'custom_templates',
  CUSTOM_TEMPLATE_VERSIONS: 'custom_template_versions'
} as const;

export type TableName = (typeof tableNames)[keyof typeof tableNames];
