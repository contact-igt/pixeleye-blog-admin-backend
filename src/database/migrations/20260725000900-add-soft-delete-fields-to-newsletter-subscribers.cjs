'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn(
        'newsletter_subscribers',
        'deleted_at',
        {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null
        },
        { transaction }
      );

      await queryInterface.addColumn(
        'newsletter_subscribers',
        'deleted_by',
        {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          defaultValue: null,
          references: {
            model: 'admin_users',
            key: 'id'
          },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        { transaction }
      );

      await queryInterface.addColumn(
        'newsletter_subscribers',
        'deletion_reason',
        {
          type: Sequelize.STRING(255),
          allowNull: true,
          defaultValue: null
        },
        { transaction }
      );

      await queryInterface.addColumn(
        'newsletter_subscribers',
        'anonymized_at',
        {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null
        },
        { transaction }
      );

      await queryInterface.addIndex(
        'newsletter_subscribers',
        ['deleted_at'],
        { transaction, name: 'idx_newsletter_subscribers_deleted_at' }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex(
        'newsletter_subscribers',
        'idx_newsletter_subscribers_deleted_at',
        { transaction }
      );

      await queryInterface.removeColumn(
        'newsletter_subscribers',
        'anonymized_at',
        { transaction }
      );

      await queryInterface.removeColumn(
        'newsletter_subscribers',
        'deletion_reason',
        { transaction }
      );

      await queryInterface.removeColumn(
        'newsletter_subscribers',
        'deleted_by',
        { transaction }
      );

      await queryInterface.removeColumn(
        'newsletter_subscribers',
        'deleted_at',
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
