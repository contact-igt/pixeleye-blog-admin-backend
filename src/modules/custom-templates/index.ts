import { initializeCustomTemplateAssociations } from '../../database/associations/index.js';

export function applyCustomTemplateAssociations(): void {
  initializeCustomTemplateAssociations();
}

export { CustomTemplate, CustomTemplateVersion } from './custom-template.model.js';
export type { CustomTemplateStatus } from './custom-template.model.js';
export { createCustomTemplateService } from './custom-template.service.js';
export type { CustomTemplateService } from './custom-template.service.js';
export { createCustomTemplateRouter } from './custom-template.routes.js';
