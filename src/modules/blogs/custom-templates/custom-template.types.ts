export const INTERNAL_CUSTOM_TEMPLATE_KEY = 'custom_template' as const;
export type InternalCustomTemplateKey = typeof INTERNAL_CUSTOM_TEMPLATE_KEY;
export const CUSTOM_TEMPLATE_SCHEMA_VERSION = 1 as const;
export type CustomTemplateSchemaVersion = typeof CUSTOM_TEMPLATE_SCHEMA_VERSION;

export const CUSTOM_TEMPLATE_LIMITS = Object.freeze({
  MAX_SECTIONS: 20,
  MAX_SLOTS_PER_SECTION: 3,
  MAX_COMPONENTS_PER_SLOT: 10,
  MAX_TOTAL_COMPONENTS: 60,
  MAX_STRING_LENGTH: 500,
  MAX_NESTING_DEPTH: 4
});

export type CustomTemplateSectionLayout =
  | 'full_width'
  | 'content_sidebar'
  | 'two_column'
  | 'three_column';

export type CustomTemplateResponsiveStrategy =
  | 'stack_on_mobile'
  | 'sidebar_below_on_tablet'
  | 'equal_columns'
  | 'main_sidebar'
  | 'three_to_two_to_one';

export type CustomTemplateContentWidth = 'narrow' | 'standard' | 'wide' | 'full';
export type CustomTemplatePageBackground = 'white' | 'soft_gray' | 'brand_tint';
export type CustomTemplateSectionSpacing = 'compact' | 'normal' | 'spacious';
export type CustomTemplateTypographyVariant = 'editorial' | 'modern' | 'clinical';

export interface CustomTemplatePageSettings {
  contentWidth: CustomTemplateContentWidth;
  background: CustomTemplatePageBackground;
  spacing: CustomTemplateSectionSpacing;
  typography: CustomTemplateTypographyVariant;
}

export type ContentComponentKey =
  | 'hero'
  | 'rich_article_content'
  | 'key_takeaways'
  | 'image_comparison'
  | 'numbered_list'
  | 'expert_quote'
  | 'medical_cta'
  | 'faq'
  | 'feedback'
  | 'share'
  | 'medical_disclaimer'
  | 'table';

export type SystemComponentKey =
  | 'article_table_of_contents'
  | 'appointment_card'
  | 'newsletter_card';

export type StructuralComponentKey = 'spacer' | 'divider';

export type RegisteredComponentKey =
  | ContentComponentKey
  | SystemComponentKey
  | StructuralComponentKey;

// Discriminated unions for Component Settings per ComponentKey
export interface HeroComponentSettings {
  height: 'compact' | 'standard' | 'tall';
  alignment: 'left' | 'center';
  overlay: 'light' | 'medium' | 'strong';
}

export interface RichArticleContentSettings {
  fontSize: 'small' | 'medium' | 'large';
  lineHeight: 'normal' | 'relaxed';
}

export interface KeyTakeawaysSettings {
  variant: 'soft' | 'bordered';
  columns: 'one' | 'two';
}

export interface ImageComparisonSettings {
  columns: 'one' | 'two' | 'three';
  imageRatio: 'square' | 'landscape';
}

export interface NumberedListSettings {
  style: 'circle' | 'simple';
}

export interface ExpertQuoteSettings {
  orientation: 'horizontal' | 'stacked';
  background: 'soft' | 'white';
}

export interface MedicalCtaSettings {
  style: 'navy' | 'blue';
  buttonLayout: 'inline' | 'stacked';
}

export interface FaqSettings {
  layout: 'accordion' | 'image_accordion';
  defaultOpen: 'first' | 'none';
}

export interface FeedbackSettings {
  showPrompt: boolean;
}

export interface ShareSettings {
  alignment: 'left' | 'center' | 'right';
}

export interface MedicalDisclaimerSettings {
  variant: 'standard' | 'prominent';
}

