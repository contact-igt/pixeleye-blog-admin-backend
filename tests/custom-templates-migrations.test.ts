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
      dropTable: vi.fn(async (...args: unknown[]) => operations.push({ name: 'dropTable', args }))
    }
  };
}

const Sequelize = {
  BIGINT: { UNSIGNED: 'BIGINT.UNSIGNED' },
  INTEGER: { UNSIGNED: 'INTEGER.UNSIGNED' },
  SMALLINT: { UNSIGNED: 'SMALLINT.UNSIGNED' },
  STRING: (length: number) => `STRING(${length})`,
  TEXT: 'TEXT',
  DATE: 'DATE',
  JSON: 'JSON'
};

describe('custom template migrations', () => {
  it('creates custom_templates without the current_version_id foreign key and reverses cleanly', async () => {
    const migration = await import('../src/database/migrations/20260725000100-create-custom-templates.cjs');
    const { queryInterface, operations } = createQueryInterfaceRecorder();

    await migration.default.up(queryInterface, Sequelize);
    expect(operations[0]?.name).toBe('createTable');
    expect(operations[0]?.args[0]).toBe('custom_templates');
    const [, tableDefinition] = operations[0]!.args as [string, Record<string, unknown>];
    expect((tableDefinition.current_version_id as any).references).toBeUndefined();
    expect(operations.filter((op) => op.name === 'addConstraint')).toHaveLength(0);
    expect(operations.filter((op) => op.name === 'addIndex').map((op) => op.args[2])).toEqual([
      { name: 'idx_custom_templates_status' },
      { name: 'idx_custom_templates_owner_id' },
      { name: 'idx_custom_templates_name' },
      { name: 'idx_custom_templates_current_version_id' }
    ]);

    await migration.default.down(queryInterface);
    expect(operations.at(-1)).toMatchObject({ name: 'dropTable', args: ['custom_templates'] });
  });

  it('creates custom_template_versions with a unique composite index and adds the current_version_id constraint back onto custom_templates', async () => {
    const migration = await import('../src/database/migrations/20260725000200-create-custom-template-versions.cjs');
    const { queryInterface, operations } = createQueryInterfaceRecorder();

    await migration.default.up(queryInterface, Sequelize);
    expect(operations[0]?.name).toBe('createTable');
    expect(operations[0]?.args[0]).toBe('custom_template_versions');
    const uniqueIndex = operations.find((op) => op.name === 'addIndex' && (op.args[2] as any).unique);
    expect(uniqueIndex?.args).toEqual(['custom_template_versions', ['custom_template_id', 'version_number'], { name: 'idx_custom_template_versions_template_version', unique: true }]);
    expect(operations.filter((op) => op.name === 'addConstraint')).toHaveLength(1);
    expect(operations.at(-1)).toMatchObject({ name: 'addConstraint', args: ['custom_templates', expect.objectContaining({ name: 'fk_custom_templates_current_version_id' })] });

    await migration.default.down(queryInterface);
    expect(operations.at(-1)).toMatchObject({ name: 'dropTable', args: ['custom_template_versions'] });
    expect(operations.some((op) => op.name === 'removeConstraint' && op.args[1] === 'fk_custom_templates_current_version_id')).toBe(true);
  });

  it('adds nullable custom template reference columns and indexes to blog_versions reversibly', async () => {
    const migration = await import('../src/database/migrations/20260725000300-add-custom-template-refs-to-blog-versions.cjs');
    const { queryInterface, operations } = createQueryInterfaceRecorder();

    await migration.default.up(queryInterface, Sequelize);
    const addColumnOps = operations.filter((op) => op.name === 'addColumn');
    expect(addColumnOps.map((op) => op.args[1])).toEqual(['custom_template_id', 'custom_template_version_id']);
    for (const op of addColumnOps) {
      expect((op.args[2] as any).allowNull).toBe(true);
    }
    expect(operations.filter((op) => op.name === 'addIndex')).toHaveLength(2);

    await migration.default.down(queryInterface);
    expect(operations.filter((op) => op.name === 'removeColumn').map((op) => op.args[1])).toEqual(['custom_template_version_id', 'custom_template_id']);
  });
});
