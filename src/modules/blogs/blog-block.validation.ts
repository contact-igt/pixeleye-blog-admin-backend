import { z, ZodError } from 'zod';
import { blockIdSchema } from './custom-templates/custom-template.schema.js';
import { ApiError } from '../../utils/api-error.js';
import { BLOG_BLOCKS_SCHEMA_VERSION, createDefaultBlogBlocks, createDefaultTemplate2Sidebar, normalizeTemplate2Phone, type BlogBlocksDocument, type CustomBlockInstanceContent } from './blog-block.types.js';

const text = (max: number) => z.string().trim().max(max);
const mediaId = z.string().trim().regex(/^\d+$/, 'Media ID must be numeric').nullable();
const safeUrl = z.union([z.literal(''), z.string().trim().url().max(2048).refine((value) => /^https?:\/\//i.test(value), 'URL must use HTTP or HTTPS')]);
const optionalHydratedMedia = {
  url: z.string().nullable().optional(),
  original_url: z.string().nullable().optional(),
  media: z.any().optional()
};

const actionSchema = z.object({ label: text(80), url: safeUrl }).strict();

function isSafeAppointmentUrl(value: string): boolean {
  if (/^\/(?!\/)/.test(value)) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const requiredText = (max: number, message: string) => z.string().trim().min(1, message).max(max);
const template2SidebarSchema = z.object({
  appointment_cta: z.object({
    enabled: z.literal(true, { error: 'Appointment CTA cannot be disabled' }),
    required: z.literal(true, { error: 'Appointment CTA is required' }),
    heading: requiredText(180, 'Appointment heading is required'),
    description: text(500),
    book_appointment: z.object({
      enabled: z.literal(true, { error: 'Book Appointment cannot be disabled' }),
      label: requiredText(80, 'Book Appointment label is required'),
      url: requiredText(2048, 'Book Appointment URL is required').refine(isSafeAppointmentUrl, 'Use an internal path or an HTTP/HTTPS URL')
    }).strict(),
    call_now: z.object({
      enabled: z.literal(true, { error: 'Call Now cannot be disabled' }),
      label: requiredText(80, 'Call Now label is required'),
      phone: requiredText(40, 'Phone number is required')
        .refine((value) => /^[+\d][\d\s().-]*$/.test(value), 'Enter a valid phone number')
        .transform(normalizeTemplate2Phone)
        .refine((value) => /^\+?\d{7,15}$/.test(value), 'Phone number must contain 7 to 15 digits'),
      url: text(32).refine((value) => value === '' || /^tel:\+?\d{7,15}$/.test(value), 'Call URL must use a valid tel: URL')
    }).strict().superRefine((value, context) => {
      const expected = `tel:${value.phone}`;
      if (value.url && value.url !== expected) {
        context.addIssue({ code: 'custom', path: ['url'], message: 'Call URL must match the phone number' });
      }
    }).transform((value) => ({ ...value, url: `tel:${value.phone}` }))
  }).strict(),
  newsletter: z.object({
    enabled: z.literal(true, { error: 'Newsletter Subscription cannot be disabled' }),
    required: z.literal(true, { error: 'Newsletter Subscription is required' }),
    heading: requiredText(180, 'Newsletter heading is required'),
    description: requiredText(500, 'Newsletter description is required'),
    email_placeholder: requiredText(120, 'Email placeholder is required'),
    button_label: requiredText(80, 'Newsletter button label is required')
  }).strict()
}).strict();

const customInstanceContentSchema = z.discriminatedUnion('componentKey', [
  z.object({ componentKey: z.literal('hero'), category: text(100), breadcrumb: z.array(text(80)).max(5), reviewer: z.object({ name: text(120), credentials: text(160) }).strict(), reading_time_minutes: z.number().int().min(1).max(240).nullable() }).strict(),
  z.object({ componentKey: z.literal('key_takeaways'), enabled: z.boolean(), heading: text(120), items: z.array(text(240)).max(5) }).strict(),
  z.object({ componentKey: z.literal('image_comparison'), enabled: z.boolean(), heading: text(120), items: z.array(z.object({ media_id: mediaId, title: text(120), description: text(500) }).strict()).max(6) }).strict(),
  z.object({ componentKey: z.literal('numbered_list'), enabled: z.boolean(), heading: text(120), items: z.array(z.object({ title: text(120), description: text(500) }).strict()).max(10) }).strict(),
  z.object({ componentKey: z.literal('expert_quote'), enabled: z.boolean(), quote: text(1000), name: text(120), role: text(160), media_id: mediaId, profile_url: safeUrl }).strict(),
  z.object({ componentKey: z.literal('medical_cta'), enabled: z.boolean(), heading: text(180), description: text(500), primary: actionSchema, secondary: actionSchema }).strict(),
  z.object({ componentKey: z.literal('faq'), enabled: z.boolean(), heading: text(160), items: z.array(z.object({ question: text(240), answer: text(1000) }).strict()).max(10) }).strict(),
  z.object({ componentKey: z.literal('feedback'), enabled: z.boolean(), prompt: text(160) }).strict(),
  z.object({ componentKey: z.literal('share'), enabled: z.boolean() }).strict(),
  z.object({ componentKey: z.literal('medical_disclaimer'), enabled: z.literal(true, { error: 'Medical disclaimer cannot be disabled' }), text: text(1000) }).strict()
]);

const blogBlocksSchema = z.object({
  schema_version: z.literal(BLOG_BLOCKS_SCHEMA_VERSION),
  blocks: z.object({
    hero: z.object({ category: text(100), breadcrumb: z.array(text(80)).max(5), reviewer: z.object({ name: text(120), credentials: text(160) }).strict(), reading_time_minutes: z.number().int().min(1).max(240).nullable() }).strict(),
    key_takeaways: z.object({ enabled: z.boolean(), heading: text(120), items: z.array(text(240)).max(5) }).strict(),
    image_comparison: z.object({ enabled: z.boolean(), heading: text(120), items: z.array(z.object({ media_id: mediaId, title: text(120), description: text(500), ...optionalHydratedMedia }).strict()).max(6) }).strict(),
    numbered_list: z.object({ enabled: z.boolean(), heading: text(120), items: z.array(z.object({ title: text(120), description: text(500) }).strict()).max(10) }).strict(),
    expert_quote: z.object({ enabled: z.boolean(), quote: text(1000), name: text(120), role: text(160), media_id: mediaId, profile_url: safeUrl, ...optionalHydratedMedia }).strict(),
    medical_cta: z.object({ enabled: z.boolean(), heading: text(180), description: text(500), primary: actionSchema, secondary: actionSchema }).strict(),
    faq: z.object({ enabled: z.boolean(), heading: text(160), items: z.array(z.object({ question: text(240), answer: text(1000) }).strict()).max(10) }).strict(),
    feedback: z.object({ enabled: z.boolean(), prompt: text(160) }).strict(),
    share: z.object({ enabled: z.boolean() }).strict(),
    disclaimer: z.object({ enabled: z.literal(true, { error: 'Medical disclaimer cannot be disabled' }), text: text(1000) }).strict()
  }).strict(),
  sidebar: template2SidebarSchema,
  custom_instances: z.record(blockIdSchema, customInstanceContentSchema).optional()
}).strict();

function blockErrors(error: ZodError) { return error.issues.map((issue) => ({ field: `blocks_json.${issue.path.join('.')}`, message: issue.message })); }

function stripHydratedMedia(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const clone = JSON.parse(JSON.stringify(data));
  if (clone.blocks) {
    if (clone.blocks.expert_quote) {
      delete clone.blocks.expert_quote.url;
      delete clone.blocks.expert_quote.original_url;
      delete clone.blocks.expert_quote.media;
    }
    if (clone.blocks.image_comparison && Array.isArray(clone.blocks.image_comparison.items)) {
      clone.blocks.image_comparison.items.forEach((item: any) => {
        if (item && typeof item === 'object') {
          delete item.url;
          delete item.original_url;
          delete item.media;
        }
      });
    }
  }
  if (clone.custom_instances && typeof clone.custom_instances === 'object') {
    for (const instance of Object.values(clone.custom_instances)) {
      if (!instance || typeof instance !== 'object') continue;
      const inst = instance as any;
      delete inst.url;
      delete inst.original_url;
      delete inst.media;
      if (Array.isArray(inst.items)) {
        inst.items.forEach((item: any) => {
          if (item && typeof item === 'object') {
            delete item.url;
            delete item.original_url;
            delete item.media;
          }
        });
      }
    }
  }
  return clone;
}

export function validateBlogBlocks(value: unknown): BlogBlocksDocument {
  try { return blogBlocksSchema.parse(value) as BlogBlocksDocument; }
  catch (error) { if (error instanceof ZodError) throw new ApiError(422, 'Some article sections need attention.', blockErrors(error)); throw error; }
}
export function normalizeBlogBlocks(value: unknown): BlogBlocksDocument {
  if (value === null || value === undefined) return createDefaultBlogBlocks();
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); }
    catch { throw new ApiError(422, 'Some article sections need attention.', [{ field: 'blocks_json', message: 'Article sections contain invalid JSON.' }]); }
  }
  const stripped = stripHydratedMedia(parsed);
  const withSidebar = stripped && typeof stripped === 'object' && !Array.isArray(stripped) && !('sidebar' in stripped)
    ? { ...stripped, sidebar: createDefaultTemplate2Sidebar() }
    : stripped;
  return validateBlogBlocks(withSidebar);
}
export function collectBlogBlockMediaIds(document: BlogBlocksDocument): string[] {
  const ids: Array<string | null | undefined> = [
    ...document.blocks.image_comparison.items.map((item) => item.media_id),
    document.blocks.expert_quote.media_id
  ];

  if (document.custom_instances && typeof document.custom_instances === 'object') {
    for (const instance of Object.values(document.custom_instances)) {
      if (!instance) continue;
      const inst = instance as any;
      if (inst.componentKey === 'expert_quote' && inst.media_id) {
        ids.push(inst.media_id);
      } else if (inst.componentKey === 'image_comparison' && Array.isArray(inst.items)) {
        inst.items.forEach((item: any) => ids.push(item?.media_id));
      }
    }
  }

  const validIds = ids.filter((id): id is string => Boolean(id));
  return [...new Set(validIds)];
}
function required(value: string): boolean { return Boolean(value.trim()); }
function completeAction(action: { label: string; url: string }): boolean { return required(action.label) && required(action.url); }
export function blogBlockCompletionErrors(document: BlogBlocksDocument): Array<{ field: string; message: string }> {
  const { blocks } = document;
  const errors: Array<{ field: string; message: string }> = [];
  const add = (field: string, message: string) => errors.push({ field: `blocks_json.blocks.${field}`, message });
  if (!blocks.disclaimer.enabled) add('disclaimer.enabled', 'Medical disclaimer must be enabled.');
  if (!required(blocks.disclaimer.text)) add('disclaimer.text', 'Medical disclaimer text is required.');
  if (blocks.key_takeaways.enabled) {
    if (!required(blocks.key_takeaways.heading)) add('key_takeaways.heading', 'Key Takeaways heading is required.');
    if (blocks.key_takeaways.items.length < 1) add('key_takeaways.items', 'Add at least one Key Takeaway.');
    blocks.key_takeaways.items.forEach((item, index) => { if (!required(item)) add(`key_takeaways.items.${index}`, 'Key Takeaway text is required.'); });
  }
  if (blocks.image_comparison.enabled) {
    if (!required(blocks.image_comparison.heading)) add('image_comparison.heading', 'Image Comparison heading is required.');
    if (blocks.image_comparison.items.length < 1) add('image_comparison.items', 'Add at least one comparison card.');
    blocks.image_comparison.items.forEach((item, index) => { if (!item.media_id) add(`image_comparison.items.${index}.media_id`, 'Comparison image is required.'); if (!required(item.title)) add(`image_comparison.items.${index}.title`, 'Comparison title is required.'); if (!required(item.description)) add(`image_comparison.items.${index}.description`, 'Comparison description is required.'); });
  }
  if (blocks.numbered_list.enabled) {
    if (!required(blocks.numbered_list.heading)) add('numbered_list.heading', 'Numbered List heading is required.');
    if (blocks.numbered_list.items.length < 1) add('numbered_list.items', 'Add at least one numbered item.');
    blocks.numbered_list.items.forEach((item, index) => { if (!required(item.title)) add(`numbered_list.items.${index}.title`, 'Numbered item title is required.'); if (!required(item.description)) add(`numbered_list.items.${index}.description`, 'Numbered item description is required.'); });
  }
  if (blocks.expert_quote.enabled) { if (!required(blocks.expert_quote.quote)) add('expert_quote.quote', 'Expert quote is required.'); if (!required(blocks.expert_quote.name)) add('expert_quote.name', 'Expert name is required.'); if (!required(blocks.expert_quote.role)) add('expert_quote.role', 'Expert role is required.'); }
  if (blocks.medical_cta.enabled) {
    if (!required(blocks.medical_cta.heading)) add('medical_cta.heading', 'Medical CTA heading is required.');
    if (!required(blocks.medical_cta.description)) add('medical_cta.description', 'Medical CTA description is required.');
    const actions = [blocks.medical_cta.primary, blocks.medical_cta.secondary];
    actions.forEach((action, index) => { if (Boolean(action.label) !== Boolean(action.url)) add(`medical_cta.${index === 0 ? 'primary' : 'secondary'}`, 'CTA label and URL must be supplied together.'); });
    if (!actions.some(completeAction)) add('medical_cta.primary', 'Add at least one complete CTA action.');
  }
  if (blocks.faq.enabled) {
    if (!required(blocks.faq.heading)) add('faq.heading', 'FAQ heading is required.');
    if (blocks.faq.items.length < 1) add('faq.items', 'Add at least one FAQ item.');
    blocks.faq.items.forEach((item, index) => { if (!required(item.question)) add(`faq.items.${index}.question`, 'FAQ question is required.'); if (!required(item.answer)) add(`faq.items.${index}.answer`, 'FAQ answer is required.'); });
  }
  return errors;
}
export function isEnabledBlogBlockComplete(document: BlogBlocksDocument, blockKey: keyof BlogBlocksDocument['blocks']): boolean {
  return !blogBlockCompletionErrors(document).some((error) => error.field.startsWith(`blocks_json.blocks.${blockKey}`));
}

export function template2SidebarCompletionErrors(document: BlogBlocksDocument): Array<{ field: string; message: string }> {
  const appointment = document.sidebar.appointment_cta;
  const newsletter = document.sidebar.newsletter;
  const errors: Array<{ field: string; message: string }> = [];
  const add = (field: string, message: string) => errors.push({ field: `blocks_json.sidebar.${field}`, message });
  if (!required(appointment.heading)) add('appointment_cta.heading', 'Appointment heading is required.');
  if (!required(appointment.book_appointment.label)) add('appointment_cta.book_appointment.label', 'Book Appointment label is required.');
  if (!required(appointment.book_appointment.url)) add('appointment_cta.book_appointment.url', 'Book Appointment URL is required.');
  if (!required(appointment.call_now.label)) add('appointment_cta.call_now.label', 'Call Now label is required.');
  if (!required(appointment.call_now.phone)) add('appointment_cta.call_now.phone', 'Phone number is required.');
  if (!required(newsletter.heading)) add('newsletter.heading', 'Newsletter heading is required.');
  if (!required(newsletter.description)) add('newsletter.description', 'Newsletter description is required.');
  if (!required(newsletter.email_placeholder)) add('newsletter.email_placeholder', 'Email placeholder is required.');
  if (!required(newsletter.button_label)) add('newsletter.button_label', 'Newsletter button label is required.');
  return errors;
}

export function collectCustomInstanceMediaIds(document: BlogBlocksDocument): string[] {
  const instances = Object.values(document.custom_instances ?? {});
  const ids = instances.flatMap((instance) => {
    if (instance.componentKey === 'image_comparison') return instance.items.map((item) => item.media_id);
    if (instance.componentKey === 'expert_quote') return [instance.media_id];
    return [];
  });
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function customInstanceErrors(blockId: string, instance: CustomBlockInstanceContent): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];
  const add = (field: string, message: string) => errors.push({ field: `blocks_json.custom_instances.${blockId}.${field}`, message });
  switch (instance.componentKey) {
    case 'medical_disclaimer':
      if (!required(instance.text)) add('text', 'Medical disclaimer text is required.');
      break;
    case 'key_takeaways':
      if (!instance.enabled) break;
      if (!required(instance.heading)) add('heading', 'Key Takeaways heading is required.');
      if (instance.items.length < 1) add('items', 'Add at least one Key Takeaway.');
      instance.items.forEach((item, index) => { if (!required(item)) add(`items.${index}`, 'Key Takeaway text is required.'); });
      break;
    case 'image_comparison':
      if (!instance.enabled) break;
      if (!required(instance.heading)) add('heading', 'Image Comparison heading is required.');
      if (instance.items.length < 1) add('items', 'Add at least one comparison card.');
      instance.items.forEach((item, index) => { if (!item.media_id) add(`items.${index}.media_id`, 'Comparison image is required.'); if (!required(item.title)) add(`items.${index}.title`, 'Comparison title is required.'); if (!required(item.description)) add(`items.${index}.description`, 'Comparison description is required.'); });
      break;
    case 'numbered_list':
      if (!instance.enabled) break;
      if (!required(instance.heading)) add('heading', 'Numbered List heading is required.');
      if (instance.items.length < 1) add('items', 'Add at least one numbered item.');
      instance.items.forEach((item, index) => { if (!required(item.title)) add(`items.${index}.title`, 'Numbered item title is required.'); if (!required(item.description)) add(`items.${index}.description`, 'Numbered item description is required.'); });
      break;
    case 'expert_quote':
      if (!instance.enabled) break;
      if (!required(instance.quote)) add('quote', 'Expert quote is required.');
      if (!required(instance.name)) add('name', 'Expert name is required.');
      if (!required(instance.role)) add('role', 'Expert role is required.');
      break;
    case 'medical_cta': {
      if (!instance.enabled) break;
      if (!required(instance.heading)) add('heading', 'Medical CTA heading is required.');
      if (!required(instance.description)) add('description', 'Medical CTA description is required.');
      const actions = [instance.primary, instance.secondary];
      actions.forEach((action, index) => { if (Boolean(action.label) !== Boolean(action.url)) add(index === 0 ? 'primary' : 'secondary', 'CTA label and URL must be supplied together.'); });
      if (!actions.some(completeAction)) add('primary', 'Add at least one complete CTA action.');
      break;
    }
    case 'faq':
      if (!instance.enabled) break;
      if (!required(instance.heading)) add('heading', 'FAQ heading is required.');
      if (instance.items.length < 1) add('items', 'Add at least one FAQ item.');
      instance.items.forEach((item, index) => { if (!required(item.question)) add(`items.${index}.question`, 'FAQ question is required.'); if (!required(item.answer)) add(`items.${index}.answer`, 'FAQ answer is required.'); });
      break;
    default:
      break;
  }
  return errors;
}

export function customInstanceCompletionErrors(document: BlogBlocksDocument): Array<{ field: string; message: string }> {
  return Object.entries(document.custom_instances ?? {}).flatMap(([blockId, instance]) => customInstanceErrors(blockId, instance));
}
