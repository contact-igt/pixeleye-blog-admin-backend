import { ZodError } from 'zod';
import { ApiError } from '../../../utils/api-error.js';
import type { BlogBlocksDocument } from '../blog-block.types.js';
import { isRegisteredComponentKey, getComponentDefinition } from './custom-template.registry.js';
import { customTemplateLayoutConfigV1Schema } from './custom-template.schema.js';
import {
  CUSTOM_TEMPLATE_LIMITS,
  CUSTOM_TEMPLATE_SCHEMA_VERSION,
  type CustomTemplateLayoutConfigV1
} from './custom-template.types.js';
import { normalizeCustomTemplateSettings } from './custom-template.settings.js';

export interface CustomTemplateValidationError {
  path: string;
  message: string;
}

export function validateCustomTemplateLayout(
  rawConfig: unknown,
  blocksDoc?: BlogBlocksDocument | null
): CustomTemplateLayoutConfigV1 {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    throw new ApiError(422, 'Custom template configuration is invalid.', [
      { field: 'template_config_json', message: 'Configuration must be an object.' }
    ]);
  }

  const normalizedConfig = normalizeCustomTemplateSettings(rawConfig);
  const configObj = normalizedConfig as Record<string, unknown>;
  if (configObj.schemaVersion !== CUSTOM_TEMPLATE_SCHEMA_VERSION) {
    throw new ApiError(422, 'Custom template schema version is not supported.', [
      {
        field: 'template_config_json.schemaVersion',
        message: `Schema version ${String(configObj.schemaVersion)} is not supported. Current version is ${CUSTOM_TEMPLATE_SCHEMA_VERSION}.`
      }
    ]);
  }

  let parsed: CustomTemplateLayoutConfigV1;
  try {
    parsed = customTemplateLayoutConfigV1Schema.parse(normalizedConfig) as CustomTemplateLayoutConfigV1;
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.issues.map((issue) => ({
        field: `template_config_json.${issue.path.join('.')}`,
        message: issue.message
      }));
      throw new ApiError(422, 'Custom template configuration failed validation.', errors);
    }
    throw error;
  }

  const errors: CustomTemplateValidationError[] = [];
  const sectionIds = new Set<string>();
  const slotIds = new Set<string>();
  const componentIds = new Set<string>();
  const blockIdPaths = new Map<string, string>();
  let totalComponents = 0;

  // Expected slots per layout
  const expectedSlotCounts: Record<string, number> = {
    full_width: 1,
    content_sidebar: 2,
    two_column: 2,
    three_column: 3
  };

  parsed.sections.forEach((section, secIdx) => {
    if (sectionIds.has(section.id)) {
      errors.push({
        path: `sections[${secIdx}].id`,
        message: `Duplicate section ID: '${section.id}'`
      });
    }
    sectionIds.add(section.id);

    const expectedSlots = expectedSlotCounts[section.layout];
    if (expectedSlots !== undefined && section.slots.length !== expectedSlots) {
      errors.push({
        path: `sections[${secIdx}].slots`,
        message: `Layout '${section.layout}' requires exactly ${expectedSlots} slot(s), but found ${section.slots.length}.`
      });
    }

    section.slots.forEach((slot, slotIdx) => {
      if (slotIds.has(slot.id)) {
        errors.push({
          path: `sections[${secIdx}].slots[${slotIdx}].id`,
          message: `Duplicate slot ID: '${slot.id}'`
        });
      }
      slotIds.add(slot.id);

      slot.components.forEach((comp, compIdx) => {
        totalComponents++;
        const compPath = `sections[${secIdx}].slots[${slotIdx}].components[${compIdx}]`;

        if (componentIds.has(comp.id)) {
          errors.push({
            path: `${compPath}.id`,
            message: `Duplicate component ID: '${comp.id}'`
          });
        }
        componentIds.add(comp.id);

        if (!isRegisteredComponentKey(comp.componentKey)) {
          errors.push({
            path: `${compPath}.componentKey`,
            message: `Unknown component key: '${String(comp.componentKey)}'`
          });
          return;
        }

        const def = getComponentDefinition(comp.componentKey);

        // Zone validation
        const zone = section.layout === 'content_sidebar' && slotIdx === 1 ? 'sidebar' : section.layout === 'full_width' ? 'full' : 'main';
        if (!def.allowedZones.includes(zone)) {
          errors.push({
            path: `${compPath}.componentKey`,
            message: `Component '${comp.componentKey}' is not allowed in zone '${zone}'. Allowed zones: ${def.allowedZones.join(', ')}.`
          });
        }

        // Block-reference rules
        if (def.requiresBlockId) {
          const blockId = (comp as { blockId?: string }).blockId;
          if (!blockId) {
            errors.push({
              path: `${compPath}.blockId`,
              message: `Content component '${comp.componentKey}' requires a blockId reference.`
            });
          } else {
            if (comp.componentKey !== 'rich_article_content' && blockId === 'article_content') {
              errors.push({ path: `${compPath}.blockId`, message: "The 'article_content' blockId is reserved for Rich Article Content." });
            }
            if (blockId !== 'article_content') {
              const firstPath = blockIdPaths.get(blockId);
              if (firstPath) {
                errors.push({ path: `${compPath}.blockId`, message: `Duplicate blockId '${blockId}'. First used at ${firstPath}.` });
              } else {
                blockIdPaths.set(blockId, `${compPath}.blockId`);
              }
            }
            const placementEnabled = section.enabled !== false && comp.enabled !== false;
            if (blocksDoc && placementEnabled && blockId !== 'article_content') {
              const instance = blocksDoc.custom_instances?.[blockId];
              if (!instance) {
                errors.push({ path: `${compPath}.blockId`, message: `Referenced block '${blockId}' was not found in blocks_json.custom_instances.` });
              } else if (instance.componentKey !== comp.componentKey) {
                errors.push({ path: `${compPath}.blockId`, message: `Referenced block '${blockId}' contains '${instance.componentKey}', not '${comp.componentKey}'.` });
              }
            }
          }
        } else {
          const rawInstance = comp as Record<string, unknown>;
          if (rawInstance.blockId !== undefined && rawInstance.blockId !== null) {
            errors.push({
              path: `${compPath}.blockId`,
              message: `Non-content component '${comp.componentKey}' must not specify a blockId.`
            });
          }
        }
      });
    });
  });

  if (totalComponents > CUSTOM_TEMPLATE_LIMITS.MAX_TOTAL_COMPONENTS) {
    errors.push({
      path: 'sections',
      message: `Total components (${totalComponents}) exceeds maximum allowed (${CUSTOM_TEMPLATE_LIMITS.MAX_TOTAL_COMPONENTS}).`
    });
  }

  if (errors.length > 0) {
    throw new ApiError(
      422,
      'Custom template configuration contains structural or reference errors.',
      errors.map((err) => ({ field: `template_config_json.${err.path}`, message: err.message }))
    );
  }

  return parsed;
}

