import { initializeAuthAssociations } from '../../database/associations/index.js';
import { initializeAuthModels } from '../../database/models/index.js';

export function applyAuthAssociations(): void {
  initializeAuthAssociations();
}

initializeAuthModels();
applyAuthAssociations();

export { AdminUser } from './admin-user.model.js';
export { AdminSession } from './admin-session.model.js';
export { AuditLog } from './audit-log.model.js';
export type { AdminUserRole, AdminUserStatus } from './admin-user.model.js';
