'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admin_users', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(150), allowNull: false },
      email: { type: Sequelize.STRING(191), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      role: { type: Sequelize.ENUM('super_admin', 'editor', 'author', 'viewer'), allowNull: false, defaultValue: 'viewer' },
      status: { type: Sequelize.ENUM('active', 'inactive', 'blocked'), allowNull: false, defaultValue: 'active' },
      failed_login_attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      locked_until: { type: Sequelize.DATE, allowNull: true },
      last_login_at: { type: Sequelize.DATE, allowNull: true },
      password_changed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
      deleted_at: { type: Sequelize.DATE, allowNull: true }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('admin_users', ['email'], { name: 'idx_admin_users_email', unique: true });
    await queryInterface.addIndex('admin_users', ['role'], { name: 'idx_admin_users_role' });
    await queryInterface.addIndex('admin_users', ['status'], { name: 'idx_admin_users_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_users');
  }
};
