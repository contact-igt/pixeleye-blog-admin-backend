'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('custom_template_versions', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      custom_template_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'custom_templates', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      version_number: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      schema_version: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false },
      layout_config_json: { type: Sequelize.JSON, allowNull: false },
      change_summary: { type: Sequelize.STRING(500), allowNull: true },
      created_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, allowNull: false }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('custom_template_versions', ['custom_template_id', 'version_number'], { name: 'idx_custom_template_versions_template_version', unique: true });
    await queryInterface.addIndex('custom_template_versions', ['custom_template_id'], { name: 'idx_custom_template_versions_custom_template_id' });
    await queryInterface.addIndex('custom_template_versions', ['created_by'], { name: 'idx_custom_template_versions_created_by' });
    await queryInterface.addIndex('custom_template_versions', ['created_at'], { name: 'idx_custom_template_versions_created_at' });

    await queryInterface.addConstraint('custom_templates', {
      fields: ['current_version_id'], type: 'foreign key', name: 'fk_custom_templates_current_version_id', references: { table: 'custom_template_versions', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('custom_templates', 'fk_custom_templates_current_version_id');
    await queryInterface.dropTable('custom_template_versions');
  }
};
