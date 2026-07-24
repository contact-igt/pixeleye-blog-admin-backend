'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admin_sessions', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
      admin_user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      refresh_token_hash: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      replaced_by_session_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      ip_hash: { type: Sequelize.STRING(255), allowNull: true },
      user_agent: { type: Sequelize.STRING(500), allowNull: true },
      last_used_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('admin_sessions', ['admin_user_id'], { name: 'idx_admin_sessions_admin_user_id' });
    await queryInterface.addIndex('admin_sessions', ['refresh_token_hash'], { name: 'idx_admin_sessions_refresh_token_hash', unique: true });
    await queryInterface.addIndex('admin_sessions', ['expires_at'], { name: 'idx_admin_sessions_expires_at' });
    await queryInterface.addIndex('admin_sessions', ['revoked_at'], { name: 'idx_admin_sessions_revoked_at' });
    await queryInterface.addIndex('admin_sessions', ['replaced_by_session_id'], { name: 'idx_admin_sessions_replaced_by_session_id' });

    await queryInterface.addConstraint('admin_sessions', {
      fields: ['admin_user_id'],
      type: 'foreign key',
      name: 'fk_admin_sessions_admin_user_id',
      references: { table: 'admin_users', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });

    await queryInterface.addConstraint('admin_sessions', {
      fields: ['replaced_by_session_id'],
      type: 'foreign key',
      name: 'fk_admin_sessions_replaced_by_session_id',
      references: { table: 'admin_sessions', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('admin_sessions', 'fk_admin_sessions_replaced_by_session_id');
    await queryInterface.removeConstraint('admin_sessions', 'fk_admin_sessions_admin_user_id');
    await queryInterface.dropTable('admin_sessions');
  }
};
