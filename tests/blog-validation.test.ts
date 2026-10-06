import { describe, expect, it } from 'vitest';
import { generateBlogHtmlFromJson, sanitizeGeneratedBlogHtml, validateBlogEditorJson } from '../src/modules/blogs/blog.validation.js';

describe('blog editor validation', () => {
  it('accepts and preserves underline marks', () => {
    const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Important', marks: [{ type: 'underline' }] }] }] };
    expect(validateBlogEditorJson(document)).toEqual(document);
    expect(sanitizeGeneratedBlogHtml(generateBlogHtmlFromJson(document))).toBe('<p><u>Important</u></p>');
  });
});
