import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';
import { getBlogTemplatePublicDefinition, listBlogTemplates } from '../blogs/blog-template.registry.js';

export interface TemplateUsage {
  draft_count: number;
  published_count: number;
  total_blog_count: number;
}

type UsageRow = { draft_count?: number | string; published_count?: number | string; total_blog_count?: number | string };

const usageSql = `
  SELECT
    COUNT(DISTINCT CASE WHEN draft_version.template_key = :templateKey THEN blogs.id END) AS draft_count,
    COUNT(DISTINCT CASE WHEN published_version.template_key = :templateKey THEN blogs.id END) AS published_count,
    COUNT(DISTINCT CASE WHEN draft_version.template_key = :templateKey OR published_version.template_key = :templateKey THEN blogs.id END) AS total_blog_count
  FROM blogs
  LEFT JOIN blog_versions AS draft_version ON draft_version.id = blogs.current_draft_version_id
  LEFT JOIN blog_versions AS published_version ON published_version.id = blogs.current_published_version_id
  WHERE blogs.status <> 'trashed'
`;

async function usageFor(templateKey: string): Promise<TemplateUsage> {
  const rows = await sequelize.query<UsageRow>(usageSql, { replacements: { templateKey }, type: QueryTypes.SELECT });
  const usage = rows[0] ?? {};
  return { draft_count: Number(usage.draft_count ?? 0), published_count: Number(usage.published_count ?? 0), total_blog_count: Number(usage.total_blog_count ?? 0) };
}

function libraryItem(template: ReturnType<typeof listBlogTemplates>[number], usage: TemplateUsage) {
  return { ...template, type: 'system' as const, is_editable: false, is_deletable: false, usage };
}

export function createTemplateService() {
  return {
    async listTemplates() {
      const templates = listBlogTemplates();
      const usages = await Promise.all(templates.map((template) => usageFor(template.key)));
      return { items: templates.map((template, index) => libraryItem(template, usages[index]!)) };
    },
    async getTemplate(templateKey: string) {
      const definition = getBlogTemplatePublicDefinition(templateKey);
      if (!definition) throw new ApiError(404, 'Template was not found');
      return { ...definition, type: 'system' as const, is_editable: false, is_deletable: false, usage: await usageFor(definition.key) };
    }
  };
}

export type TemplateService = ReturnType<typeof createTemplateService>;


