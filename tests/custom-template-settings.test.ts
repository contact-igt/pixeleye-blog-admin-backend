import { describe, expect, it } from 'vitest';
import { validateCustomTemplateLayout } from '../src/modules/blogs/custom-templates/custom-template.validation.js';
import { CUSTOM_TEMPLATE_SETTING_VALUES } from '../src/modules/blogs/custom-templates/custom-template.settings.js';
import { normalizeStoredTemplate } from '../src/modules/blogs/blog-template.registry.js';

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
      expect(validateCustomTemplateLayout(value).sections[0].background).toBe(background);
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

  it('rejects unknown values and returns a complete valid layout unchanged', () => {
    const complete = layout();
    expect(validateCustomTemplateLayout(complete)).toEqual(complete);
    const invalid = layout();
    invalid.page.contentWidth = 'teleport';
    expect(() => validateCustomTemplateLayout(invalid)).toThrow('failed validation');
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
    expect(normalized.sections[0]).toMatchObject({ enabled: true, responsiveStrategy: 'stack_on_mobile', background: 'white' });
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
