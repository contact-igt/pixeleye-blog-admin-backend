import { describe, expect, it } from 'vitest';
import { aggregateBlogCategories, extractBlogCategories } from '../src/modules/blogs/blog-categories.js';

const template1 = (category: unknown) => ({ schema_version: 1, blocks: { hero: { category } } });
const custom = (...categories: string[]) => ({
  custom_instances: Object.fromEntries(categories.map((category, i) => [`hero_${i}`, { componentKey: 'hero', category }]))
});

describe('extractBlogCategories', () => {
  it('reads Template 1/2 and Custom Template hero categories, trimmed', () => {
    expect(extractBlogCategories(template1('  Cataract  '))).toEqual(['Cataract']);
    expect(extractBlogCategories(custom('Dry Eye'))).toEqual(['Dry Eye']);
  });

  it('accepts a JSON string and ignores empty, non-string and malformed values', () => {
    expect(extractBlogCategories(JSON.stringify(template1('Retina')))).toEqual(['Retina']);
    expect(extractBlogCategories(template1(''))).toEqual([]);
    expect(extractBlogCategories(template1(42))).toEqual([]);
    expect(extractBlogCategories('{not json')).toEqual([]);
    expect(extractBlogCategories(null)).toEqual([]);
    expect(extractBlogCategories({ custom_instances: { faq_1: { componentKey: 'faq', category: 'Nope' } } })).toEqual([]);
  });
});

describe('aggregateBlogCategories', () => {
  it('merges spellings that differ only by case/spacing and shows the most used spelling', () => {
    const result = aggregateBlogCategories([
      [template1('Dry Eye')],
      [template1('dry  eye')],
      [template1('Dry Eye')],
      [template1('DRY EYE')]
    ]);
    expect(result).toEqual([{ name: 'Dry Eye', count: 4 }]);
  });

  it('counts a blog once even when its draft and published versions both use the category', () => {
    expect(aggregateBlogCategories([[template1('Glaucoma'), template1('Glaucoma')]])).toEqual([{ name: 'Glaucoma', count: 1 }]);
  });

  it('counts a blog under the old and the new category when its draft was changed after publishing', () => {
    const result = aggregateBlogCategories([[template1('Cataract'), template1('Cataract Care')]]);
    expect(result.map((item) => item.name).sort()).toEqual(['Cataract', 'Cataract Care']);
  });

  it('sorts by popularity, then alphabetically, and skips blogs without a category', () => {
    const result = aggregateBlogCategories([
      [template1('Retina')],
      [template1('Cataract')],
      [custom('Cataract')],
      [template1('Squint')],
      [template1('')]
    ]);
    expect(result).toEqual([
      { name: 'Cataract', count: 2 },
      { name: 'Retina', count: 1 },
      { name: 'Squint', count: 1 }
    ]);
  });
});
