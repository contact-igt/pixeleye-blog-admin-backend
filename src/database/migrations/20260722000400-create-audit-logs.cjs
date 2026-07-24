'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
      admin_user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      action: { type: Sequelize.STRING(100), allowNull: false },
      entity_type: { type: Sequelize.STRING(100), allowNull: true },
      entity_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      request_id: { type: Sequelize.STRING(100), allowNull: true },
      ip_hash: { type: Sequelize.STRING(255), allowNull: true },
      user_agent: { type: Sequelize.STRING(500), allowNull: true },
      metadata: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('audit_logs', ['admin_user_id'], { name: 'idx_audit_logs_admin_user_id' });
    await queryInterface.addIndex('audit_logs', ['action'], { name: 'idx_audit_logs_action' });
    await queryInterface.addIndex('audit_logs', ['entity_type', 'entity_id'], { name: 'idx_audit_logs_entity' });
    await queryInterface.addIndex('audit_logs', ['created_at'], { name: 'idx_audit_logs_created_at' });

    await queryInterface.addConstraint('audit_logs', {
      fields: ['admin_user_id'],
      type: 'foreign key',
      name: 'fk_audit_logs_admin_user_id',
      references: { table: 'admin_users', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('audit_logs', 'fk_audit_logs_admin_user_id');
    await queryInterface.dropTable('audit_logs');
  }
};
