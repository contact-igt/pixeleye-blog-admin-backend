'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('blog_feedback', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      blog_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'blogs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      blog_version_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'blog_versions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      response: { type: Sequelize.STRING(10), allowNull: false }, // 'yes' or 'no'
      visitor_key_hash: { type: Sequelize.STRING(255), allowNull: false },
      user_agent_hash: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

    await queryInterface.addIndex('blog_feedback', ['blog_id'], { name: 'idx_blog_feedback_blog_id' });
    await queryInterface.addIndex('blog_feedback', ['blog_version_id'], { name: 'idx_blog_feedback_blog_version_id' });
    await queryInterface.addIndex('blog_feedback', ['response'], { name: 'idx_blog_feedback_response' });
    await queryInterface.addIndex('blog_feedback', ['created_at'], { name: 'idx_blog_feedback_created_at' });
    await queryInterface.addIndex(
      'blog_feedback',
      ['blog_version_id', 'visitor_key_hash'],
      { name: 'idx_blog_feedback_version_visitor_unique', unique: true }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('blog_feedback');
  }
};
