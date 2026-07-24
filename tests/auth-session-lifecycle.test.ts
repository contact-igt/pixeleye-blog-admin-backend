import { Op } from 'sequelize';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sequelize } from '../src/config/database.js';
import { AdminSession } from '../src/modules/auth/index.js';
import { cleanupOldAdminSessions, enforceMaxActiveSessionFamilies, revokeSessionFamily } from '../src/modules/admin/auth/auth-session-lifecycle.service.js';

function session(values: Record<string, unknown> = {}) {
  return {
    id: '1',
    adminUserId: '1',
    sessionFamilyId: 'family-1',
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    ...values
  } as AdminSession;
}

describe('admin session lifecycle service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cleanup removes only expired or revoked rows older than retention', async () => {
    vi.spyOn(sequelize, 'transaction').mockImplementation(async (callback: any) => callback('tx'));
    const destroy = vi.spyOn(AdminSession, 'destroy').mockResolvedValue(3);
    const now = new Date('2026-07-22T00:00:00Z');

    const result = await cleanupOldAdminSessions(now, 30);

    expect(result.deleted_count).toBe(3);
    expect(destroy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ [Op.or]: expect.any(Array) }),
      transaction: 'tx'
    }));
  });

  it('cleanup is idempotent when there is nothing to delete', async () => {
    vi.spyOn(sequelize, 'transaction').mockImplementation(async (callback: any) => callback('tx'));
    vi.spyOn(AdminSession, 'destroy').mockResolvedValue(0);

    await expect(cleanupOldAdminSessions(new Date('2026-07-22T00:00:00Z'), 30)).resolves.toMatchObject({ deleted_count: 0 });
    await expect(cleanupOldAdminSessions(new Date('2026-07-22T00:00:00Z'), 30)).resolves.toMatchObject({ deleted_count: 0 });
  });

  it('preserves active and recently revoked rows by using the retention cutoff predicate', async () => {
    vi.spyOn(sequelize, 'transaction').mockImplementation(async (callback: any) => callback('tx'));
    const destroy = vi.spyOn(AdminSession, 'destroy').mockResolvedValue(0);

    await cleanupOldAdminSessions(new Date('2026-07-22T00:00:00Z'), 30);

    const where = destroy.mock.calls[0]?.[0]?.where as any;
    expect(where[Op.or]).toEqual([
      { expiresAt: { [Op.lt]: new Date('2026-06-22T00:00:00Z') } },
      { revokedAt: { [Op.lt]: new Date('2026-06-22T00:00:00Z') } }
    ]);
  });

  it('reused revoked tokens revoke only the active session family', async () => {
    const update = vi.spyOn(AdminSession, 'update').mockResolvedValue([2]);

    await expect(revokeSessionFamily(session({ sessionFamilyId: 'family-reused' }))).resolves.toBe(2);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date) }), expect.objectContaining({
      where: expect.objectContaining({ sessionFamilyId: 'family-reused', revokedAt: { [Op.is]: null } })
    }));
  });

  it('active-session limit revokes the oldest non-current families', async () => {
    vi.spyOn(AdminSession, 'findAll').mockResolvedValue([
      session({ id: '1', sessionFamilyId: 'old-family', lastUsedAt: new Date('2026-07-01T00:00:00Z') }),
      session({ id: '2', sessionFamilyId: 'middle-family', lastUsedAt: new Date('2026-07-02T00:00:00Z') }),
      session({ id: '3', sessionFamilyId: 'current-family', lastUsedAt: new Date('2026-07-03T00:00:00Z') })
    ] as never);
    const update = vi.spyOn(AdminSession, 'update').mockResolvedValue([1]);

    const revoked = await enforceMaxActiveSessionFamilies('1', session({ id: '3', sessionFamilyId: 'current-family' }), 2);

    expect(revoked).toBe(1);
    expect(update).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      where: expect.objectContaining({ sessionFamilyId: 'old-family' })
    }));
  });
});
