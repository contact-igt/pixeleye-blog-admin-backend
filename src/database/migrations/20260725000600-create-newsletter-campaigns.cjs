'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('newsletter_campaigns', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      blog_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'blogs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      blog_version_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'blog_versions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      subject: { type: Sequelize.STRING(255), allowNull: false },
      preview_text: { type: Sequelize.STRING(255), allowNull: true },
      status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'draft' }, // draft, queued, sending, completed, partially_failed, failed, cancelled
      total_recipients: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      queued_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      sent_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      failed_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      cancelled_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      created_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      scheduled_at: { type: Sequelize.DATE, allowNull: true },
      queued_at: { type: Sequelize.DATE, allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      cancelled_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('newsletter_campaigns', ['blog_id'], { name: 'idx_newsletter_campaigns_blog_id' });
    await queryInterface.addIndex('newsletter_campaigns', ['blog_version_id'], { name: 'idx_newsletter_campaigns_blog_version_id' });
    await queryInterface.addIndex('newsletter_campaigns', ['status'], { name: 'idx_newsletter_campaigns_status' });
    await queryInterface.addIndex('newsletter_campaigns', ['created_at'], { name: 'idx_newsletter_campaigns_created_at' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('newsletter_campaigns');
  }
};
