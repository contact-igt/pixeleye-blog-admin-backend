import { describe, expect, it } from 'vitest';
import { validateBlogBlocks } from '../src/modules/blogs/blog-block.validation.js';
import { validateCustomTemplateLayout, validateCustomTemplateTableCapacity } from '../src/modules/blogs/custom-templates/custom-template.validation.js';
import { createDefaultBlogBlocks, type BlogBlocksDocument } from '../src/modules/blogs/blog-block.types.js';

function layoutWithTable(maxRows = 4, maxColumns = 4): any {
  return {
    schemaVersion: 1,
    layoutId: 'table-contract',
    metadata: { name: 'Table Contract', description: 'Table capacity test.' },
    page: { contentWidth: 'full', background: 'white', spacing: 'normal', typography: 'editorial' },
    sections: [{
      id: 'section-main',
      layout: 'full_width',
      responsiveStrategy: 'stack_on_mobile',
      enabled: true,
      background: 'white',
      slots: [{
        id: 'slot-main',
        name: 'Main',
        components: [{
          id: 'table-1',
          componentKey: 'table',
          blockId: 'table_1',
          enabled: true,
          settings: { variant: 'striped', headerStyle: 'brand_sky', alignment: 'left', maxRows, maxColumns }
        }]
      }]
    }]
  };
}

function withTable(headers: string[], rows: string[][], overrides: Record<string, unknown> = {}): BlogBlocksDocument {
  const blocks = createDefaultBlogBlocks();
  blocks.custom_instances = {
    table_1: { componentKey: 'table', enabled: true, heading: 'Comparison', content: '', headers, rows, ...overrides } as any
  };
  return blocks;
}

describe('Table content backend contract', () => {
  it('accepts a valid 3x3 table within a 4x4 template', () => {
    const layout = validateCustomTemplateLayout(layoutWithTable(4, 4));
    const blocks = validateBlogBlocks(withTable(
      ['Feature', 'LASIK', 'PRK'],
      [['Recovery', '1 day', '3 days'], ['Pain', 'Low', 'Medium'], ['Vision', 'Fast', 'Gradual']]
    ));
    expect(() => validateCustomTemplateTableCapacity(layout, blocks)).not.toThrow();
  });

  it('accepts a valid 3x4 table within a 4x4 template', () => {
    const layout = validateCustomTemplateLayout(layoutWithTable(4, 4));
    const blocks = validateBlogBlocks(withTable(
      ['Feature', 'LASIK', 'PRK', 'SMILE'],
      [['Recovery', '1 day', '3 days', '1 day'], ['Pain', 'Low', 'Medium', 'Low'], ['Vision', 'Fast', 'Gradual', 'Fast']]
    ));
    expect(() => validateCustomTemplateTableCapacity(layout, blocks)).not.toThrow();
  });

  it('accepts a full 4x4 table within a 4x4 template', () => {
    const layout = validateCustomTemplateLayout(layoutWithTable(4, 4));
    const blocks = validateBlogBlocks(withTable(
      ['A', 'B', 'C', 'D'],
      [['1', '2', '3', '4'], ['1', '2', '3', '4'], ['1', '2', '3', '4'], ['1', '2', '3', '4']]
    ));
    expect(() => validateCustomTemplateTableCapacity(layout, blocks)).not.toThrow();
  });

  it('allows a table smaller than the configured capacity — capacity is a ceiling, not a fixed size', () => {
    const layout = validateCustomTemplateLayout(layoutWithTable(4, 4));
    const blocks = validateBlogBlocks(withTable(['Only'], [['1']]));
    expect(() => validateCustomTemplateTableCapacity(layout, blocks)).not.toThrow();
  });

  it('rejects 5 rows against a 4-row template maximum', () => {
    const layout = validateCustomTemplateLayout(layoutWithTable(4, 4));
    const blocks = validateBlogBlocks(withTable(
      ['A', 'B', 'C', 'D'],
      [['1', '2', '3', '4'], ['1', '2', '3', '4'], ['1', '2', '3', '4'], ['1', '2', '3', '4'], ['1', '2', '3', '4']]
    ));
    expect(() => validateCustomTemplateTableCapacity(layout, blocks)).toThrow('exceeds the capacity configured');
  });

  it('rejects 5 columns against a 4-column template maximum', () => {
    const layout = validateCustomTemplateLayout(layoutWithTable(4, 4));
    const blocks = validateBlogBlocks(withTable(
      ['A', 'B', 'C', 'D', 'E'],
      [['1', '2', '3', '4', '5']]
    ));
    expect(() => validateCustomTemplateTableCapacity(layout, blocks)).toThrow('exceeds the capacity configured');
  });

  it('rejects a ragged row that does not match the header count', () => {
    expect(() => validateBlogBlocks(withTable(
      ['A', 'B', 'C'],
      [['1', '2'], ['1', '2', '3', '4']]
    ))).toThrow('Some article sections need attention');
  });

  it('rejects more than 10 headers globally', () => {
    const headers = Array.from({ length: 11 }, (_, i) => `H${i}`);
    const rows = [headers.map((_, i) => `c${i}`)];
    expect(() => validateBlogBlocks(withTable(headers, rows))).toThrow();
  });

  it('rejects more than 50 rows globally', () => {
    const headers = ['A'];
    const rows = Array.from({ length: 51 }, (_, i) => [`r${i}`]);
    expect(() => validateBlogBlocks(withTable(headers, rows))).toThrow();
  });

  it('rejects a heading longer than 180 characters', () => {
    expect(() => validateBlogBlocks(withTable(['A'], [['1']], { heading: 'x'.repeat(181) }))).toThrow();
  });

  it('rejects table content longer than 1000 characters', () => {
    expect(() => validateBlogBlocks(withTable(['A'], [['1']], { content: 'x'.repeat(1001) }))).toThrow();
  });

  it('rejects a header longer than 120 characters', () => {
    expect(() => validateBlogBlocks(withTable(['x'.repeat(121)], [['1']]))).toThrow();
  });

  it('rejects a cell longer than 500 characters', () => {
    expect(() => validateBlogBlocks(withTable(['A'], [['x'.repeat(501)]]))).toThrow();
  });
});
