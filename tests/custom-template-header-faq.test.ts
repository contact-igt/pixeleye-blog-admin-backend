import { describe, expect, it } from 'vitest';
import { validateBlogBlocks } from '../src/modules/blogs/blog-block.validation.js';
import { validateCustomTemplateLayout } from '../src/modules/blogs/custom-templates/custom-template.validation.js';
import { createDefaultBlogBlocks, type BlogBlocksDocument } from '../src/modules/blogs/blog-block.types.js';

function withHero(extra: Record<string, unknown> = {}): BlogBlocksDocument {
  const blocks = createDefaultBlogBlocks();
  blocks.custom_instances = {
    hero_1: {
      componentKey: 'hero', category: 'Gastroenterology', breadcrumb: [],
      reviewer: { name: '', credentials: '' }, reading_time_minutes: null, ...extra
    } as any
  };
  return blocks;
}

function faqLayout(settings: Record<string, unknown>): any {
  return {
    schemaVersion: 1,
    layoutId: 'faq-layout',
    metadata: { name: 'FAQ', description: 'FAQ layout test.' },
    page: { contentWidth: 'full', background: 'white', spacing: 'normal', typography: 'editorial' },
    sections: [{
      id: 'sec', layout: 'full_width', responsiveStrategy: 'stack_on_mobile', enabled: true,
      slots: [{ id: 'slot', name: 'Main', components: [{ id: 'faq', componentKey: 'faq', blockId: 'faq_1', enabled: true, settings }] }]
    }]
  };
}

describe('Hero "Header style" (article header) option', () => {
  it('keeps the field optional so existing blogs stay valid', () => {
    expect(() => validateBlogBlocks(withHero())).not.toThrow();
  });

  it('accepts standard and article, and preserves the chosen value', () => {
    for (const style of ['standard', 'article'] as const) {
      const doc = validateBlogBlocks(withHero({ header_style: style }));
      expect((doc.custom_instances!.hero_1 as any).header_style).toBe(style);
    }
  });

  it('rejects unknown header styles', () => {
    expect(() => validateBlogBlocks(withHero({ header_style: 'fancy' }))).toThrow('Some article sections need attention');
  });
});

describe('FAQ "qa_list" layout', () => {
  const faqLayoutOf = (settings: Record<string, unknown>) =>
    (validateCustomTemplateLayout(faqLayout(settings)).sections[0].slots[0].components[0].settings as any).layout;

  it('accepts qa_list and image_accordion as chosen', () => {
    expect(faqLayoutOf({ layout: 'qa_list', defaultOpen: 'none' })).toBe('qa_list');
    expect(faqLayoutOf({ layout: 'image_accordion', defaultOpen: 'none' })).toBe('image_accordion');
  });

  it('defaults new FAQ components to qa_list and treats the legacy plain accordion as the Q&A list', () => {
    expect(faqLayoutOf({})).toBe('qa_list');
    expect(faqLayoutOf({ layout: 'accordion', defaultOpen: 'none' })).toBe('qa_list');
  });

  it('rejects unknown FAQ layouts', () => {
    expect(() => validateCustomTemplateLayout(faqLayout({ layout: 'carousel', defaultOpen: 'none' }))).toThrow('failed validation');
  });
});

describe('Hand-picked related blogs (blocks_json.related_blog_ids)', () => {
  const withRelated = (ids: unknown): BlogBlocksDocument => ({ ...createDefaultBlogBlocks(), related_blog_ids: ids as string[] });

  it('is optional so existing blogs stay valid', () => {
    expect(() => validateBlogBlocks(createDefaultBlogBlocks())).not.toThrow();
  });

  it('accepts and preserves numeric ids in the picked order', () => {
    expect(validateBlogBlocks(withRelated(['12', '3', '7'])).related_blog_ids).toEqual(['12', '3', '7']);
    expect(validateBlogBlocks(withRelated([])).related_blog_ids).toEqual([]);
  });

  it('rejects non-numeric ids, duplicates, and more than 10 picks', () => {
    expect(() => validateBlogBlocks(withRelated(['abc']))).toThrow('Some article sections need attention');
    expect(() => validateBlogBlocks(withRelated(['1', '1']))).toThrow('Some article sections need attention');
    expect(() => validateBlogBlocks(withRelated(Array.from({ length: 11 }, (_, i) => String(i + 1))))).toThrow('Some article sections need attention');
  });
});
