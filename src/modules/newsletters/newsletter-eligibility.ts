import { Op, type WhereOptions } from 'sequelize';
import type { NewsletterSubscriber } from './newsletter-subscriber.model.js';

export const ELIGIBLE_EMAIL_REGEXP = '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$';

export const eligibleSubscriberWhere: WhereOptions = {
  status: 'subscribed',
  deletedAt: null,
  email: { [Op.regexp]: ELIGIBLE_EMAIL_REGEXP },
  normalizedEmail: { [Op.regexp]: ELIGIBLE_EMAIL_REGEXP }
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEligibleSubscriber(subscriber: Pick<NewsletterSubscriber, 'status' | 'deletedAt' | 'email' | 'normalizedEmail'>): boolean {
  const email = subscriber.email.trim();
  return subscriber.status === 'subscribed' &&
    !subscriber.deletedAt &&
    emailPattern.test(email) &&
    subscriber.normalizedEmail === email.toLowerCase() &&
    !email.toLowerCase().startsWith('deleted-subscriber-');
}