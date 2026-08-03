export const blogTemplateKeys = ['template_1', 'template_2'] as const;
export type BlogTemplateKey = (typeof blogTemplateKeys)[number];
export type BlogTemplateLayout = 'single_column' | 'article_sidebar';
export type BlogTemplateVersion = 1 | 2;

export const INTERNAL_CUSTOM_TEMPLATE_KEY = 'custom_template' as const;
export const storedBlogTemplateKeys = [...blogTemplateKeys, INTERNAL_CUSTOM_TEMPLATE_KEY] as const;
export type StoredBlogTemplateKey = (typeof storedBlogTemplateKeys)[number];

export const INTERNAL_CUSTOM_TEMPLATE_RENDERER_VERSION = 1;

export type SystemBlogTemplateSelection = { kind: 'system'; templateKey: BlogTemplateKey };
export type CustomBlogTemplateSelection = { kind: 'custom'; customTemplateId: string };
export type BlogTemplateSelection = SystemBlogTemplateSelection | CustomBlogTemplateSelection;

export interface BlogTemplateDefinition {
  key: BlogTemplateKey;
  version: BlogTemplateVersion;
  name: string;
  description: string;
  layout: BlogTemplateLayout;
  config: Readonly<Record<string, unknown>>;
}

export interface BlogTemplateSnapshot {
  templateKey: StoredBlogTemplateKey;
  templateVersion: number;
  templateConfigJson: Record<string, unknown>;
  customTemplateId: string | null;
  customTemplateVersionId: string | null;
  invalid?: boolean;
}

export interface BlogTemplatePublicDefinition {
  key: BlogTemplateKey;
  version: number;
  name: string;
  description: string;
  layout: BlogTemplateLayout;
  regions: readonly string[];
  supported_behaviors: readonly string[];
}

const definitions: readonly BlogTemplateDefinition[] = Object.freeze([
  Object.freeze({
    key: 'template_1',
    version: 2,
    name: 'Template 1',
    description: 'A complete healthcare editorial layout with hero, article content, callouts, expert guidance, FAQ and disclaimer.',
    layout: 'single_column',
    config: Object.freeze({
      layout: 'single_column',
      regions: Object.freeze(['hero', 'article_content', 'key_takeaways', 'visual_comparison', 'numbered_list', 'expert_quote', 'medical_cta', 'faq', 'engagement', 'medical_disclaimer'])
    })
  }),
  Object.freeze({
    key: 'template_1',
    version: 1,
    name: 'Template 1',
    description: 'A focused article layout with a centered reading column.',
    layout: 'single_column',
    config: Object.freeze({
      layout: 'single_column',
      regions: Object.freeze(['featured_image', 'article_title', 'excerpt', 'article_metadata', 'article_content'])
    })
  }),
  Object.freeze({
    key: 'template_2',
    version: 1,
    name: 'Template 2',
    description: 'A healthcare editorial article with sticky navigation, clinical callouts, FAQ and supporting sidebar cards.',
    layout: 'article_sidebar',
    config: Object.freeze({
      layout: 'article_sidebar',
      regions: Object.freeze(['hero', 'key_takeaways', 'article_content', 'visual_comparison', 'numbered_list', 'expert_quote', 'medical_cta', 'table_of_contents', 'appointment_card', 'newsletter_card', 'faq', 'engagement', 'medical_disclaimer']),
      sidebar: Object.freeze({ content: 'table_of_contents', heading_levels: Object.freeze([2, 3, 4]) })
    })
  })
]);

function cloneConfig(config: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

function parseStoredConfig(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return null; }
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}

export function listBlogTemplates() {
  const latestByKey = new Map<BlogTemplateKey, BlogTemplateDefinition>();
  for (const definition of definitions) {
    const current = latestByKey.get(definition.key);
    if (!current || definition.version > current.version) latestByKey.set(definition.key, definition);
  }
  return [...latestByKey.values()].map(({ key, version, name, description, layout }) => ({ key, version, name, description, layout }));
}

export function getBlogTemplatePublicDefinition(key: string, version?: number): BlogTemplatePublicDefinition | undefined {
  const template = getBlogTemplate(key, version);
  if (!template) return undefined;
  const regions = template.key === 'template_2'
    ? ['hero', 'key_takeaways', 'article_content', 'visual_comparison', 'numbered_list', 'expert_quote', 'medical_cta', 'table_of_contents_sidebar', 'appointment_card', 'newsletter_card', 'faq', 'engagement', 'medical_disclaimer']
    : template.version === 2
      ? ['hero', 'article_content', 'key_takeaways', 'visual_comparison', 'numbered_list', 'expert_quote', 'medical_cta', 'faq', 'engagement', 'medical_disclaimer']
      : ['featured_image', 'title', 'excerpt', 'metadata', 'article_content'];
  const supportedBehaviors = template.key === 'template_2'
    ? ['Responsive healthcare editorial layout', 'Dynamic article index with active-section highlighting', 'Sticky article navigation and supporting cards on desktop', 'Preview-safe contact, newsletter, feedback and share controls']
    : template.version === 2
      ? ['Responsive healthcare editorial hero', 'Controlled fixed regions for article content, callouts, comparison, FAQ and clinical guidance', 'Preview-only supportive actions remain non-functional in Admin Preview']
      : ['Responsive article layout', 'Focused centered reading column'];
  return { key: template.key, version: template.version, name: template.name, description: template.description, layout: template.layout, regions, supported_behaviors: supportedBehaviors };
}

