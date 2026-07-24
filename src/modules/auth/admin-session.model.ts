import { initializeAuthModels } from '../../database/models/index.js';

initializeAuthModels();

export { AdminSession, initializeAdminSessionTable } from '../../database/tables/admin-sessions.table.js';
