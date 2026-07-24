'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('blog_versions', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      blog_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'blogs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      version_number: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      version_type: { type: Sequelize.STRING(40), allowNull: false },
      title: { type: Sequelize.STRING(180), allowNull: false },
      excerpt: { type: Sequelize.TEXT, allowNull: true },
      content_json: { type: Sequelize.JSON, allowNull: true },
      content_html: { type: Sequelize.TEXT('long'), allowNull: true },
      seo_title: { type: Sequelize.STRING(70), allowNull: true },
      seo_description: { type: Sequelize.STRING(170), allowNull: true },
      canonical_url: { type: Sequelize.STRING(2048), allowNull: true },
      featured_media_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'media_assets', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, allowNull: false }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('blog_versions', ['blog_id'], { name: 'idx_blog_versions_blog_id' });
    await queryInterface.addIndex('blog_versions', ['version_type'], { name: 'idx_blog_versions_version_type' });
    await queryInterface.addIndex('blog_versions', ['version_number'], { name: 'idx_blog_versions_version_number' });
    await queryInterface.addIndex('blog_versions', ['created_at'], { name: 'idx_blog_versions_created_at' });
    await queryInterface.addConstraint('blogs', {
      fields: ['current_draft_version_id'], type: 'foreign key', name: 'fk_blogs_current_draft_version_id', references: { table: 'blog_versions', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
    });
    await queryInterface.addConstraint('blogs', {
      fields: ['current_published_version_id'], type: 'foreign key', name: 'fk_blogs_current_published_version_id', references: { table: 'blog_versions', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('blogs', 'fk_blogs_current_published_version_id');
    await queryInterface.removeConstraint('blogs', 'fk_blogs_current_draft_version_id');
    await queryInterface.dropTable('blog_versions');
  }
};
