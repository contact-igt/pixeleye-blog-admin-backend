import { describe, expect, it } from 'vitest';
import { validateCustomTemplateLayout } from '../src/modules/blogs/custom-templates/custom-template.validation.js';
import { CUSTOM_TEMPLATE_SETTING_VALUES } from '../src/modules/blogs/custom-templates/custom-template.settings.js';
import { normalizeStoredTemplate } from '../src/modules/blogs/blog-template.registry.js';
import { createDefaultBlogBlocks } from '../src/modules/blogs/blog-block.types.js';

function layout(): any {
  return {
    schemaVersion: 1,
    layoutId: 'settings-contract',
    metadata: { name: 'Settings Contract', description: 'Focused settings test.' },
    page: { contentWidth: 'full', background: 'white', spacing: 'normal', typography: 'editorial' },
    sections: [{
      id: 'section-main',
      layout: 'full_width',
      responsiveStrategy: 'stack_on_mobile',
      enabled: true,
      background: 'white',
      slots: [{ id: 'slot-main', name: 'Main', components: [] }]
    }]
  };
}

describe('Custom Template settings backend contract', () => {
  it('accepts and preserves every registered Page-level value', () => {
    for (const contentWidth of CUSTOM_TEMPLATE_SETTING_VALUES.contentWidth) {
      const value = layout();
      value.page.contentWidth = contentWidth;
      expect(validateCustomTemplateLayout(value).page.contentWidth).toBe(contentWidth);
    }
    for (const background of CUSTOM_TEMPLATE_SETTING_VALUES.pageBackground) {
      const value = layout();
      value.page.background = background;
      expect(validateCustomTemplateLayout(value).page.background).toBe(background);
    }
    for (const spacing of CUSTOM_TEMPLATE_SETTING_VALUES.spacing) {
      const value = layout();
      value.page.spacing = spacing;
      expect(validateCustomTemplateLayout(value).page.spacing).toBe(spacing);
    }
    for (const typography of CUSTOM_TEMPLATE_SETTING_VALUES.typography) {
      const value = layout();
      value.page.typography = typography;
      expect(validateCustomTemplateLayout(value).page.typography).toBe(typography);
    }
  });

  it('accepts and preserves every registered Section-level value', () => {
    for (const responsiveStrategy of CUSTOM_TEMPLATE_SETTING_VALUES.responsiveStrategy) {
      const value = layout();
      value.sections[0].responsiveStrategy = responsiveStrategy;
      expect(validateCustomTemplateLayout(value).sections[0].responsiveStrategy).toBe(responsiveStrategy);
    }
    for (const background of CUSTOM_TEMPLATE_SETTING_VALUES.sectionBackground) {
      const value = layout();
      value.sections[0].background = background;
      expect(validateCustomTemplateLayout(value).sections[0].settings.backgroundStyle).toBe(background);
    }
    const slotCounts = { full_width: 1, content_sidebar: 2, two_column: 2, three_column: 3 };
    for (const sectionLayout of CUSTOM_TEMPLATE_SETTING_VALUES.sectionLayout) {
      const value = layout();
      value.sections[0].layout = sectionLayout;
      value.sections[0].slots = Array.from({ length: slotCounts[sectionLayout] }, (_, index) => ({
        id: `slot-${index}`,
        name: `Slot ${index}`,
        components: []
      }));
      expect(validateCustomTemplateLayout(value).sections[0].layout).toBe(sectionLayout);
    }
  });

  it('accepts and preserves section settings', () => {
    const value = layout();
    value.sections[0].settings = {
      width: 'standard',
      backgroundStyle: 'sky',
      paddingTop: 'compact',
      paddingBottom: 'spacious'
    };

    expect(validateCustomTemplateLayout(value).sections[0].settings).toEqual({
      width: 'standard',
      backgroundStyle: 'sky',
      paddingTop: 'compact',
      paddingBottom: 'spacious'
    });
  });

  it('rejects unknown values and returns a complete valid layout normalized', () => {
    const complete = layout();
    const normalized = validateCustomTemplateLayout(complete);
    expect(normalized).toMatchObject({
      ...complete,
      sections: [{
        id: 'section-main',
        layout: 'full_width',
        responsiveStrategy: 'stack_on_mobile',
        enabled: true,
        settings: {
          width: 'inherit',
          backgroundStyle: 'white',
          paddingTop: 'inherit',
          paddingBottom: 'inherit'
        },
        slots: complete.sections[0].slots
      }]
    });
    expect(normalized.sections[0]).not.toHaveProperty('background');
    const invalid = layout();
    invalid.page.contentWidth = 'teleport';
    expect(() => validateCustomTemplateLayout(invalid)).toThrow('failed validation');
  });

  it('accepts repeated Rich Article Content with a matching custom instance', () => {
    const value = layout();
    value.sections[0].slots[0].components.push(
      { id: 'article-main', componentKey: 'rich_article_content', blockId: 'article_content', enabled: true, settings: { fontSize: 'medium', lineHeight: 'relaxed' } },
      { id: 'article-extra', componentKey: 'rich_article_content', blockId: 'article_extra', enabled: true, settings: { fontSize: 'medium', lineHeight: 'relaxed' } }
    );
    const blocks = createDefaultBlogBlocks();
    blocks.custom_instances = {
      article_extra: {
        componentKey: 'rich_article_content',
        enabled: true,
        content_json: { type: 'doc', content: [{ type: 'paragraph' }] },
        html: '<p>Second body</p>'
      }
    };

    expect(validateCustomTemplateLayout(value, blocks).sections[0].slots[0].components).toHaveLength(2);
  });

  it('normalizes missing defaults and proven historical element aliases without mutating the source', () => {
    const legacy = layout();
    delete legacy.page;
    delete legacy.sections[0].enabled;
    delete legacy.sections[0].responsiveStrategy;
    delete legacy.sections[0].background;
    legacy.sections[0].slots[0].components.push({ id: 'legacy-spacer', componentKey: 'spacer', settings: { height: 'small' } });
    const normalized = validateCustomTemplateLayout(legacy);
    expect(normalized.page).toEqual({ contentWidth: 'full', background: 'white', spacing: 'normal', typography: 'editorial' });
    expect(normalized.sections[0]).toMatchObject({
      enabled: true,
      responsiveStrategy: 'stack_on_mobile',
      settings: {
        width: 'inherit',
        backgroundStyle: 'white',
        paddingTop: 'inherit',
        paddingBottom: 'inherit'
      }
    });
    expect(normalized.sections[0].slots[0].components[0]).toMatchObject({ enabled: true, settings: { size: 'small' } });
    expect(legacy).not.toHaveProperty('page');
  });

  it('keeps a Blog Template snapshot detached from later source layout edits', () => {
    const source = layout();
    const snapshot = normalizeStoredTemplate({
      templateKey: 'custom_template',
      templateVersion: 1,
      templateConfigJson: source,
      customTemplateId: '7',
      customTemplateVersionId: '11'
    });
    source.page.background = 'brand_tint';
    expect((snapshot.templateConfigJson as any).page.background).toBe('white');
    expect(snapshot.customTemplateId).toBe('7');
    expect(snapshot.customTemplateVersionId).toBe('11');
  });
});
