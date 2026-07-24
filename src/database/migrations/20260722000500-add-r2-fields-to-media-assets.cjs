'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('media_assets', 'storage_provider', {
      type: Sequelize.STRING(40),
      allowNull: false,
      defaultValue: 'cloudflare_r2',
      after: 'client_id'
    });
    await queryInterface.addColumn('media_assets', 'bucket_name', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'storage_provider'
    });
    await queryInterface.addColumn('media_assets', 'original_object_key', {
      type: Sequelize.STRING(1024),
      allowNull: true,
      after: 'provider_asset_id'
    });
    await queryInterface.addColumn('media_assets', 'variants_json', {
      type: Sequelize.JSON,
      allowNull: true,
      after: 'original_object_key'
    });
    await queryInterface.addColumn('media_assets', 'original_url', {
      type: Sequelize.STRING(2048),
      allowNull: true,
      after: 'variants_json'
    });
    await queryInterface.addColumn('media_assets', 'output_mime_type', {
      type: Sequelize.STRING(120),
      allowNull: true,
      after: 'mime_type'
    });
    await queryInterface.addColumn('media_assets', 'original_file_name', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'purpose'
    });
    await queryInterface.addColumn('media_assets', 'file_size', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      after: 'size_bytes'
    });
    await queryInterface.addColumn('media_assets', 'alt_text', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'height'
    });

    await queryInterface.changeColumn('media_assets', 'provider', {
      type: Sequelize.STRING(40),
      allowNull: false,
      defaultValue: 'cloudflare_r2'
    });
    await queryInterface.changeColumn('media_assets', 'provider_asset_id', {
      type: Sequelize.STRING(255),
      allowNull: true
    });

    await queryInterface.addIndex('media_assets', ['storage_provider'], { name: 'idx_media_assets_storage_provider' });
    await queryInterface.addIndex('media_assets', ['original_object_key'], { name: 'idx_media_assets_original_object_key' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('media_assets', 'idx_media_assets_original_object_key');
    await queryInterface.removeIndex('media_assets', 'idx_media_assets_storage_provider');

    await queryInterface.changeColumn('media_assets', 'provider_asset_id', {
      type: Sequelize.STRING(255),
      allowNull: false
    });
    await queryInterface.changeColumn('media_assets', 'provider', {
      type: Sequelize.STRING(40),
      allowNull: false,
      defaultValue: 'cloudflare_images'
    });

    await queryInterface.removeColumn('media_assets', 'alt_text');
    await queryInterface.removeColumn('media_assets', 'file_size');
    await queryInterface.removeColumn('media_assets', 'original_file_name');
    await queryInterface.removeColumn('media_assets', 'output_mime_type');
    await queryInterface.removeColumn('media_assets', 'original_url');
    await queryInterface.removeColumn('media_assets', 'variants_json');
    await queryInterface.removeColumn('media_assets', 'original_object_key');
    await queryInterface.removeColumn('media_assets', 'bucket_name');
    await queryInterface.removeColumn('media_assets', 'storage_provider');
  }
};
