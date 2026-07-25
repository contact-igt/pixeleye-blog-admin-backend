'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('newsletter_deliveries', 'processing_started_at', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'failed_at'
    });

    await queryInterface.addColumn('newsletter_deliveries', 'failure_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'processing_started_at'
    });

    await queryInterface.addIndex('newsletter_deliveries', ['processing_started_at'], {
      name: 'idx_newsletter_deliveries_processing_started_at'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('newsletter_deliveries', 'processing_started_at');
    await queryInterface.removeColumn('newsletter_deliveries', 'failure_reason');
  }
};
