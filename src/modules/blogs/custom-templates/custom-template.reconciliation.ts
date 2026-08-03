import type { BlogBlocksDocument, CustomBlockInstanceContent } from '../blog-block.types.js';
import { createDefaultCustomInstanceContent } from '../blog-block.types.js';
import { getComponentDefinition } from './custom-template.registry.js';
import type { CustomTemplateLayoutConfigV1 } from './custom-template.types.js';

export interface ActiveContentReference {
  blockId: string;
  componentKey: CustomBlockInstanceContent['componentKey'];
}

export interface CustomTemplateReconciliationResult {
  document: BlogBlocksDocument;
  initializedBlockIds: string[];
  orphanBlockIds: string[];
  recoveredBlockIds: string[];
}

export function collectActiveContentReferences(layout: CustomTemplateLayoutConfigV1): ActiveContentReference[] {
  const references: ActiveContentReference[] = [];
  const seen = new Set<string>();
  for (const section of layout.sections) {
    if (section.enabled === false) continue;
    for (const slot of section.slots) {
      for (const component of slot.components) {
        if (component.enabled === false) continue;
        const definition = getComponentDefinition(component.componentKey);
        if (!definition.editableInBlog || !definition.requiresBlockId || component.componentKey === 'rich_article_content') continue;
        const blockId = (component as { blockId?: string }).blockId;
        if (!blockId || seen.has(blockId)) continue;
        seen.add(blockId);
        references.push({ blockId, componentKey: component.componentKey as CustomBlockInstanceContent['componentKey'] });
      }
    }
  }
  return references;
}

function createRecoveryBlockId(blockId: string, componentKey: string, used: Set<string>): string {
  const base = `recovery_${blockId}_${componentKey}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 58);
  let candidate = base;
  let suffix = 1;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 60 - String(suffix).length)}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function reconcileCustomTemplateBlocks(
  layout: CustomTemplateLayoutConfigV1,
  document: BlogBlocksDocument,
  options: { keepOrphans?: boolean } = {}
): CustomTemplateReconciliationResult {
  const keepOrphans = options.keepOrphans !== false;
  const references = collectActiveContentReferences(layout);
  const activeIds = new Set(references.map((reference) => reference.blockId));
  const existing = document.custom_instances ?? {};
  const nextInstances: Record<string, CustomBlockInstanceContent> = keepOrphans ? { ...existing } : {};
  const initializedBlockIds: string[] = [];
  const recoveredBlockIds: string[] = [];
  const usedIds = new Set(Object.keys(nextInstances));

  for (const reference of references) {
    const current = existing[reference.blockId];
    if (current?.componentKey === reference.componentKey) {
      nextInstances[reference.blockId] = current;
      continue;
    }
    if (keepOrphans && current) {
      const recoveryId = createRecoveryBlockId(reference.blockId, current.componentKey, usedIds);
      nextInstances[recoveryId] = current;
      recoveredBlockIds.push(recoveryId);
    }
    nextInstances[reference.blockId] = createDefaultCustomInstanceContent(reference.componentKey);
    initializedBlockIds.push(reference.blockId);
  }

  const orphanBlockIds = Object.keys(existing).filter((blockId) => !activeIds.has(blockId));
  return {
    document: { ...document, custom_instances: nextInstances },
    initializedBlockIds,
    orphanBlockIds,
    recoveredBlockIds
  };
}