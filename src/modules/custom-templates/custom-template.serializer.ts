import type { CustomTemplateUsage } from './custom-template.types.js';

function plain(model: any) { return typeof model?.get === 'function' ? model.get({ plain: true }) : model; }
function safeAdmin(admin: any) { const data = plain(admin); return data ? { id: String(data.id), name: data.name, email: data.email, role: data.role } : null; }

export function versionSummary(version: any) {
  const data = plain(version);
  if (!data) return null;
  return {
    id: String(data.id),
    version_number: data.versionNumber ?? data.version_number,
    schema_version: data.schemaVersion ?? data.schema_version,
    change_summary: data.changeSummary ?? data.change_summary ?? null,
    created_by: safeAdmin(data.createdByAdmin),
    created_at: data.createdAt ?? data.created_at
  };
}

export function versionDetail(version: any) {
  const summary = versionSummary(version);
  const data = plain(version);
  if (!summary || !data) return null;
  return { ...summary, layout_config_json: data.layoutConfigJson ?? data.layout_config_json };
}

export function templateSummary(template: any, usage?: CustomTemplateUsage) {
  const data = plain(template);
  const currentVersion = data.currentVersion ?? data.current_version;
  return {
    id: String(data.id),
    name: data.name,
    description: data.description ?? null,
    status: data.status,
    status_before_archive: data.statusBeforeArchive ?? data.status_before_archive ?? null,
    owner: safeAdmin(data.owner),
    current_version: currentVersion ? { id: String(currentVersion.id), version_number: currentVersion.versionNumber ?? currentVersion.version_number } : null,
    schema_version: currentVersion?.schemaVersion ?? currentVersion?.schema_version ?? null,
    lock_version: data.lockVersion ?? data.lock_version,
    activated_at: data.activatedAt ?? data.activated_at ?? null,
    archived_at: data.archivedAt ?? data.archived_at ?? null,
    restored_at: data.restoredAt ?? data.restored_at ?? null,
    created_at: data.createdAt ?? data.created_at,
    updated_at: data.updatedAt ?? data.updated_at,
    usage: usage ?? null
  };
}

export function permissionsFor(actor: { id: string; role: string }, template: any) {
  const data = plain(template);
  const isOwner = data && String(data.ownerId ?? data.owner_id) === String(actor.id);
  const manageAll = actor.role === 'super_admin' || actor.role === 'editor';
  const canEdit = manageAll || (actor.role === 'author' && isOwner);
  return {
    can_edit: canEdit,
    can_activate: canEdit,
    can_archive: canEdit,
    can_restore: canEdit,
    can_duplicate: manageAll || actor.role === 'author' || actor.role === 'viewer',
    can_permanently_delete: actor.role === 'super_admin'
  };
}

export function templateDetail(template: any, actor: { id: string; role: string }, usage?: CustomTemplateUsage) {
  const summary = templateSummary(template, usage);
  const data = plain(template);
  const currentVersion = data.currentVersion ?? data.current_version;
  return {
    ...summary,
    creator: safeAdmin(data.creator),
    updater: safeAdmin(data.updater),
    activated_by: safeAdmin(data.activatedByAdmin),
    archived_by: safeAdmin(data.archivedByAdmin),
    restored_by: safeAdmin(data.restoredByAdmin),
    current_version_detail: currentVersion ? versionDetail(currentVersion) : null,
    permissions: permissionsFor(actor, template)
  };
}
