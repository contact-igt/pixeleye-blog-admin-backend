'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('media_assets', 'trashed_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('media_assets', 'trashed_by', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'admin_users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('media_assets', 'purge_after', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('media_assets', 'restored_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('media_assets', 'restored_by', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'admin_users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('media_assets', 'deleted_by', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'admin_users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('media_assets', 'delete_failure_reason', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    await queryInterface.addIndex('media_assets', ['trashed_at'], { name: 'idx_media_assets_trashed_at' });
    await queryInterface.addIndex('media_assets', ['purge_after'], { name: 'idx_media_assets_purge_after' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('media_assets', 'idx_media_assets_purge_after');
    await queryInterface.removeIndex('media_assets', 'idx_media_assets_trashed_at');

    await queryInterface.removeColumn('media_assets', 'delete_failure_reason');
    await queryInterface.removeColumn('media_assets', 'deleted_by');
    await queryInterface.removeColumn('media_assets', 'restored_by');
    await queryInterface.removeColumn('media_assets', 'restored_at');
    await queryInterface.removeColumn('media_assets', 'purge_after');
    await queryInterface.removeColumn('media_assets', 'trashed_by');
    await queryInterface.removeColumn('media_assets', 'trashed_at');
  }
};
