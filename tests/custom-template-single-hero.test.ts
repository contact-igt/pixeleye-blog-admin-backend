import { describe, expect, it } from 'vitest';
import { assertSingleActiveHero, validateCustomTemplateLayout } from '../src/modules/blogs/custom-templates/custom-template.validation.js';

const hero = (id: string, blockId: string, enabled = true) => ({
  id, componentKey: 'hero', blockId, enabled, settings: { height: 'standard', alignment: 'left', overlay: 'medium' }
});

function layout(components: unknown[], sectionEnabled = true, extraSection?: unknown[]): any {
  return {
    schemaVersion: 1,
    layoutId: 'hero-rule',
    metadata: { name: 'Hero rule', description: 'One hero per template.' },
    page: { contentWidth: 'full', background: 'white', spacing: 'normal', typography: 'editorial' },
    sections: [
      { id: 'sec-1', layout: 'full_width', responsiveStrategy: 'stack_on_mobile', enabled: sectionEnabled, slots: [{ id: 'slot-1', name: 'Main', components }] },
      ...(extraSection ? [{ id: 'sec-2', layout: 'full_width', responsiveStrategy: 'stack_on_mobile', enabled: true, slots: [{ id: 'slot-2', name: 'Main', components: extraSection }] }] : [])
    ]
  };
}

describe('assertSingleActiveHero (template create / new version)', () => {
  it('accepts zero or one active Hero', () => {
    expect(() => assertSingleActiveHero(validateCustomTemplateLayout(layout([])))).not.toThrow();
    expect(() => assertSingleActiveHero(validateCustomTemplateLayout(layout([hero('h1', 'hero_1')])))).not.toThrow();
  });

  it('rejects two active Heroes, even across sections', () => {
    const value = validateCustomTemplateLayout(layout([hero('h1', 'hero_1')], true, [hero('h2', 'hero_2')]));
    expect(() => assertSingleActiveHero(value)).toThrow('only one Hero Banner');
  });

  it('ignores disabled Heroes and disabled sections', () => {
    expect(() => assertSingleActiveHero(validateCustomTemplateLayout(layout([hero('h1', 'hero_1'), hero('h2', 'hero_2', false)])))).not.toThrow();
    expect(() => assertSingleActiveHero(validateCustomTemplateLayout(layout([hero('h1', 'hero_1')], false, [hero('h2', 'hero_2')])))).not.toThrow();
  });

  it('does not make templates saved earlier unreadable: plain layout validation still accepts two Heroes', () => {
    expect(() => validateCustomTemplateLayout(layout([hero('h1', 'hero_1'), hero('h2', 'hero_2')]))).not.toThrow();
  });
});
