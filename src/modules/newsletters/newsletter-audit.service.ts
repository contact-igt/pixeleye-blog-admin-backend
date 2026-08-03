import { logger } from '../../config/logger.js';
import { writeAuthAuditLog, type AuditContext } from '../admin/auth/auth-audit.service.js';
import type { Transaction } from 'sequelize';

type AuditWriter = (context: AuditContext, transaction?: Transaction) => Promise<void>;

export async function writeNewsletterAuditSafely(
  context: AuditContext,
  transaction?: Transaction,
  writer: AuditWriter = writeAuthAuditLog
): Promise<boolean> {
  try {
    await writer(context, transaction);
    return true;
  } catch (error) {
    logger.error(
      {
        action: context.action,
        adminUserId: context.adminUserId,
        error: error instanceof Error ? error.message : String(error)
      },
      'Newsletter operation succeeded but its audit log could not be written'
    );
    return false;
  }
}