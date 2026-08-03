'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeIndex('media_assets', 'idx_media_assets_client_id');
    await queryInterface.addIndex('media_assets', ['uploaded_by', 'client_id'], {
      name: 'ux_media_assets_uploader_client_id',
      unique: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('media_assets', 'ux_media_assets_uploader_client_id');
    await queryInterface.addIndex('media_assets', ['client_id'], {
      name: 'idx_media_assets_client_id'
    });
  }
};
