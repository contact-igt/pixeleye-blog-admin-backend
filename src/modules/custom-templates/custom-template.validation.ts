import { z } from 'zod';
import { customTemplateStatuses } from './custom-template.types.js';

const optionalNumericString = z.string().trim().regex(/^\d+$/).optional();

export const customTemplateSortFields = ['created_at', 'updated_at', 'name', 'status'] as const;
export const customTemplateSortOrders = ['asc', 'desc'] as const;

export const createCustomTemplateSchema = z.object({
  name: z.string().trim().min(1).max(191),
  description: z.string().trim().max(2000).optional().nullable().transform((value) => value || null),
  layout_config_json: z.unknown()
}).strict();

export const updateCustomTemplateMetadataSchema = z.object({
  name: z.string().trim().min(1).max(191).optional(),
  description: z.string().trim().max(2000).optional().nullable().transform((value) => value || null),
  expected_lock_version: z.coerce.number().int().positive()
}).strict().superRefine((value, context) => {
  if (value.name === undefined && value.description === undefined) {
    context.addIssue({ code: 'custom', message: 'At least one editable field is required' });
  }
});

export const saveCustomTemplateVersionSchema = z.object({
  layout_config_json: z.unknown(),
  change_summary: z.string().trim().max(500).optional().nullable().transform((value) => value || null),
  expected_lock_version: z.coerce.number().int().positive()
}).strict();

export const lifecyclePayloadSchema = z.object({
  expected_lock_version: z.coerce.number().int().positive()
}).strict();

export const duplicateCustomTemplatePayloadSchema = z.object({
  name: z.string().trim().min(1).max(191).optional(),
  source_version_id: optionalNumericString
}).strict();

export const customTemplateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).default(20).transform((value) => Math.min(value, 100)),
  search: z.string().trim().max(120).optional().transform((value) => value || undefined),
  status: z.enum(customTemplateStatuses).optional(),
  owner_id: optionalNumericString,
  sort_by: z.enum(customTemplateSortFields).default('updated_at'),
  sort_order: z.enum(customTemplateSortOrders).default('desc')
});

export type CreateCustomTemplateInput = z.infer<typeof createCustomTemplateSchema>;
export type UpdateCustomTemplateMetadataInput = z.infer<typeof updateCustomTemplateMetadataSchema>;
export type SaveCustomTemplateVersionInput = z.infer<typeof saveCustomTemplateVersionSchema>;
export type LifecyclePayloadInput = z.infer<typeof lifecyclePayloadSchema>;
export type DuplicateCustomTemplatePayloadInput = z.infer<typeof duplicateCustomTemplatePayloadSchema>;
export type CustomTemplateListQuery = z.infer<typeof customTemplateListQuerySchema>;
