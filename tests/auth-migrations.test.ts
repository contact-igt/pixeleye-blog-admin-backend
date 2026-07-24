import { describe, expect, it, vi } from 'vitest';

type MigrationOperation = { name: string; args: unknown[] };

function createQueryInterfaceRecorder() {
  const operations: MigrationOperation[] = [];
  return {
    operations,
    queryInterface: {
      createTable: vi.fn(async (...args: unknown[]) => operations.push({ name: 'createTable', args })),
      addIndex: vi.fn(async (...args: unknown[]) => operations.push({ name: 'addIndex', args })),
      addColumn: vi.fn(async (...args: unknown[]) => operations.push({ name: 'addColumn', args })),
      removeColumn: vi.fn(async (...args: unknown[]) => operations.push({ name: 'removeColumn', args })),
      removeIndex: vi.fn(async (...args: unknown[]) => operations.push({ name: 'removeIndex', args })),
      addConstraint: vi.fn(async (...args: unknown[]) => operations.push({ name: 'addConstraint', args })),
      removeConstraint: vi.fn(async (...args: unknown[]) => operations.push({ name: 'removeConstraint', args })),
      dropTable: vi.fn(async (...args: unknown[]) => operations.push({ name: 'dropTable', args })),
      sequelize: { query: vi.fn(async (...args: unknown[]) => operations.push({ name: 'query', args })) }
    }
  };
}

const Sequelize = {
  BIGINT: { UNSIGNED: 'BIGINT.UNSIGNED' },
  INTEGER: { UNSIGNED: 'INTEGER.UNSIGNED' },
  STRING: (length: number) => `STRING(${length})`,
  DATE: 'DATE',
  JSON: 'JSON',
  ENUM: (...values: string[]) => ({ type: 'ENUM', values }),
  literal: (value: string) => ({ literal: value })
};

describe('admin auth migrations', () => {
  it('creates and rolls back admin_users', async () => {
    const migration = await import('../src/database/migrations/20260722000200-create-admin-users.cjs');
    const { queryInterface, operations } = createQueryInterfaceRecorder();

    await migration.default.up(queryInterface, Sequelize);
    expect(operations[0]?.name).toBe('createTable');
    expect(operations[0]?.args[0]).toBe('admin_users');
    expect(operations.some((operation) => operation.name === 'addIndex')).toBe(true);

    await migration.default.down(queryInterface);
    expect(operations.at(-1)).toMatchObject({ name: 'dropTable', args: ['admin_users'] });
  });

  it('creates admin_sessions with foreign keys and reversible constraints', async () => {
    const migration = await import('../src/database/migrations/20260722000300-create-admin-sessions.cjs');
    const { queryInterface, operations } = createQueryInterfaceRecorder();

    await migration.default.up(queryInterface, Sequelize);
    expect(operations[0]?.name).toBe('createTable');
    expect(operations[0]?.args[0]).toBe('admin_sessions');
    expect(operations.filter((operation) => operation.name === 'addConstraint')).toHaveLength(2);

    await migration.default.down(queryInterface);
    expect(operations.some((operation) => operation.name === 'removeConstraint')).toBe(true);
    expect(operations.at(-1)).toMatchObject({ name: 'dropTable', args: ['admin_sessions'] });
  });

  it('adds session family metadata to admin_sessions reversibly', async () => {
    const migration = await import('../src/database/migrations/20260722000600-add-session-family-to-admin-sessions.cjs');
    const { queryInterface, operations } = createQueryInterfaceRecorder();

    await migration.default.up(queryInterface, Sequelize);
    expect(operations.filter((operation) => operation.name === 'addColumn').map((operation) => operation.args[1])).toEqual(['session_family_id', 'parent_session_id']);
    expect(operations.some((operation) => operation.name === 'query')).toBe(true);
    expect(operations.some((operation) => operation.name === 'addConstraint')).toBe(true);

    await migration.default.down(queryInterface);
    expect(operations.some((operation) => operation.name === 'removeConstraint')).toBe(true);
    expect(operations.at(-1)).toMatchObject({ name: 'removeColumn', args: ['admin_sessions', 'session_family_id'] });
  });

  it('creates audit_logs with nullable admin user ownership', async () => {
    const migration = await import('../src/database/migrations/20260722000400-create-audit-logs.cjs');
    const { queryInterface, operations } = createQueryInterfaceRecorder();

    await migration.default.up(queryInterface, Sequelize);
    expect(operations[0]?.name).toBe('createTable');
    expect(operations[0]?.args[0]).toBe('audit_logs');
    expect(operations.some((operation) => operation.name === 'addConstraint')).toBe(true);

    await migration.default.down(queryInterface);
    expect(operations.at(-1)).toMatchObject({ name: 'dropTable', args: ['audit_logs'] });
  });
});


