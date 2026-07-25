import type { RegisteredComponentKey } from './custom-template.types.js';

export type ComponentCategory = 'content' | 'system' | 'structural';

export interface ComponentAccessibilityContract {
  ariaRole?: string;
  requiredHeadingLabel?: string;
  landmarkType?: string;
  supportsAltText?: boolean;
}

export interface ComponentDefinition {
  key: RegisteredComponentKey;
  displayName: string;
  category: ComponentCategory;
  requiredBlockKey: string | null;
  allowedZones: readonly ('main' | 'sidebar' | 'full')[];
  accessibility: ComponentAccessibilityContract;
}

export const REGISTERED_COMPONENTS: Record<RegisteredComponentKey, ComponentDefinition> = {
  hero: {
    key: 'hero',
    displayName: 'Hero Banner',
    category: 'content',
    requiredBlockKey: 'hero',
    allowedZones: ['full', 'main'],
    accessibility: { landmarkType: 'banner', supportsAltText: true }
  },
  rich_article_content: {
    key: 'rich_article_content',
    displayName: 'Rich Article Content',
    category: 'content',
    requiredBlockKey: 'article_content',
    allowedZones: ['main', 'full'],
    accessibility: { landmarkType: 'article' }
  },
  key_takeaways: {
    key: 'key_takeaways',
    displayName: 'Key Takeaways',
    category: 'content',
    requiredBlockKey: 'key_takeaways',
    allowedZones: ['main', 'full'],
    accessibility: { requiredHeadingLabel: 'Key Takeaways', ariaRole: 'region' }
  },
  image_comparison: {
    key: 'image_comparison',
    displayName: 'Image Comparison',
    category: 'content',
    requiredBlockKey: 'image_comparison',
    allowedZones: ['main', 'full'],
    accessibility: { supportsAltText: true }
  },
  numbered_list: {
    key: 'numbered_list',
    displayName: 'Numbered List',
    category: 'content',
    requiredBlockKey: 'numbered_list',
    allowedZones: ['main', 'full'],
    accessibility: { ariaRole: 'list' }
  },
  expert_quote: {
    key: 'expert_quote',
    displayName: 'Expert Quote',
    category: 'content',
    requiredBlockKey: 'expert_quote',
    allowedZones: ['main', 'full', 'sidebar'],
    accessibility: { ariaRole: 'blockquote', supportsAltText: true }
  },
  medical_cta: {
    key: 'medical_cta',
    displayName: 'Medical Call-to-Action',
    category: 'content',
    requiredBlockKey: 'medical_cta',
    allowedZones: ['main', 'full', 'sidebar'],
    accessibility: { landmarkType: 'region' }
  },
  faq: {
    key: 'faq',
    displayName: 'Frequently Asked Questions',
    category: 'content',
    requiredBlockKey: 'faq',
    allowedZones: ['main', 'full'],
    accessibility: { ariaRole: 'region', requiredHeadingLabel: 'Frequently Asked Questions' }
  },
  feedback: {
    key: 'feedback',
    displayName: 'Helpful Feedback',
    category: 'content',
    requiredBlockKey: 'feedback',
    allowedZones: ['main', 'full'],
    accessibility: { ariaRole: 'form' }
  },
  share: {
    key: 'share',
    displayName: 'Share Controls',
    category: 'content',
    requiredBlockKey: 'share',
    allowedZones: ['main', 'full', 'sidebar'],
    accessibility: { ariaRole: 'group' }
  },
  medical_disclaimer: {
    key: 'medical_disclaimer',
    displayName: 'Medical Disclaimer',
    category: 'content',
    requiredBlockKey: 'disclaimer',
    allowedZones: ['main', 'full'],
    accessibility: { landmarkType: 'contentinfo' }
  },
  article_table_of_contents: {
    key: 'article_table_of_contents',
    displayName: 'Table of Contents',
    category: 'system',
    requiredBlockKey: null,
    allowedZones: ['sidebar', 'main', 'full'],
    accessibility: { landmarkType: 'navigation', requiredHeadingLabel: 'Table of Contents' }
  },
  appointment_card: {
    key: 'appointment_card',
    displayName: 'Appointment Booking Card',
    category: 'system',
    requiredBlockKey: null,
    allowedZones: ['sidebar', 'main', 'full'],
    accessibility: { landmarkType: 'complementary' }
  },
  newsletter_card: {
    key: 'newsletter_card',
    displayName: 'Newsletter Signup Card',
    category: 'system',
    requiredBlockKey: null,
    allowedZones: ['sidebar', 'main', 'full'],
    accessibility: { landmarkType: 'complementary' }
  },
  spacer: {
    key: 'spacer',
    displayName: 'Vertical Spacer',
    category: 'structural',
    requiredBlockKey: null,
    allowedZones: ['main', 'sidebar', 'full'],
    accessibility: {}
  },
  divider: {
    key: 'divider',
    displayName: 'Section Divider',
    category: 'structural',
    requiredBlockKey: null,
    allowedZones: ['main', 'sidebar', 'full'],
    accessibility: { ariaRole: 'separator' }
  }
};

export function isRegisteredComponentKey(key: string): key is RegisteredComponentKey {
  return key in REGISTERED_COMPONENTS;
}

export function getComponentDefinition(key: RegisteredComponentKey): ComponentDefinition {
  return REGISTERED_COMPONENTS[key];
}
