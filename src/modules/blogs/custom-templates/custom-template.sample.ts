import { CUSTOM_TEMPLATE_SCHEMA_VERSION, type CustomTemplateLayoutConfigV1 } from './custom-template.types.js';

export const sampleCustomTemplateConfig: CustomTemplateLayoutConfigV1 = {
  schemaVersion: CUSTOM_TEMPLATE_SCHEMA_VERSION,
  layoutId: 'sample_custom_layout_v1',
  metadata: {
    name: 'Sample Healthcare Custom Template',
    description: 'An internal sample layout configuration featuring hero, single-column content, sidebar TOC and medical guidance.'
  },
  page: {
    contentWidth: 'standard',
    background: 'white',
    spacing: 'normal',
    typography: 'editorial'
  },
  sections: [
    {
      id: 'section-hero',
      layout: 'full_width',
      responsiveStrategy: 'stack_on_mobile',
      enabled: true,
      background: 'white',
      slots: [
        {
          id: 'slot-hero-full',
          name: 'Hero Zone',
          components: [
            {
              id: 'comp-hero-1',
              componentKey: 'hero',
              blockId: 'hero',
              settings: {
                height: 'standard',
                alignment: 'left',
                overlay: 'medium'
              },
              enabled: true
            }
          ]
        }
      ]
    },
    {
      id: 'section-main-sidebar',
      layout: 'content_sidebar',
      responsiveStrategy: 'sidebar_below_on_tablet',
      enabled: true,
      background: 'white',
      slots: [
        {
          id: 'slot-main-content',
          name: 'Main Content Zone',
          components: [
            {
              id: 'comp-takeaways-1',
              componentKey: 'key_takeaways',
              blockId: 'key_takeaways',
              settings: {
                variant: 'soft',
                columns: 'one'
              },
              enabled: true
            },
            {
              id: 'comp-article-body',
              componentKey: 'rich_article_content',
              blockId: 'article_content',
              settings: {
                fontSize: 'medium',
                lineHeight: 'relaxed'
              },
              enabled: true
            },
            {
              id: 'comp-faq-1',
              componentKey: 'faq',
              blockId: 'faq',
              settings: {
                layout: 'accordion',
                defaultOpen: 'first'
              },
              enabled: true
            },
            {
              id: 'comp-disclaimer-1',
              componentKey: 'medical_disclaimer',
              blockId: 'disclaimer',
              settings: {
                variant: 'standard'
              },
              enabled: true
            }
          ]
        },
        {
          id: 'slot-sidebar-content',
          name: 'Sidebar Zone',
          components: [
            {
              id: 'comp-toc-sidebar',
              componentKey: 'article_table_of_contents',
              settings: {
                headingLevels: [2, 3, 4],
                sticky: true
              },
              enabled: true
            },
            {
              id: 'comp-appointment-side',
              componentKey: 'appointment_card',
              settings: {
                heading: 'Book a Consultation',
                buttonLabel: 'Schedule Now',
                targetUrl: 'https://example.com/appointments'
              },
              enabled: true
            }
          ]
        }
      ]
    }
  ]
};
