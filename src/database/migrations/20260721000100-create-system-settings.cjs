"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "system_settings",
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
        },
        setting_key: {
          type: Sequelize.STRING(120),
          allowNull: false,
          unique: true,
        },
        setting_value: { type: Sequelize.TEXT, allowNull: true },
        setting_group: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: "general",
        },
        is_public: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal(
            "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
          ),
        },
      },
      { charset: "utf8mb4", collate: "utf8mb4_unicode_ci" },
    );
    await queryInterface.addIndex("system_settings", ["setting_group"], {
      name: "idx_system_settings_group",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("system_settings");
  },
};
