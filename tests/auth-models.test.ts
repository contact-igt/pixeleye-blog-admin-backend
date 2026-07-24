import { describe, expect, it } from 'vitest';
import { sequelize } from '../src/config/database.js';
import { initializeAuthAssociations } from '../src/database/associations/index.js';
import { initializeAuthModels } from '../src/database/models/index.js';
import { tableNames } from '../src/database/table-names.js';
import { AdminSession as CompatibilityAdminSession } from '../src/modules/auth/admin-session.model.js';
import { AdminUser as CompatibilityAdminUser } from '../src/modules/auth/admin-user.model.js';
import { AuditLog as CompatibilityAuditLog } from '../src/modules/auth/audit-log.model.js';
import { AdminSession, AdminUser, AuditLog } from '../src/modules/auth/index.js';

describe('admin authentication models', () => {
  it('defines all migration-backed physical table names centrally', () => {
    expect(tableNames).toEqual({
      SYSTEM_SETTINGS: 'system_settings',
      MEDIA_ASSETS: 'media_assets',
      ADMIN_USERS: 'admin_users',
      ADMIN_SESSIONS: 'admin_sessions',
      AUDIT_LOGS: 'audit_logs',
      BLOGS: 'blogs',
      BLOG_VERSIONS: 'blog_versions'
    });
  });

  it('initializes auth models idempotently with preserved model names', () => {
    const first = initializeAuthModels(sequelize);
    const second = initializeAuthModels(sequelize);

    expect(first.AdminUser).toBe(AdminUser);
    expect(first.AdminSession).toBe(AdminSession);
    expect(first.AuditLog).toBe(AuditLog);
    expect(second.AdminUser).toBe(AdminUser);
    expect(second.AdminSession).toBe(AdminSession);
    expect(second.AuditLog).toBe(AuditLog);
    expect(sequelize.models.AdminUser).toBe(AdminUser);
    expect(sequelize.models.AdminSession).toBe(AdminSession);
    expect(sequelize.models.AuditLog).toBe(AuditLog);
    expect(AdminUser.name).toBe('AdminUser');
    expect(AdminSession.name).toBe('AdminSession');
    expect(AuditLog.name).toBe('AuditLog');
  });

  it('maps AdminUser to the admin_users table with paranoid soft deletion', () => {
    expect(AdminUser.tableName).toBe('admin_users');
    expect(AdminUser.options.paranoid).toBe(true);
    expect(AdminUser.getAttributes().email.unique).toBe(true);
    expect(AdminUser.getAttributes().passwordHash.field).toBe('password_hash');
    expect(AdminUser.getAttributes().role.values).toEqual(['super_admin', 'editor', 'author', 'viewer']);
    expect(AdminUser.getAttributes().status.values).toEqual(['active', 'inactive', 'blocked']);
  });

  it('maps AdminSession fields and replacement-session association', () => {
    expect(AdminSession.tableName).toBe('admin_sessions');
    expect(AdminSession.getAttributes().refreshTokenHash.unique).toBe(true);
    expect(AdminSession.getAttributes().adminUserId.field).toBe('admin_user_id');
    expect(AdminSession.getAttributes().sessionFamilyId.field).toBe('session_family_id');
    expect(AdminSession.getAttributes().parentSessionId.field).toBe('parent_session_id');
    expect(AdminSession.associations.adminUser.associationType).toBe('BelongsTo');
    expect(AdminSession.associations.replacedBySession.associationType).toBe('BelongsTo');
    expect(AdminSession.associations.replacementSessions.associationType).toBe('HasMany');
    expect(AdminSession.associations.parentSession.associationType).toBe('BelongsTo');
    expect(AdminSession.associations.childSessions.associationType).toBe('HasMany');
  });

  it('maps AuditLog as append-only created_at records', () => {
    expect(AuditLog.tableName).toBe('audit_logs');
    expect(AuditLog.options.timestamps).toBe(true);
    expect(AuditLog.options.createdAt).toBe('created_at');
    expect(AuditLog.options.updatedAt).toBe(false);
    expect(AuditLog.getAttributes().created_at.field).toBe('created_at');
    expect(AuditLog.getAttributes().updated_at).toBeUndefined();
    expect(AuditLog.getAttributes().metadata.type.constructor.name).toBe('JSONTYPE');
    expect(AuditLog.associations.adminUser.associationType).toBe('BelongsTo');
  });

  it('registers AdminUser relationships', () => {
    expect(AdminUser.associations.sessions.associationType).toBe('HasMany');
    expect(AdminUser.associations.auditLogs.associationType).toBe('HasMany');
  });

  it('keeps association registration safe to call repeatedly', () => {
    const first = initializeAuthAssociations(sequelize);
    const second = initializeAuthAssociations(sequelize);

    expect(first.AdminUser.associations.sessions).toBe(second.AdminUser.associations.sessions);
    expect(first.AdminSession.associations.replacedBySession.as).toBe('replacedBySession');
    expect(first.AdminSession.associations.replacementSessions.as).toBe('replacementSessions');
    expect(first.AdminSession.associations.parentSession.as).toBe('parentSession');
    expect(first.AdminSession.associations.childSessions.as).toBe('childSessions');
  });

  it('preserves compatibility exports and object identity on old auth paths', () => {
    expect(CompatibilityAdminUser).toBe(AdminUser);
    expect(CompatibilityAdminSession).toBe(AdminSession);
    expect(CompatibilityAuditLog).toBe(AuditLog);
  });
});
