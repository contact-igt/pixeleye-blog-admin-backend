import { initializeBlogAssociations } from '../../database/associations/index.js';

export function applyBlogAssociations(): void {
  initializeBlogAssociations();
}

export { Blog } from './blog.model.js';
export { BlogVersion } from './blog-version.model.js';
export type { BlogStatus } from './blog.model.js';
export type { BlogVersionType } from './blog-version.model.js';
