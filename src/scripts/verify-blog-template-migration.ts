import { sequelize } from '../config/database.js';

try {
  const [rows] = await sequelize.query(`
    SELECT
      COUNT(*) AS total,
      SUM(template_key = 'template_1' AND template_version = 1 AND template_config_json IS NOT NULL) AS backfilled,
      SUM(template_key IS NULL OR template_version IS NULL OR template_config_json IS NULL) AS invalid_rows
    FROM blog_versions
  `);
  console.log(JSON.stringify(rows));
} finally {
  await sequelize.close();
}
