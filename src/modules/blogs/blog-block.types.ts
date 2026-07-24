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
