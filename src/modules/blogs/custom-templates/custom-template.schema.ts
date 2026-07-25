import { z } from 'zod';
import { CUSTOM_TEMPLATE_LIMITS, CUSTOM_TEMPLATE_SCHEMA_VERSION } from './custom-template.types.js';

const text = (max: number) => z.string().trim().max(max);

// Safe URL validator accepting HTTP, HTTPS, tel, mailto, and relative paths starting with /; rejecting javascript:, data:, file:, etc.
export const safeUrlSchema = z.union([
  z.literal(''),
  z.string().trim().max(2048).refine((val) => {
    if (!val) return true;
    return /^(https?:\/\/|tel:|mailto:|\/)/i.test(val);
  }, 'URL must use HTTP, HTTPS, tel, mailto, or relative path (/) protocols')
]);

// Component-specific strict settings schemas
const heroSettingsSchema = z.object({
  height: z.enum(['compact', 'standard', 'tall']),
  alignment: z.enum(['left', 'center']),
  overlay: z.enum(['light', 'medium', 'strong'])
}).strict();

const richArticleContentSettingsSchema = z.object({
  fontSize: z.enum(['small', 'medium', 'large']),
  lineHeight: z.enum(['normal', 'relaxed'])
}).strict();

const keyTakeawaysSettingsSchema = z.object({
  variant: z.enum(['soft', 'bordered']),
  columns: z.enum(['one', 'two'])
}).strict();

const imageComparisonSettingsSchema = z.object({
  columns: z.enum(['one', 'two', 'three']),
  imageRatio: z.enum(['square', 'landscape'])
}).strict();

const numberedListSettingsSchema = z.object({
  style: z.enum(['circle', 'simple'])
}).strict();

const expertQuoteSettingsSchema = z.object({
  orientation: z.enum(['horizontal', 'stacked']),
  background: z.enum(['soft', 'white'])
}).strict();

const medicalCtaSettingsSchema = z.object({
  style: z.enum(['navy', 'blue']),
  buttonLayout: z.enum(['inline', 'stacked'])
}).strict();

const faqSettingsSchema = z.object({
  layout: z.enum(['accordion', 'image_accordion']),
  defaultOpen: z.enum(['first', 'none'])
}).strict();

const feedbackSettingsSchema = z.object({
  showPrompt: z.boolean()
}).strict();

const shareSettingsSchema = z.object({
  alignment: z.enum(['left', 'center', 'right'])
}).strict();

const medicalDisclaimerSettingsSchema = z.object({
  variant: z.enum(['standard', 'prominent'])
}).strict();

const tocSettingsSchema = z.object({
  headingLevels: z.array(z.union([z.literal(2), z.literal(3), z.literal(4)])).min(1),
  sticky: z.boolean()
}).strict();

const appointmentCardSettingsSchema = z.object({
  heading: text(120),
  buttonLabel: text(60),
  targetUrl: safeUrlSchema
}).strict();

const newsletterCardSettingsSchema = z.object({
  heading: text(120),
  description: text(240),
  buttonLabel: text(60)
}).strict();

const spacerSettingsSchema = z.object({
  size: z.enum(['small', 'medium', 'large'])
}).strict();

const dividerSettingsSchema = z.object({
  style: z.enum(['solid', 'dashed'])
}).strict();

// Discriminated component instance schemas
export const componentInstanceSchema = z.discriminatedUnion('componentKey', [
  z.object({ id: text(64), componentKey: z.literal('hero'), blockId: text(64), settings: heroSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('rich_article_content'), blockId: text(64), settings: richArticleContentSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('key_takeaways'), blockId: text(64), settings: keyTakeawaysSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('image_comparison'), blockId: text(64), settings: imageComparisonSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('numbered_list'), blockId: text(64), settings: numberedListSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('expert_quote'), blockId: text(64), settings: expertQuoteSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('medical_cta'), blockId: text(64), settings: medicalCtaSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('faq'), blockId: text(64), settings: faqSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('feedback'), blockId: text(64), settings: feedbackSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('share'), blockId: text(64), settings: shareSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('medical_disclaimer'), blockId: text(64), settings: medicalDisclaimerSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('article_table_of_contents'), blockId: z.undefined().optional(), settings: tocSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('appointment_card'), blockId: z.undefined().optional(), settings: appointmentCardSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('newsletter_card'), blockId: z.undefined().optional(), settings: newsletterCardSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('spacer'), blockId: z.undefined().optional(), settings: spacerSettingsSchema, enabled: z.boolean() }).strict(),
  z.object({ id: text(64), componentKey: z.literal('divider'), blockId: z.undefined().optional(), settings: dividerSettingsSchema, enabled: z.boolean() }).strict()
]);

export const slotSchema = z.object({
  id: text(64),
  name: text(64),
  components: z.array(componentInstanceSchema).max(CUSTOM_TEMPLATE_LIMITS.MAX_COMPONENTS_PER_SLOT)
}).strict();

export const sectionSchema = z.object({
  id: text(64),
  layout: z.enum(['full_width', 'content_sidebar', 'two_column', 'three_column']),
  responsiveStrategy: z.enum([
    'stack_on_mobile',
    'sidebar_below_on_tablet',
    'equal_columns',
    'main_sidebar',
    'three_to_two_to_one'
  ]),
  enabled: z.boolean(),
  background: z.enum(['white', 'slate', 'sky']).optional(),
  slots: z.array(slotSchema).min(1).max(CUSTOM_TEMPLATE_LIMITS.MAX_SLOTS_PER_SECTION)
}).strict();

export const pageSettingsSchema = z.object({
  contentWidth: z.enum(['narrow', 'standard', 'wide', 'full']),
  background: z.enum(['white', 'soft_gray', 'brand_tint']),
  spacing: z.enum(['compact', 'normal', 'spacious']),
  typography: z.enum(['editorial', 'modern', 'clinical'])
}).strict();

export const customTemplateLayoutConfigV1Schema = z.object({
  schemaVersion: z.literal(CUSTOM_TEMPLATE_SCHEMA_VERSION),
  layoutId: text(64),
  metadata: z.object({
    name: text(120),
    description: text(500)
  }).strict(),
  page: pageSettingsSchema,
  sections: z.array(sectionSchema).min(1).max(CUSTOM_TEMPLATE_LIMITS.MAX_SECTIONS)
}).strict();