export function getBlogTemplate(key: string, version?: number): BlogTemplateDefinition | undefined {
  const matches = definitions.filter((template) => template.key === key && (version === undefined || template.version === version));
  if (version === undefined) return matches.sort((a, b) => b.version - a.version)[0];
  return matches[0];
}

export function resolveBlogTemplate(key: string = 'template_1'): BlogTemplateSnapshot {
  const template = getBlogTemplate(key);
  if (!template) throw new Error(`Unsupported Blog template: ${key}`);
  return { templateKey: template.key, templateVersion: template.version, templateConfigJson: cloneConfig(template.config), customTemplateId: null, customTemplateVersionId: null };
}

interface StoredTemplateFields {
  templateKey?: string | null;
  template_key?: string | null;
  templateVersion?: number | null;
  template_version?: number | null;
  templateConfigJson?: unknown;
  template_config_json?: unknown;
  customTemplateId?: string | number | null;
  custom_template_id?: string | number | null;
  customTemplateVersionId?: string | number | null;
  custom_template_version_id?: string | number | null;
}

export function normalizeStoredTemplate(version: StoredTemplateFields): BlogTemplateSnapshot {
  const key = version.templateKey ?? version.template_key ?? 'template_1';
  const storedVersion = Number(version.templateVersion ?? version.template_version ?? 1);
  const config = parseStoredConfig(version.templateConfigJson ?? version.template_config_json);

  if (key === INTERNAL_CUSTOM_TEMPLATE_KEY) {
    const customTemplateId = version.customTemplateId ?? version.custom_template_id;
    const customTemplateVersionId = version.customTemplateVersionId ?? version.custom_template_version_id;
    if (config && customTemplateId && customTemplateVersionId) {
      return {
        templateKey: INTERNAL_CUSTOM_TEMPLATE_KEY,
        templateVersion: storedVersion,
        templateConfigJson: cloneConfig(config),
        customTemplateId: String(customTemplateId),
        customTemplateVersionId: String(customTemplateVersionId)
      };
    }
    return {
      templateKey: INTERNAL_CUSTOM_TEMPLATE_KEY,
      templateVersion: storedVersion,
      templateConfigJson: {},
      customTemplateId: customTemplateId ? String(customTemplateId) : null,
      customTemplateVersionId: customTemplateVersionId ? String(customTemplateVersionId) : null,
      invalid: true
    };
  }

  const definition = getBlogTemplate(key, storedVersion);
  if (definition && config) {
    return { templateKey: definition.key, templateVersion: storedVersion, templateConfigJson: cloneConfig(config), customTemplateId: null, customTemplateVersionId: null };
  }
  return resolveBlogTemplate('template_1');
}

export function templateMetadata(snapshot: BlogTemplateSnapshot) {
  if (snapshot.templateKey === INTERNAL_CUSTOM_TEMPLATE_KEY) {
    return { key: snapshot.templateKey, version: snapshot.templateVersion, name: 'Custom Template', layout: 'custom' as const, invalid: Boolean(snapshot.invalid) };
  }
  const definition = getBlogTemplate(snapshot.templateKey, snapshot.templateVersion);
  return definition ? { key: definition.key, version: snapshot.templateVersion, name: definition.name, layout: definition.layout } : null;
}

export function isValidTemplateSnapshot(value: unknown): boolean {
  const version = value as StoredTemplateFields | null;
  if (!version) return false;
  const key = String(version.templateKey ?? version.template_key ?? '');
  const templateVersion = Number(version.templateVersion ?? version.template_version ?? 0);
  const config = parseStoredConfig(version.templateConfigJson ?? version.template_config_json);
  if (key === INTERNAL_CUSTOM_TEMPLATE_KEY) {
    return Boolean(config && (version.customTemplateId ?? version.custom_template_id) && (version.customTemplateVersionId ?? version.custom_template_version_id));
  }
  return Boolean(getBlogTemplate(key, templateVersion) && config);
}

/**
 * A Blog's template snapshot must only be re-resolved when the admin actually changes the
 * template selection. `resolveBlogTemplateSelection` always follows a Custom Template's
 * *current* (latest-saved) version, so calling it on every save — even when `template_key` is
 * merely being resent unchanged, as the Blog editor form does on every "Save Draft" — would
 * silently replace the Blog's frozen layout snapshot with whatever the shared Custom Template
 * looks like *right now*, including edits made after this Blog was originally assigned to it.
 * That can drop sections the Blog's blocks_json content was authored against without any warning.
 */
export function hasTemplateSelectionChanged(
  currentSnapshot: BlogTemplateSnapshot,
  input: { template_key?: string; custom_template_id?: string | null }
): boolean {
  if (input.template_key === undefined) return false;
  if (currentSnapshot.invalid) return true;
  if (input.template_key !== currentSnapshot.templateKey) return true;
  if (input.template_key === INTERNAL_CUSTOM_TEMPLATE_KEY) {
    const nextCustomTemplateId = input.custom_template_id ? String(input.custom_template_id) : null;
    return nextCustomTemplateId !== (currentSnapshot.customTemplateId ?? null);
  }
  return false;
}


