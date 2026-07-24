import { initializeAuthModels } from '../../database/models/index.js';

initializeAuthModels();

export {
  AdminUser,
  adminUserRoles,
  adminUserStatuses,
  initializeAdminUserTable,
  type AdminUserRole,
  type AdminUserStatus
} from '../../database/tables/admin-users.table.js';
