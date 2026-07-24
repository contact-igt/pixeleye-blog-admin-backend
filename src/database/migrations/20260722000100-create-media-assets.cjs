'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('media_assets', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
      client_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      provider: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'cloudflare_images' },
      provider_asset_id: { type: Sequelize.STRING(255), allowNull: false },
      purpose: { type: Sequelize.STRING(40), allowNull: false },
      original_filename: { type: Sequelize.STRING(255), allowNull: false },
      mime_type: { type: Sequelize.STRING(120), allowNull: false },
      size_bytes: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      width: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      height: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      metadata: { type: Sequelize.JSON, allowNull: true },
      status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'active' },
      uploaded_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
      deleted_at: { type: Sequelize.DATE, allowNull: true }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('media_assets', ['client_id'], { name: 'idx_media_assets_client_id' });
    await queryInterface.addIndex('media_assets', ['provider', 'provider_asset_id'], { name: 'idx_media_assets_provider_asset_id' });
    await queryInterface.addIndex('media_assets', ['purpose'], { name: 'idx_media_assets_purpose' });
    await queryInterface.addIndex('media_assets', ['status'], { name: 'idx_media_assets_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('media_assets');
  }
};