/**
 * Enforces that a table's actual row/column count stays within the capacity configured on its
 * Custom Template component (settings.maxRows/maxColumns are a ceiling, not a fixed size).
 * Only call this on the explicit "save new content" path (see blog.service.ts versionPayload) —
 * NOT on read/reconcile paths for already-stored drafts/published content, so that shrinking a
 * template's limits later never breaks previously saved, previously valid blogs.
 */
export function validateCustomTemplateTableCapacity(
  layout: CustomTemplateLayoutConfigV1,
  blocksDoc: BlogBlocksDocument
): void {
  const errors: CustomTemplateValidationError[] = [];

  layout.sections.forEach((section, secIdx) => {
    section.slots.forEach((slot, slotIdx) => {
      slot.components.forEach((comp, compIdx) => {
        if (comp.componentKey !== 'table') return;
        const blockId = (comp as { blockId?: string }).blockId;
        if (!blockId) return;
        const instance = blocksDoc.custom_instances?.[blockId];
        if (!instance || instance.componentKey !== 'table') return;

        const compPath = `sections[${secIdx}].slots[${slotIdx}].components[${compIdx}]`;
        const { maxColumns, maxRows } = comp.settings;
        if (instance.headers.length > maxColumns) {
          errors.push({
            path: `${compPath}.blockId`,
            message: `Table '${blockId}' has ${instance.headers.length} columns, which exceeds this template's maximum of ${maxColumns}.`
          });
        }
        if (instance.rows.length > maxRows) {
          errors.push({
            path: `${compPath}.blockId`,
            message: `Table '${blockId}' has ${instance.rows.length} rows, which exceeds this template's maximum of ${maxRows}.`
          });
        }
      });
    });
  });

  if (errors.length > 0) {
    throw new ApiError(
      422,
      'Table content exceeds the capacity configured on this Custom Template.',
      errors.map((err) => ({ field: `blocks_json.${err.path}`, message: err.message }))
    );
  }
}

export function isValidCustomTemplateConfig(rawConfig: unknown, blocksDoc?: BlogBlocksDocument | null): boolean {
  try {
    validateCustomTemplateLayout(rawConfig, blocksDoc);
    return true;
  } catch {
    return false;
  }
}
