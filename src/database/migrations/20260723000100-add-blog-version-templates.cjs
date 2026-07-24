"use strict";

const templateOneConfig = {
  layout: "single_column",
  regions: [
    "featured_image",
    "article_title",
    "excerpt",
    "article_metadata",
    "article_content",
  ],
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("blog_versions", "template_key", {
      type: Sequelize.STRING(80),
      allowNull: true,
    });
    await queryInterface.addColumn("blog_versions", "template_version", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });
    await queryInterface.addColumn("blog_versions", "template_config_json", {
      type: Sequelize.JSON,
      allowNull: true,
    });

    await queryInterface.bulkUpdate(
      "blog_versions",
      {
        template_key: "template_1",
        template_version: 1,
        template_config_json: templateOneConfig,
      },
      {},
    );

    await queryInterface.changeColumn("blog_versions", "template_key", {
      type: Sequelize.STRING(80),
      allowNull: false,
    });
    await queryInterface.changeColumn("blog_versions", "template_version", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
    });
    await queryInterface.changeColumn("blog_versions", "template_config_json", {
      type: Sequelize.JSON,
      allowNull: false,
    });
    await queryInterface.addIndex(
      "blog_versions",
      ["template_key", "template_version"],
      { name: "idx_blog_versions_template" },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "blog_versions",
      "idx_blog_versions_template",
    );
    await queryInterface.removeColumn("blog_versions", "template_config_json");
    await queryInterface.removeColumn("blog_versions", "template_version");
    await queryInterface.removeColumn("blog_versions", "template_key");
  },
};
