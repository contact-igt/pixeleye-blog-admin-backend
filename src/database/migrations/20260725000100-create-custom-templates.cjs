'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('custom_templates', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(191), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'draft' },
      status_before_archive: { type: Sequelize.STRING(40), allowNull: true },
      owner_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      current_version_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      lock_version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      created_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      updated_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      activated_at: { type: Sequelize.DATE, allowNull: true },
      activated_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      archived_at: { type: Sequelize.DATE, allowNull: true },
      archived_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      restored_at: { type: Sequelize.DATE, allowNull: true },
      restored_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('custom_templates', ['status'], { name: 'idx_custom_templates_status' });
    await queryInterface.addIndex('custom_templates', ['owner_id'], { name: 'idx_custom_templates_owner_id' });
    await queryInterface.addIndex('custom_templates', ['name'], { name: 'idx_custom_templates_name' });
    await queryInterface.addIndex('custom_templates', ['current_version_id'], { name: 'idx_custom_templates_current_version_id' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('custom_templates');
  }
};
