'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('newsletter_subscribers', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      email: { type: Sequelize.STRING(255), allowNull: false },
      normalized_email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'pending' }, // pending, subscribed, unsubscribed
      verification_token_hash: { type: Sequelize.STRING(255), allowNull: true },
      verification_expires_at: { type: Sequelize.DATE, allowNull: true },
      unsubscribe_token_hash: { type: Sequelize.STRING(255), allowNull: true },
      verified_at: { type: Sequelize.DATE, allowNull: true },
      unsubscribed_at: { type: Sequelize.DATE, allowNull: true },
      source: { type: Sequelize.STRING(100), allowNull: true }, // blog_detail, admin, etc
      consent_text: { type: Sequelize.TEXT, allowNull: true },
      consent_version: { type: Sequelize.STRING(40), allowNull: true },
      consent_at: { type: Sequelize.DATE, allowNull: true },
      verification_sent_at: { type: Sequelize.DATE, allowNull: true },
      last_verification_sent_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('newsletter_subscribers', ['normalized_email'], { name: 'idx_newsletter_subscribers_normalized_email', unique: true });
    await queryInterface.addIndex('newsletter_subscribers', ['status'], { name: 'idx_newsletter_subscribers_status' });
    await queryInterface.addIndex('newsletter_subscribers', ['created_at'], { name: 'idx_newsletter_subscribers_created_at' });
    await queryInterface.addIndex('newsletter_subscribers', ['verified_at'], { name: 'idx_newsletter_subscribers_verified_at' });
    await queryInterface.addIndex('newsletter_subscribers', ['unsubscribed_at'], { name: 'idx_newsletter_subscribers_unsubscribed_at' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('newsletter_subscribers');
  }
};
