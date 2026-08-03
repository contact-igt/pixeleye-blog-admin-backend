import { describe, expect, it } from 'vitest';
import { initializeAuthModels } from '../src/database/models/index.js';
import { AuditLog } from '../src/modules/auth/index.js';

describe('AuditLog timestamp mapping', () => {
  it('maps the createdAt model attribute to the created_at SQL column', () => {
    initializeAuthModels();

    const attributes = AuditLog.getAttributes();

    expect(attributes.createdAt).toBeDefined();
    expect(attributes.createdAt?.field).toBe('created_at');
    expect(attributes.created_at).toBeUndefined();
  });
});
