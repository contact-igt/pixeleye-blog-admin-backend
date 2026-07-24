export const tableNames = {
  SYSTEM_SETTINGS: 'system_settings',
  MEDIA_ASSETS: 'media_assets',
  ADMIN_USERS: 'admin_users',
  ADMIN_SESSIONS: 'admin_sessions',
  AUDIT_LOGS: 'audit_logs',
  BLOGS: 'blogs',
  BLOG_VERSIONS: 'blog_versions'
} as const;

export type TableName = (typeof tableNames)[keyof typeof tableNames];
