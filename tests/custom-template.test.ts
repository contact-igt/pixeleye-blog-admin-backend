import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/utils/api-error.js';
import { blogTemplateKeys, listBlogTemplates } from '../src/modules/blogs/blog-template.registry.js';
import { createBlogSchema, updateBlogSchema } from '../src/modules/blogs/blog.validation.ts';
import { createDefaultBlogBlocks } from '../src/modules/blogs/blog-block.types.js';
import {
  INTERNAL_CUSTOM_TEMPLATE_KEY,
  type InternalCustomTemplateKey
} from '../src/modules/blogs/custom-templates/custom-template.types.js';
import { sampleCustomTemplateConfig } from '../src/modules/blogs/custom-templates/custom-template.sample.js';
import {
  isValidCustomTemplateConfig,
  validateCustomTemplateLayout
} from '../src/modules/blogs/custom-templates/custom-template.validation.js';
import { safeUrlSchema } from '../src/modules/blogs/custom-templates/custom-template.schema.js';

describe('Custom Template Identity Isolation', () => {
  it('defines internal custom_template identity safely', () => {
    expect(INTERNAL_CUSTOM_TEMPLATE_KEY).toBe('custom_template');
    const keyCheck: InternalCustomTemplateKey = 'custom_template';
    expect(keyCheck).toBe('custom_template');
  });

  it('excludes custom_template from public blogTemplateKeys', () => {
    expect(blogTemplateKeys).toEqual(['template_1', 'template_2']);
    expect(blogTemplateKeys).not.toContain('custom_template');
  });

  it('excludes custom_template from public listBlogTemplates() output', () => {
    const templates = listBlogTemplates();
    expect(templates).toHaveLength(2);
    expect(templates.map((t) => t.key)).toEqual(['template_1', 'template_2']);
    expect(templates.map((t) => t.key)).not.toContain('custom_template');
  });

  it('rejects custom_template in createBlogSchema validation', () => {
    expect(() => createBlogSchema.parse({ title: 'Test Blog', template_key: 'custom_template' as any })).toThrow();
  });

  it('rejects custom_template in updateBlogSchema validation', () => {
    expect(() => updateBlogSchema.parse({ template_key: 'custom_template' as any })).toThrow();
  });
});

