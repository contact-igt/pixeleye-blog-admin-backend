'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('blog_versions', 'custom_template_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'custom_templates', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
    await queryInterface.addColumn('blog_versions', 'custom_template_version_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'custom_template_versions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });

    await queryInterface.addIndex('blog_versions', ['custom_template_id'], { name: 'idx_blog_versions_custom_template_id' });
    await queryInterface.addIndex('blog_versions', ['custom_template_version_id'], { name: 'idx_blog_versions_custom_template_version_id' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('blog_versions', 'idx_blog_versions_custom_template_version_id');
    await queryInterface.removeIndex('blog_versions', 'idx_blog_versions_custom_template_id');
    await queryInterface.removeColumn('blog_versions', 'custom_template_version_id');
    await queryInterface.removeColumn('blog_versions', 'custom_template_id');
  }
};
