'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('admin_sessions', 'session_family_id', {
      type: Sequelize.STRING(36),
      allowNull: true,
      after: 'admin_user_id'
    });
    await queryInterface.addColumn('admin_sessions', 'parent_session_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      after: 'replaced_by_session_id'
    });

    await queryInterface.sequelize.query('UPDATE admin_sessions SET session_family_id = UUID() WHERE session_family_id IS NULL');

    await queryInterface.addIndex('admin_sessions', ['session_family_id'], { name: 'idx_admin_sessions_session_family_id' });
    await queryInterface.addIndex('admin_sessions', ['parent_session_id'], { name: 'idx_admin_sessions_parent_session_id' });
    await queryInterface.addIndex('admin_sessions', ['admin_user_id', 'session_family_id'], { name: 'idx_admin_sessions_user_family' });

    await queryInterface.addConstraint('admin_sessions', {
      fields: ['parent_session_id'],
      type: 'foreign key',
      name: 'fk_admin_sessions_parent_session_id',
      references: { table: 'admin_sessions', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('admin_sessions', 'fk_admin_sessions_parent_session_id');
    await queryInterface.removeIndex('admin_sessions', 'idx_admin_sessions_user_family');
    await queryInterface.removeIndex('admin_sessions', 'idx_admin_sessions_parent_session_id');
    await queryInterface.removeIndex('admin_sessions', 'idx_admin_sessions_session_family_id');
    await queryInterface.removeColumn('admin_sessions', 'parent_session_id');
    await queryInterface.removeColumn('admin_sessions', 'session_family_id');
  }
};
