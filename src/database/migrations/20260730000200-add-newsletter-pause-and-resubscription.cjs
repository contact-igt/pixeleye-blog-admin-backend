'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const adminReference = { model: 'admin_users', key: 'id' };
    await queryInterface.addColumn('newsletter_campaigns', 'paused_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn('newsletter_campaigns', 'paused_by', { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: adminReference, onDelete: 'SET NULL', onUpdate: 'CASCADE' });
    await queryInterface.addColumn('newsletter_campaigns', 'pause_reason_code', { type: Sequelize.STRING(100), allowNull: true });
    await queryInterface.addColumn('newsletter_campaigns', 'pause_reason_message', { type: Sequelize.STRING(1000), allowNull: true });
    await queryInterface.addColumn('newsletter_campaigns', 'auto_paused', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn('newsletter_campaigns', 'resume_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn('newsletter_campaigns', 'deleted_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn('newsletter_campaigns', 'deleted_by', { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: adminReference, onDelete: 'SET NULL', onUpdate: 'CASCADE' });
    await queryInterface.addColumn('newsletter_campaigns', 'delete_reason', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.addIndex('newsletter_campaigns', ['deleted_at'], { name: 'idx_newsletter_campaigns_deleted_at' });
    await queryInterface.addColumn('newsletter_subscribers', 'resubscription_token_hash', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.addColumn('newsletter_subscribers', 'resubscription_expires_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn('newsletter_subscribers', 'resubscription_requested_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn('newsletter_subscribers', 'subscribed_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addIndex('newsletter_subscribers', ['resubscription_token_hash'], { name: 'idx_newsletter_subscribers_resubscription_token_hash' });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('newsletter_subscribers', 'idx_newsletter_subscribers_resubscription_token_hash');
    for (const column of ['subscribed_at', 'resubscription_requested_at', 'resubscription_expires_at', 'resubscription_token_hash']) await queryInterface.removeColumn('newsletter_subscribers', column);
    await queryInterface.removeIndex('newsletter_campaigns', 'idx_newsletter_campaigns_deleted_at');
    for (const column of ['delete_reason', 'deleted_by', 'deleted_at', 'resume_at', 'auto_paused', 'pause_reason_message', 'pause_reason_code', 'paused_by', 'paused_at']) await queryInterface.removeColumn('newsletter_campaigns', column);
  }
};