export interface TableSettings {
  variant: 'striped' | 'bordered' | 'clean';
  headerStyle: 'brand_sky' | 'dark_slate' | 'light_gray';
  alignment: 'left' | 'center';
  maxRows: number;
  maxColumns: number;
}

export interface TocSettings {
  headingLevels: Array<2 | 3 | 4>;
  sticky: boolean;
}

export interface AppointmentCardSettings {
  heading: string;
  buttonLabel: string;
  targetUrl: string;
}

export interface NewsletterCardSettings {
  heading: string;
  description: string;
  buttonLabel: string;
}

export interface SpacerSettings {
  size: 'small' | 'medium' | 'large';
}

export interface DividerSettings {
  style: 'solid' | 'dashed';
}

// Component Instances with Discriminated Unions by componentKey
export type CustomTemplateComponentInstance =
  | { id: string; componentKey: 'hero'; blockId: string; settings: HeroComponentSettings; enabled: boolean }
  | { id: string; componentKey: 'rich_article_content'; blockId: string; settings: RichArticleContentSettings; enabled: boolean }
  | { id: string; componentKey: 'key_takeaways'; blockId: string; settings: KeyTakeawaysSettings; enabled: boolean }
  | { id: string; componentKey: 'image_comparison'; blockId: string; settings: ImageComparisonSettings; enabled: boolean }
  | { id: string; componentKey: 'numbered_list'; blockId: string; settings: NumberedListSettings; enabled: boolean }
  | { id: string; componentKey: 'expert_quote'; blockId: string; settings: ExpertQuoteSettings; enabled: boolean }
  | { id: string; componentKey: 'medical_cta'; blockId: string; settings: MedicalCtaSettings; enabled: boolean }
  | { id: string; componentKey: 'faq'; blockId: string; settings: FaqSettings; enabled: boolean }
  | { id: string; componentKey: 'feedback'; blockId: string; settings: FeedbackSettings; enabled: boolean }
  | { id: string; componentKey: 'share'; blockId: string; settings: ShareSettings; enabled: boolean }
  | { id: string; componentKey: 'medical_disclaimer'; blockId: string; settings: MedicalDisclaimerSettings; enabled: boolean }
  | { id: string; componentKey: 'table'; blockId: string; settings: TableSettings; enabled: boolean }
  | { id: string; componentKey: 'article_table_of_contents'; blockId?: undefined; settings: TocSettings; enabled: boolean }
  | { id: string; componentKey: 'appointment_card'; blockId?: undefined; settings: AppointmentCardSettings; enabled: boolean }
  | { id: string; componentKey: 'newsletter_card'; blockId?: undefined; settings: NewsletterCardSettings; enabled: boolean }
  | { id: string; componentKey: 'spacer'; blockId?: undefined; settings: SpacerSettings; enabled: boolean }
  | { id: string; componentKey: 'divider'; blockId?: undefined; settings: DividerSettings; enabled: boolean };

export interface CustomTemplateSlot {
  id: string;
  name: string;
  components: CustomTemplateComponentInstance[];
}

export interface CustomTemplateSectionSettings {
  width?: CustomTemplateContentWidth | 'inherit';
  backgroundStyle?: 'white' | 'slate' | 'sky' | 'inherit';
  paddingTop?: CustomTemplateSectionSpacing | 'inherit';
  paddingBottom?: CustomTemplateSectionSpacing | 'inherit';
}

export interface CustomTemplateSection {
  id: string;
  layout: CustomTemplateSectionLayout;
  responsiveStrategy: CustomTemplateResponsiveStrategy;
  enabled: boolean;
  background?: 'white' | 'slate' | 'sky';
  settings?: CustomTemplateSectionSettings;
  slots: CustomTemplateSlot[];
}

export interface CustomTemplateLayoutConfigV1 {
  schemaVersion: 1;
  layoutId: string;
  metadata: {
    name: string;
    description: string;
  };
  page: CustomTemplatePageSettings;
  sections: CustomTemplateSection[];
}
