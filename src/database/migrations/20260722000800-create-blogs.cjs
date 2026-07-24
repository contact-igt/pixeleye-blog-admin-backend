'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('blogs', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      slug: { type: Sequelize.STRING(191), allowNull: false, unique: true },
      status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'draft' },
      status_before_trash: { type: Sequelize.STRING(40), allowNull: true },
      author_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      featured_media_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'media_assets', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      current_draft_version_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      current_published_version_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      published_at: { type: Sequelize.DATE, allowNull: true },
      unpublished_at: { type: Sequelize.DATE, allowNull: true },
      trashed_at: { type: Sequelize.DATE, allowNull: true },
      trashed_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      restored_at: { type: Sequelize.DATE, allowNull: true },
      restored_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      updated_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('blogs', ['slug'], { name: 'idx_blogs_slug', unique: true });
    await queryInterface.addIndex('blogs', ['status'], { name: 'idx_blogs_status' });
    await queryInterface.addIndex('blogs', ['author_id'], { name: 'idx_blogs_author_id' });
    await queryInterface.addIndex('blogs', ['featured_media_id'], { name: 'idx_blogs_featured_media_id' });
    await queryInterface.addIndex('blogs', ['published_at'], { name: 'idx_blogs_published_at' });
    await queryInterface.addIndex('blogs', ['trashed_at'], { name: 'idx_blogs_trashed_at' });
    await queryInterface.addIndex('blogs', ['created_at'], { name: 'idx_blogs_created_at' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('blogs');
  }
};
