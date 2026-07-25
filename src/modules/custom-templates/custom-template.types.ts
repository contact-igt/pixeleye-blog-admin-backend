import type { AdminUserRole } from '../auth/index.js';
import type { CustomTemplateStatus } from './custom-template.model.js';

export type { CustomTemplateStatus };

export const customTemplateStatuses = ['draft', 'active', 'archived'] as const satisfies readonly CustomTemplateStatus[];

export const CUSTOM_TEMPLATE_VERSION_CONFLICT = 'CUSTOM_TEMPLATE_VERSION_CONFLICT';
export const CUSTOM_TEMPLATE_IN_USE = 'CUSTOM_TEMPLATE_IN_USE';

export interface CustomTemplateActor {
  id: string;
  role: AdminUserRole;
}

export interface CustomTemplateUsage {
  total_blog_versions: number;
  distinct_blogs: number;
  published_blog_versions: number;
}
