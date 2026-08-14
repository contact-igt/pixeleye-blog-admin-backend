import type { CustomTemplatePageSettings, CustomTemplateSectionLayout, RegisteredComponentKey } from './custom-template.types.js';

export const CUSTOM_TEMPLATE_SETTING_VALUES = Object.freeze({
  contentWidth: ['narrow', 'standard', 'wide', 'full'] as const,
  pageBackground: ['white', 'soft_gray', 'brand_tint'] as const,
  spacing: ['compact', 'normal', 'spacious'] as const,
  typography: ['editorial', 'modern', 'clinical'] as const,
  sectionLayout: ['full_width', 'content_sidebar', 'two_column', 'three_column'] as const,
  responsiveStrategy: ['stack_on_mobile', 'sidebar_below_on_tablet', 'equal_columns', 'main_sidebar', 'three_to_two_to_one'] as const,
  sectionBackground: ['white', 'slate', 'sky'] as const
});

export const DEFAULT_CUSTOM_TEMPLATE_PAGE_SETTINGS: Readonly<CustomTemplatePageSettings> = Object.freeze({
  contentWidth: 'full',
  background: 'white',
  spacing: 'normal',
  typography: 'editorial'
});

const DEFAULT_COMPONENT_SETTINGS: Record<RegisteredComponentKey, Record<string, unknown>> = {
  hero: { height: 'standard', alignment: 'left', overlay: 'medium' },
  rich_article_content: { fontSize: 'medium', lineHeight: 'relaxed' },
  key_takeaways: { variant: 'soft', columns: 'one' },
  image_comparison: { columns: 'two', imageRatio: 'landscape' },
  numbered_list: { style: 'circle' },
  expert_quote: { orientation: 'horizontal', background: 'soft' },
  medical_cta: { style: 'navy', buttonLayout: 'inline' },
  faq: { layout: 'accordion', defaultOpen: 'none' },
  feedback: { showPrompt: true },
  share: { alignment: 'center' },
  medical_disclaimer: { variant: 'standard' },
  table: { variant: 'striped', headerStyle: 'brand_sky', alignment: 'left', maxRows: 4, maxColumns: 4 },
  article_table_of_contents: { headingLevels: [2, 3, 4], sticky: true },
  appointment_card: { heading: 'Book an Appointment', buttonLabel: 'Schedule Now', targetUrl: 'https://example.com/appointments' },
  newsletter_card: { heading: 'Subscribe to Newsletter', description: 'Get health tips.', buttonLabel: 'Subscribe' },
  spacer: { size: 'medium' },
  divider: { style: 'solid' }
};

function defaultResponsiveStrategy(layout: CustomTemplateSectionLayout) {
  return layout === 'content_sidebar' ? 'sidebar_below_on_tablet' : 'stack_on_mobile';
}

export function normalizeCustomTemplateSettings(rawConfig: unknown): unknown {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) return rawConfig;
  const config = JSON.parse(JSON.stringify(rawConfig)) as Record<string, any>;
  const page = config.page && typeof config.page === 'object' && !Array.isArray(config.page) ? config.page : {};
  config.page = { ...DEFAULT_CUSTOM_TEMPLATE_PAGE_SETTINGS, ...page };
  if (!Array.isArray(config.sections)) return config;

  let hasMainArticleContent = false;
  const seenBlockIds = new Set<string>();

  config.sections = config.sections.map((rawSection: unknown) => {
    if (!rawSection || typeof rawSection !== 'object' || Array.isArray(rawSection)) return rawSection;
    const section = rawSection as Record<string, any>;
    const normalized: Record<string, any> = {
      ...section,
      enabled: section.enabled ?? true,
      responsiveStrategy: section.responsiveStrategy ?? defaultResponsiveStrategy(section.layout),
      settings: {
        width: 'inherit',
        backgroundStyle: section.background ?? 'white',
        paddingTop: 'inherit',
        paddingBottom: 'inherit',
        ...(section.settings || {})
      }
    };
    
    delete normalized.background;
    if (!Array.isArray(section.slots)) return normalized;
    normalized.slots = section.slots.map((rawSlot: unknown) => {
      if (!rawSlot || typeof rawSlot !== 'object' || Array.isArray(rawSlot)) return rawSlot;
      const slot = rawSlot as Record<string, any>;
      if (!Array.isArray(slot.components)) return slot;
      return {
        ...slot,
        components: slot.components.map((rawComponent: unknown) => {
          if (!rawComponent || typeof rawComponent !== 'object' || Array.isArray(rawComponent)) return rawComponent;
          const component = rawComponent as Record<string, any>;
          if (typeof component.componentKey !== 'string' || !(component.componentKey in DEFAULT_COMPONENT_SETTINGS)) return component;
          const settings = component.settings && typeof component.settings === 'object' && !Array.isArray(component.settings)
            ? { ...component.settings }
            : {};
          if (component.componentKey === 'spacer' && settings.size === undefined && settings.height !== undefined) {
            settings.size = settings.height;
            delete settings.height;
          }
          if (component.componentKey === 'divider' && settings.style === undefined && settings.variant !== undefined) {
            settings.style = settings.variant === 'dots' ? 'dashed' : settings.variant;
            delete settings.variant;
          }
          let blockId = component.blockId;
          if (component.componentKey === 'rich_article_content') {
            if (!hasMainArticleContent) {
              hasMainArticleContent = true;
              blockId = blockId || 'article_content';
            } else if (!blockId || blockId === 'article_content' || seenBlockIds.has(blockId)) {
              blockId = component.id ? `article_${component.id}` : `rich_article_extra_${seenBlockIds.size + 1}`;
            }
          }
          if (blockId) {
            seenBlockIds.add(blockId);
          }
          return {
            ...component,
            ...(blockId ? { blockId } : {}),
            enabled: component.enabled ?? true,
            settings: { ...DEFAULT_COMPONENT_SETTINGS[component.componentKey as RegisteredComponentKey], ...settings }
          };
        })
      };
    });
    return normalized;
  });
  return config;
}
