import { ApiError } from '../../utils/api-error.js';
import type { CustomTemplateActor } from './custom-template.types.js';

function plain(model: any) { return typeof model?.get === 'function' ? model.get({ plain: true }) : model; }
function ownerId(template: any) { const data = plain(template); return String(data.ownerId ?? data.owner_id); }

export function canManageAll(actor: CustomTemplateActor): boolean {
  return actor.role === 'super_admin' || actor.role === 'editor';
}

function isOwner(actor: CustomTemplateActor, template: any): boolean {
  return actor.role === 'author' && ownerId(template) === String(actor.id);
}

export function assertCreate(actor: CustomTemplateActor): void {
  if (['super_admin', 'editor', 'author'].includes(actor.role)) return;
  throw new ApiError(403, 'Insufficient permissions');
}

export function assertView(actor: CustomTemplateActor, template: any): void {
  if (canManageAll(actor) || actor.role === 'viewer') return;
  if (isOwner(actor, template)) return;
  throw new ApiError(403, 'Insufficient permissions');
}

export function assertUse(actor: CustomTemplateActor, template: any): void {
  if (canManageAll(actor)) return;
  if (isOwner(actor, template)) return;
  if (actor.role === 'author' || actor.role === 'viewer') return;
  throw new ApiError(403, 'Insufficient permissions');
}

export function assertEdit(actor: CustomTemplateActor, template: any): void {
  if (canManageAll(actor)) return;
  if (isOwner(actor, template)) return;
  throw new ApiError(403, 'Insufficient permissions');
}

export const assertVersion = assertEdit;
export const assertActivate = assertEdit;
export const assertArchive = assertEdit;
export const assertRestore = assertEdit;
export const assertDuplicate = assertView;

export function assertPermanentDelete(actor: CustomTemplateActor): void {
  if (actor.role === 'super_admin') return;
  throw new ApiError(403, 'Insufficient permissions');
}
