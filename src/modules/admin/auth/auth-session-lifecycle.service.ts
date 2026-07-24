import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../../config/database.js';
import { env } from '../../../config/environment.js';
import { AdminSession } from '../../auth/index.js';

export interface SessionCleanupResult {
  retention_days: number;
  cutoff: Date;
  deleted_count: number;
}

function retentionCutoff(now = new Date(), retentionDays = env.AUTH_SESSION_HISTORY_RETENTION_DAYS): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

function familyIdFor(session: Pick<AdminSession, 'id' | 'sessionFamilyId'>): string {
  return session.sessionFamilyId ?? String(session.id);
}

export async function cleanupOldAdminSessions(now = new Date(), retentionDays = env.AUTH_SESSION_HISTORY_RETENTION_DAYS): Promise<SessionCleanupResult> {
  const cutoff = retentionCutoff(now, retentionDays);
  const deletedCount = await sequelize.transaction(async (transaction) => AdminSession.destroy({
    where: {
      [Op.or]: [
        { expiresAt: { [Op.lt]: cutoff } },
        { revokedAt: { [Op.lt]: cutoff } }
      ]
    },
    transaction
  }));

  return { retention_days: retentionDays, cutoff, deleted_count: deletedCount };
}

export async function revokeSessionFamily(session: AdminSession, transaction?: Transaction): Promise<number> {
  const now = new Date();
  if (session.sessionFamilyId) {
    const [count] = await AdminSession.update(
      { revokedAt: now, lastUsedAt: now },
      {
        where: {
          adminUserId: session.adminUserId,
          sessionFamilyId: session.sessionFamilyId,
          revokedAt: { [Op.is]: null }
        },
        transaction
      }
    );
    return count;
  }

  const [count] = await AdminSession.update(
    { revokedAt: now, lastUsedAt: now },
    { where: { id: session.id, revokedAt: { [Op.is]: null } }, transaction }
  );
  return count;
}

export async function enforceMaxActiveSessionFamilies(adminUserId: string, currentSession: AdminSession, limit = env.AUTH_MAX_ACTIVE_SESSIONS_PER_USER): Promise<number> {
  const now = new Date();
  const activeSessions = await AdminSession.findAll({
    where: {
      adminUserId,
      revokedAt: { [Op.is]: null },
      expiresAt: { [Op.gt]: now }
    },
    order: [['lastUsedAt', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']]
  });

  const currentFamilyId = familyIdFor(currentSession);
  const families = new Map<string, AdminSession>();
  for (const session of activeSessions) {
    const familyId = familyIdFor(session);
    if (!families.has(familyId)) families.set(familyId, session);
  }

  const familyIds = [...families.keys()];
  if (familyIds.length <= limit) return 0;

  const revokeCount = familyIds.length - limit;
  const candidates = familyIds.filter((familyId) => familyId !== currentFamilyId).slice(0, revokeCount);
  let totalRevoked = 0;

  for (const familyId of candidates) {
    const session = families.get(familyId);
    if (!session) continue;
    if (session.sessionFamilyId) {
      const [count] = await AdminSession.update(
        { revokedAt: now, lastUsedAt: now },
        {
          where: {
            adminUserId,
            sessionFamilyId: session.sessionFamilyId,
            revokedAt: { [Op.is]: null }
          }
        }
      );
      totalRevoked += count;
    } else {
      const [count] = await AdminSession.update(
        { revokedAt: now, lastUsedAt: now },
        { where: { id: session.id, revokedAt: { [Op.is]: null } } }
      );
      totalRevoked += count;
    }
  }

  return totalRevoked;
}
