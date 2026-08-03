'use strict';

const tableName = 'newsletter_worker_heartbeats';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(tableName, 'process_id', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn(tableName, 'hostname', { type: Sequelize.STRING(255), allowNull: false, defaultValue: 'unknown' });
    await queryInterface.addColumn(tableName, 'claim_status', { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'unknown' });
    await queryInterface.addColumn(tableName, 'last_successful_poll_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn(tableName, 'last_successful_claim_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn(tableName, 'last_successful_send_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn(tableName, 'last_error_code', { type: Sequelize.STRING(100), allowNull: true });
    await queryInterface.addColumn(tableName, 'last_error_message', { type: Sequelize.STRING(1000), allowNull: true });
    await queryInterface.addColumn(tableName, 'consecutive_poll_failures', { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn(tableName, 'consecutive_claim_failures', { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn(tableName, 'last_claim_error_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn(tableName, 'last_heartbeat_error_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn(tableName, 'last_recovery_at', { type: Sequelize.DATE(3), allowNull: true });
  },

  async down(queryInterface) {
    for (const column of [
      'last_recovery_at', 'last_heartbeat_error_at', 'last_claim_error_at',
      'consecutive_claim_failures', 'consecutive_poll_failures', 'last_error_message',
      'last_error_code', 'last_successful_send_at', 'last_successful_claim_at',
      'last_successful_poll_at', 'claim_status', 'hostname', 'process_id'
    ]) {
      await queryInterface.removeColumn(tableName, column);
    }
  }
};
