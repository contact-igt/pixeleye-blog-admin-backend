import { initializeAuthModels } from '../../database/models/index.js';

initializeAuthModels();

export { AuditLog, initializeAuditLogTable } from '../../database/tables/audit-logs.table.js';
