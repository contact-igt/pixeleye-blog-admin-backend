export const BLOG_BLOCKS_SCHEMA_VERSION = 1 as const;
export const DEFAULT_MEDICAL_DISCLAIMER =
  'The information is for educational purposes and does not replace professional medical advice, diagnosis or treatment.';

export interface BlogBlocksDocument {
  schema_version: typeof BLOG_BLOCKS_SCHEMA_VERSION;
  blocks: {
    hero: { category: string; breadcrumb: string[]; reviewer: { name: string; credentials: string }; reading_time_minutes: number | null };
    key_takeaways: { enabled: boolean; heading: string; items: string[] };
    image_comparison: { enabled: boolean; heading: string; items: Array<{ media_id: string | null; title: string; description: string }> };
    numbered_list: { enabled: boolean; heading: string; items: Array<{ title: string; description: string }> };
    expert_quote: { enabled: boolean; quote: string; name: string; role: string; media_id: string | null; profile_url: string };
    medical_cta: { enabled: boolean; heading: string; description: string; primary: { label: string; url: string }; secondary: { label: string; url: string } };
    faq: { enabled: boolean; heading: string; items: Array<{ question: string; answer: string }> };
    feedback: { enabled: boolean; prompt: string };
    share: { enabled: boolean };
    disclaimer: { enabled: true; text: string };
  };
  // Present only for `custom_template` blogs. Each key is a custom template component instance's
  // unique blockId, so repeated placements of the same componentKey hold independent content.
  custom_instances?: Record<string, CustomBlockInstanceContent>;
}

export type CustomBlockInstanceContent =
  | { componentKey: 'hero'; category: string; breadcrumb: string[]; reviewer: { name: string; credentials: string }; reading_time_minutes: number | null }
  | { componentKey: 'key_takeaways'; enabled: boolean; heading: string; items: string[] }
  | { componentKey: 'image_comparison'; enabled: boolean; heading: string; items: Array<{ media_id: string | null; title: string; description: string }> }
  | { componentKey: 'numbered_list'; enabled: boolean; heading: string; items: Array<{ title: string; description: string }> }
  | { componentKey: 'expert_quote'; enabled: boolean; quote: string; name: string; role: string; media_id: string | null; profile_url: string }
  | { componentKey: 'medical_cta'; enabled: boolean; heading: string; description: string; primary: { label: string; url: string }; secondary: { label: string; url: string } }
  | { componentKey: 'faq'; enabled: boolean; heading: string; items: Array<{ question: string; answer: string }> }
  | { componentKey: 'feedback'; enabled: boolean; prompt: string }
  | { componentKey: 'share'; enabled: boolean }
  | { componentKey: 'medical_disclaimer'; enabled: true; text: string };

export function createDefaultCustomInstanceContent(componentKey: CustomBlockInstanceContent['componentKey']): CustomBlockInstanceContent {
  switch (componentKey) {
    case 'hero': return { componentKey, category: '', breadcrumb: [], reviewer: { name: '', credentials: '' }, reading_time_minutes: null };
    case 'key_takeaways': return { componentKey, enabled: false, heading: 'Key Takeaways', items: [] };
    case 'image_comparison': return { componentKey, enabled: false, heading: '', items: [] };
    case 'numbered_list': return { componentKey, enabled: false, heading: '', items: [] };
    case 'expert_quote': return { componentKey, enabled: false, quote: '', name: '', role: '', media_id: null, profile_url: '' };
    case 'medical_cta': return { componentKey, enabled: false, heading: '', description: '', primary: { label: '', url: '' }, secondary: { label: '', url: '' } };
    case 'faq': return { componentKey, enabled: false, heading: 'Frequently Asked Questions', items: [] };
    case 'feedback': return { componentKey, enabled: true, prompt: 'Was this article helpful?' };
    case 'share': return { componentKey, enabled: true };
    case 'medical_disclaimer': return { componentKey, enabled: true, text: DEFAULT_MEDICAL_DISCLAIMER };
  }
}

export function createDefaultBlogBlocks(): BlogBlocksDocument {
  return {
    schema_version: BLOG_BLOCKS_SCHEMA_VERSION,
    blocks: {
      hero: { category: '', breadcrumb: [], reviewer: { name: '', credentials: '' }, reading_time_minutes: null },
      key_takeaways: { enabled: false, heading: 'Key Takeaways', items: [] },
      image_comparison: { enabled: false, heading: '', items: [] },
      numbered_list: { enabled: false, heading: '', items: [] },
      expert_quote: { enabled: false, quote: '', name: '', role: '', media_id: null, profile_url: '' },
      medical_cta: { enabled: false, heading: '', description: '', primary: { label: '', url: '' }, secondary: { label: '', url: '' } },
      faq: { enabled: false, heading: 'Frequently Asked Questions', items: [] },
      feedback: { enabled: true, prompt: 'Was this article helpful?' },
      share: { enabled: true },
      disclaimer: { enabled: true, text: DEFAULT_MEDICAL_DISCLAIMER }
    }
  };
}
