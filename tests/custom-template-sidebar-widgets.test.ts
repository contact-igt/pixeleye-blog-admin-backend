import { describe, expect, it } from 'vitest';
import { validateCustomTemplateLayout } from '../src/modules/blogs/custom-templates/custom-template.validation.js';

function twoColumnLayout(sideComponents: unknown[], mainComponents: unknown[] = []): any {
  return {
    schemaVersion: 1,
    layoutId: 'two-col',
    metadata: { name: 'Two Column', description: 'Content + sidebar widgets.' },
    page: { contentWidth: 'wide', background: 'white', spacing: 'normal', typography: 'editorial' },
    sections: [{
      id: 'sec-body',
      layout: 'content_sidebar',
      responsiveStrategy: 'sidebar_below_on_tablet',
      enabled: true,
      slots: [
        { id: 'slot-main', name: 'Main', components: mainComponents },
        { id: 'slot-side', name: 'Sidebar', components: sideComponents }
      ]
    }]
  };
}

const categories = (settings: Record<string, unknown> = {}) => ({
  id: 'cats', componentKey: 'blog_categories', enabled: true,
  settings: { heading: 'Categories', maxItems: 8, showCount: false, ...settings }
});
const recentRelated = (settings: Record<string, unknown> = {}) => ({
  id: 'rr', componentKey: 'recent_related_blogs', enabled: true,
  settings: { heading: '', mode: 'tabs', maxItems: 4, showImage: true, showDate: true, ...settings }
});

describe('Blog Categories + Recent & Related Blogs components', () => {
  it('accepts both widgets stacked in the sidebar slot of a two-column layout', () => {
    const result = validateCustomTemplateLayout(twoColumnLayout([categories(), recentRelated()]));
    expect(result.sections[0].slots[1].components.map((c) => c.componentKey)).toEqual(['blog_categories', 'recent_related_blogs']);
  });

  it('fills missing settings with defaults so older/partial templates still validate', () => {
    const bare = [
      { id: 'cats', componentKey: 'blog_categories', enabled: true, settings: {} },
      { id: 'rr', componentKey: 'recent_related_blogs', enabled: true, settings: {} }
    ];
    const [cats, rr] = validateCustomTemplateLayout(twoColumnLayout(bare)).sections[0].slots[1].components;
    expect(cats.settings).toEqual({ heading: 'Categories', maxItems: 8, showCount: false });
    expect(rr.settings).toEqual({ heading: '', mode: 'tabs', maxItems: 4, showImage: true, showDate: true });
  });

  it('allows the widgets in the main/full zones as well as the sidebar', () => {
    expect(() => validateCustomTemplateLayout(twoColumnLayout([], [categories(), recentRelated()]))).not.toThrow();
  });

  it('rejects an unknown mode and out-of-range limits', () => {
    expect(() => validateCustomTemplateLayout(twoColumnLayout([recentRelated({ mode: 'popular' })]))).toThrow('failed validation');
    expect(() => validateCustomTemplateLayout(twoColumnLayout([recentRelated({ maxItems: 11 })]))).toThrow('failed validation');
    expect(() => validateCustomTemplateLayout(twoColumnLayout([recentRelated({ maxItems: 0 })]))).toThrow('failed validation');
    expect(() => validateCustomTemplateLayout(twoColumnLayout([categories({ maxItems: 21 })]))).toThrow('failed validation');
  });

  it('rejects unknown settings and a blockId (these are data-driven system widgets, not blog-editable content)', () => {
    expect(() => validateCustomTemplateLayout(twoColumnLayout([categories({ color: 'red' })]))).toThrow('failed validation');
    expect(() => validateCustomTemplateLayout(twoColumnLayout([{ ...categories(), blockId: 'cats_1' }]))).toThrow();
  });
});
