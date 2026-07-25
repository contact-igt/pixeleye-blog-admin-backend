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

  const configObj = rawConfig as Record<string, unknown>;
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
    parsed = customTemplateLayoutConfigV1Schema.parse(rawConfig) as CustomTemplateLayoutConfigV1;
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
        if (def.category === 'content') {
          if (!comp.blockId) {
            errors.push({
              path: `${compPath}.blockId`,
              message: `Content component '${comp.componentKey}' requires a blockId reference.`
            });
          } else if (blocksDoc && def.requiredBlockKey !== 'article_content') {
            const reqKey = def.requiredBlockKey as keyof typeof blocksDoc.blocks;
            const blockExists = Boolean(
              blocksDoc.custom_instances?.[comp.blockId] || (reqKey && blocksDoc.blocks?.[reqKey])
            );
            if (!blockExists) {
              errors.push({
                path: `${compPath}.blockId`,
                message: `Referenced block '${comp.blockId}' was not found in blocks_json.custom_instances.`
              });
            }
          }
        } else {
          // System & structural components MUST NOT have blockId
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

export function isValidCustomTemplateConfig(rawConfig: unknown, blocksDoc?: BlogBlocksDocument | null): boolean {
  try {
    validateCustomTemplateLayout(rawConfig, blocksDoc);
    return true;
  } catch {
    return false;
  }
}
