'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'newsletter_worker_heartbeats',
      {
        worker_instance_id: {
          type: Sequelize.STRING(100),
          allowNull: false,
          primaryKey: true,
        },
        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'starting',
        },
        database_ready: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        smtp_ready: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        started_at: {
          type: Sequelize.DATE(3),
          allowNull: false,
        },
        last_heartbeat_at: {
          type: Sequelize.DATE(3),
          allowNull: false,
        },
        stopped_at: {
          type: Sequelize.DATE(3),
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE(3),
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP(3)'),
        },
        updated_at: {
          type: Sequelize.DATE(3),
          allowNull: false,
          defaultValue: Sequelize.literal(
            'CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)',
          ),
        },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );

    await queryInterface.addIndex(
      'newsletter_worker_heartbeats',
      ['status', 'last_heartbeat_at'],
      { name: 'idx_newsletter_worker_heartbeats_status_latest' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('newsletter_worker_heartbeats');
  },
};
