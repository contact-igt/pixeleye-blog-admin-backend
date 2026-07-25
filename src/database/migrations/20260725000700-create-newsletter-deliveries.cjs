'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('newsletter_deliveries', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      campaign_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'newsletter_campaigns', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      subscriber_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'newsletter_subscribers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'pending' }, // pending, processing, sent, retry_pending, failed, cancelled
      attempt_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      next_attempt_at: { type: Sequelize.DATE, allowNull: true },
      provider_message_id: { type: Sequelize.STRING(255), allowNull: true },
      last_error_code: { type: Sequelize.STRING(100), allowNull: true },
      last_error_message: { type: Sequelize.TEXT, allowNull: true },
      sent_at: { type: Sequelize.DATE, allowNull: true },
      failed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('newsletter_deliveries', ['campaign_id'], { name: 'idx_newsletter_deliveries_campaign_id' });
    await queryInterface.addIndex('newsletter_deliveries', ['subscriber_id'], { name: 'idx_newsletter_deliveries_subscriber_id' });
    await queryInterface.addIndex('newsletter_deliveries', ['status'], { name: 'idx_newsletter_deliveries_status' });
    await queryInterface.addIndex('newsletter_deliveries', ['next_attempt_at'], { name: 'idx_newsletter_deliveries_next_attempt_at' });
    await queryInterface.addIndex(
      'newsletter_deliveries',
      ['campaign_id', 'subscriber_id'],
      { name: 'idx_newsletter_deliveries_campaign_subscriber_unique', unique: true }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('newsletter_deliveries');
  }
};