describe('Custom Template Layout Schema & Validation', () => {
  const defaultBlocks = createDefaultBlogBlocks();

  it('validates the internal sample layout configuration successfully', () => {
    const result = validateCustomTemplateLayout(sampleCustomTemplateConfig, defaultBlocks);
    expect(result.schemaVersion).toBe(1);
    expect(result.sections).toHaveLength(2);
    expect(isValidCustomTemplateConfig(sampleCustomTemplateConfig, defaultBlocks)).toBe(true);
  });

  it('serializes and parses sample config without data loss (JSON round-trip)', () => {
    const jsonString = JSON.stringify(sampleCustomTemplateConfig);
    const parsedObj = JSON.parse(jsonString);
    const validated = validateCustomTemplateLayout(parsedObj, defaultBlocks);
    expect(validated).toEqual(sampleCustomTemplateConfig);
  });

  it('rejects unsupported schema version', () => {
    const invalid = { ...sampleCustomTemplateConfig, schemaVersion: 99 };
    try {
      validateCustomTemplateLayout(invalid, defaultBlocks);
      expect.unreachable('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.errors[0].message).toContain('Schema version 99 is not supported');
    }
  });

  it('rejects unknown component key', () => {
    const invalid = JSON.parse(JSON.stringify(sampleCustomTemplateConfig));
    invalid.sections[0].slots[0].components[0].componentKey = 'malicious_script';
    expect(() => validateCustomTemplateLayout(invalid, defaultBlocks)).toThrow();
  });

  it('rejects duplicate section IDs', () => {
    const invalid = JSON.parse(JSON.stringify(sampleCustomTemplateConfig));
    invalid.sections[1].id = invalid.sections[0].id;
    try {
      validateCustomTemplateLayout(invalid, defaultBlocks);
      expect.unreachable('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.errors[0].message).toContain("Duplicate section ID: 'section-hero'");
    }
  });

  it('rejects duplicate slot IDs', () => {
    const invalid = JSON.parse(JSON.stringify(sampleCustomTemplateConfig));
    invalid.sections[1].slots[1].id = invalid.sections[1].slots[0].id;
    try {
      validateCustomTemplateLayout(invalid, defaultBlocks);
      expect.unreachable('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.errors[0].message).toContain("Duplicate slot ID: 'slot-main-content'");
    }
  });

  it('rejects duplicate component IDs', () => {
    const invalid = JSON.parse(JSON.stringify(sampleCustomTemplateConfig));
    invalid.sections[1].slots[0].components[1].id = invalid.sections[1].slots[0].components[0].id;
    try {
      validateCustomTemplateLayout(invalid, defaultBlocks);
      expect.unreachable('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.errors[0].message).toContain("Duplicate component ID: 'comp-takeaways-1'");
    }
  });

  it('rejects content component missing blockId', () => {
    const invalid = JSON.parse(JSON.stringify(sampleCustomTemplateConfig));
    delete invalid.sections[0].slots[0].components[0].blockId;
    try {
      validateCustomTemplateLayout(invalid, defaultBlocks);
      expect.unreachable('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.errors[0].message).toMatch(/expected string|requires a blockId/i);
    }
  });

  it('rejects non-content component with blockId specified', () => {
    const invalid = JSON.parse(JSON.stringify(sampleCustomTemplateConfig));
    invalid.sections[1].slots[1].components[0].blockId = 'unnecessary_block_id';
    try {
      validateCustomTemplateLayout(invalid, defaultBlocks);
      expect.unreachable('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.errors[0].message).toMatch(/expected undefined|must not specify/i);
    }
  });

  it('rejects invalid component settings (e.g. invalid enum value)', () => {
    const invalid = JSON.parse(JSON.stringify(sampleCustomTemplateConfig));
    invalid.sections[0].slots[0].components[0].settings.height = 'gigantic';
    expect(() => validateCustomTemplateLayout(invalid, defaultBlocks)).toThrow();
  });

  it('rejects component placement in unsupported zone', () => {
    const invalid = JSON.parse(JSON.stringify(sampleCustomTemplateConfig));
    invalid.sections[1].slots[1].components.push({
      id: 'comp-hero-sidebar',
      componentKey: 'hero',
      blockId: 'hero',
      settings: { height: 'standard', alignment: 'left', overlay: 'medium' },
      enabled: true
    });
    try {
      validateCustomTemplateLayout(invalid, defaultBlocks);
      expect.unreachable('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.errors[0].message).toContain("not allowed in zone 'sidebar'");
    }
  });

  it('validates safe URLs and rejects unsafe protocols', () => {
    expect(safeUrlSchema.safeParse('https://example.com').success).toBe(true);
    expect(safeUrlSchema.safeParse('http://example.com').success).toBe(true);
    expect(safeUrlSchema.safeParse('tel:+123456789').success).toBe(true);
    expect(safeUrlSchema.safeParse('mailto:admin@example.com').success).toBe(true);
    expect(safeUrlSchema.safeParse('').success).toBe(true);

    expect(safeUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(safeUrlSchema.safeParse('data:text/html,<script>alert(1)</script>').success).toBe(false);
    expect(safeUrlSchema.safeParse('file:///etc/passwd').success).toBe(false);
    expect(safeUrlSchema.safeParse('vbscript:msgbox(1)').success).toBe(false);
  });
});

describe('Template 1 and Template 2 Baseline Protection', () => {
  it('keeps Template 1 and Template 2 create validation working as expected', () => {
    const t1 = createBlogSchema.parse({ title: 'Template 1 Blog', template_key: 'template_1' });
    expect(t1.template_key).toBe('template_1');

    const t2 = createBlogSchema.parse({ title: 'Template 2 Blog', template_key: 'template_2' });
    expect(t2.template_key).toBe('template_2');
  });
});
