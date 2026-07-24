import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../src/modules/auth/index.js';
import { writeAuthAuditLog } from '../src/modules/admin/auth/auth-audit.service.js';

describe('authentication audit logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates audit logs with business fields only and no client-supplied timestamp', async () => {
    const createSpy = vi.spyOn(AuditLog, 'create').mockResolvedValue({ createdAt: new Date() } as never);

    await writeAuthAuditLog({
      action: 'AUTH_LOGIN_SUCCESS',
      adminUserId: '1',
      requestId: 'request-1',
      ip: '127.0.0.1',
      userAgent: 'vitest',
      metadata: { reason: 'regression' }
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const payload = createSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      adminUserId: '1',
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'admin_auth',
      entityId: '1',
      requestId: 'request-1',
      userAgent: 'vitest',
      metadata: { reason: 'regression' }
    });
    expect(payload.ipHash).toEqual(expect.any(String));
    expect(payload).not.toHaveProperty('createdAt');
    expect(payload).not.toHaveProperty('created_at');
  });

  it('does not require callers to provide createdAt before validation', async () => {
    const auditLog = AuditLog.build({
      adminUserId: '1',
      action: 'AUTH_LOGIN_FAILED',
      entityType: 'admin_auth',
      entityId: '1',
      requestId: null,
      ipHash: null,
      userAgent: null,
      metadata: null
    });

    await expect(auditLog.validate()).resolves.toBe(auditLog);
  });

  it('maps the automatic audit timestamp to created_at and not updated_at', () => {
    expect(AuditLog.getAttributes().created_at.field).toBe('created_at');
    expect(AuditLog.getAttributes().updated_at).toBeUndefined();
    expect(AuditLog.options.updatedAt).toBe(false);
  });
});

