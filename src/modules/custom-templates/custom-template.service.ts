import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';
import { writeAuthAuditLog } from '../admin/auth/auth-audit.service.js';
import { validateCustomTemplateLayout } from '../blogs/custom-templates/custom-template.validation.js';
import { CUSTOM_TEMPLATE_SCHEMA_VERSION } from '../blogs/custom-templates/custom-template.types.js';
import { BlogVersion } from '../blogs/blog-version.model.js';
import {
  assertActivate,
  assertArchive,
  assertCreate,
  assertDuplicate,
  assertEdit,
  assertPermanentDelete,
  assertRestore,
  assertVersion,
  assertView
} from './custom-template.authorization.js';
import { CustomTemplate, CustomTemplateVersion } from './custom-template.model.js';
import { templateDetail, templateSummary, versionDetail, versionSummary } from './custom-template.serializer.js';
import type { CustomTemplateActor, CustomTemplateUsage } from './custom-template.types.js';
import { CUSTOM_TEMPLATE_IN_USE, CUSTOM_TEMPLATE_VERSION_CONFLICT } from './custom-template.types.js';
import {
  createCustomTemplateSchema,
  customTemplateListQuerySchema,
  duplicateCustomTemplatePayloadSchema,
  lifecyclePayloadSchema,
  saveCustomTemplateVersionSchema,
  updateCustomTemplateMetadataSchema,
  type CustomTemplateListQuery
} from './custom-template.validation.js';

function plain(model: any) { return typeof model?.get === 'function' ? model.get({ plain: true }) : model; }
function pagination(page: number, limit: number, totalItems: number) {
  const totalPages = Math.ceil(totalItems / limit);
  return { page, limit, total_items: totalItems, total_pages: totalPages, has_next_page: page < totalPages, has_previous_page: page > 1 };
}

function includeSummary() {
  return [
    { model: CustomTemplateVersion, as: 'currentVersion', required: false },
    { association: 'owner', attributes: ['id', 'name', 'email', 'role'], required: false }
  ];
}

function includeDetail() {
  return [
    ...includeSummary(),
    { association: 'creator', attributes: ['id', 'name', 'email', 'role'], required: false },
    { association: 'updater', attributes: ['id', 'name', 'email', 'role'], required: false },
    { association: 'activatedByAdmin', attributes: ['id', 'name', 'email', 'role'], required: false },
    { association: 'archivedByAdmin', attributes: ['id', 'name', 'email', 'role'], required: false },
    { association: 'restoredByAdmin', attributes: ['id', 'name', 'email', 'role'], required: false }
  ];
}

async function usageFor(customTemplateId: string, transaction?: Transaction): Promise<CustomTemplateUsage> {
  const [total, distinctBlogs, published] = await Promise.all([
    BlogVersion.count({ where: { customTemplateId }, transaction }),
    BlogVersion.count({ where: { customTemplateId }, distinct: true, col: 'blogId', transaction }),
    BlogVersion.count({ where: { customTemplateId, versionType: 'published' }, transaction })
  ]);
  return { total_blog_versions: total, distinct_blogs: distinctBlogs, published_blog_versions: published };
}

async function findTemplateOrThrow(id: string, options: { transaction?: Transaction; lock?: boolean; includeDetailAssociations?: boolean } = {}) {
  if (!/^\d+$/.test(id)) throw new ApiError(400, 'Custom Template ID is invalid');
  const template = await CustomTemplate.findByPk(id, {
    include: options.includeDetailAssociations ? includeDetail() : includeSummary(),
    transaction: options.transaction,
    lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
  });
  if (!template) throw new ApiError(404, 'Custom Template was not found');
  return template;
}

function assertLockVersion(template: any, expected: number) {
  const data = plain(template);
  const current = data.lockVersion ?? data.lock_version;
  if (current !== expected) {
    throw new ApiError(
      409,
      'CUSTOM_TEMPLATE_VERSION_CONFLICT',
      [{ field: 'expected_lock_version', message: 'Custom Template was modified by another user' }],
      undefined,
      {
        code: CUSTOM_TEMPLATE_VERSION_CONFLICT,
        lock_version: current,
        current_version_id: data.currentVersionId ?? data.current_version_id ? String(data.currentVersionId ?? data.current_version_id) : null,
        updated_at: data.updatedAt ?? data.updated_at
      }
    );
  }
}

export function createCustomTemplateService() {
  return {
    async listCustomTemplates(raw: unknown, actor: CustomTemplateActor) {
      const query: CustomTemplateListQuery = customTemplateListQuerySchema.parse(raw);
      const where: Record<string | symbol, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.owner_id) where.ownerId = query.owner_id;
      if (actor.role === 'author') where.ownerId = actor.id;
      if (query.search) {
        const like = `%${query.search.replace(/[%_\\]/g, '\\$&')}%`;
        where.name = { [Op.like]: like };
      }
      const sortColumns: Record<string, string> = { created_at: 'createdAt', updated_at: 'updatedAt', name: 'name', status: 'status' };
      const result = await CustomTemplate.findAndCountAll({
        where,
        include: includeSummary(),
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        order: [[sortColumns[query.sort_by], query.sort_order.toUpperCase()]] as any,
        distinct: true
      });
      const usages = await Promise.all(result.rows.map((row) => usageFor(String(row.id))));
      return {
        items: result.rows.map((row, index) => templateSummary(row, usages[index])),
        pagination: pagination(query.page, query.limit, Array.isArray(result.count) ? result.count.length : result.count)
      };
    },

    async getCustomTemplateDetail(id: string, actor: CustomTemplateActor, transaction?: Transaction) {
      const template = await findTemplateOrThrow(id, { includeDetailAssociations: true, transaction });
      assertView(actor, template);
      const usage = await usageFor(id, transaction);
      return templateDetail(template, actor, usage);
    },

    async createCustomTemplate(raw: unknown, actor: CustomTemplateActor) {
      assertCreate(actor);
      const input = createCustomTemplateSchema.parse(raw);
      const layout = validateCustomTemplateLayout(input.layout_config_json);
      return sequelize.transaction(async (transaction) => {
        const template = await CustomTemplate.create(
          { name: input.name, description: input.description ?? null, status: 'draft', ownerId: actor.id, lockVersion: 1, createdBy: actor.id, updatedBy: actor.id } as any,
          { transaction }
        );
        const version = await CustomTemplateVersion.create(
          { customTemplateId: template.id, versionNumber: 1, schemaVersion: CUSTOM_TEMPLATE_SCHEMA_VERSION, layoutConfigJson: layout as any, changeSummary: 'Initial version', createdBy: actor.id } as any,
          { transaction }
        );
        await template.update({ currentVersionId: version.id }, { transaction });
        await writeAuthAuditLog({ action: 'CUSTOM_TEMPLATE_CREATED', adminUserId: actor.id, metadata: { custom_template_id: template.id, name: input.name } }, transaction);
        return this.getCustomTemplateDetail(String(template.id), actor, transaction);
      });
    },

    async updateCustomTemplateMetadata(id: string, raw: unknown, actor: CustomTemplateActor) {
      const input = updateCustomTemplateMetadataSchema.parse(raw);
      return sequelize.transaction(async (transaction) => {
        const template = await findTemplateOrThrow(id, { transaction, lock: true });
        assertEdit(actor, template);
        assertLockVersion(template, input.expected_lock_version);
        const updates: Record<string, unknown> = { updatedBy: actor.id, lockVersion: (plain(template).lockVersion ?? plain(template).lock_version) + 1 };
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        await template.update(updates, { transaction });
        await writeAuthAuditLog({ action: 'CUSTOM_TEMPLATE_METADATA_UPDATED', adminUserId: actor.id, metadata: { custom_template_id: template.id, changed_fields: Object.keys(input) } }, transaction);
        return this.getCustomTemplateDetail(id, actor, transaction);
      });
    },

    async listVersions(id: string, actor: CustomTemplateActor) {
      const template = await findTemplateOrThrow(id);
      assertView(actor, template);
      const versions = await CustomTemplateVersion.findAll({ where: { customTemplateId: id }, order: [['versionNumber', 'DESC']], include: [{ association: 'createdByAdmin', attributes: ['id', 'name', 'email', 'role'], required: false }] });
      const currentVersionId = String(plain(template).currentVersionId ?? plain(template).current_version_id ?? '');
      return versions.map((version) => ({ ...versionSummary(version), is_current: String(version.id) === currentVersionId }));
    },

    async getVersion(id: string, versionId: string, actor: CustomTemplateActor) {
      const template = await findTemplateOrThrow(id);
      assertView(actor, template);
      if (!/^\d+$/.test(versionId)) throw new ApiError(400, 'Custom Template version ID is invalid');
      const version = await CustomTemplateVersion.findOne({ where: { id: versionId, customTemplateId: id }, include: [{ association: 'createdByAdmin', attributes: ['id', 'name', 'email', 'role'], required: false }] });
      if (!version) throw new ApiError(404, 'Custom Template version was not found');
      const currentVersionId = String(plain(template).currentVersionId ?? plain(template).current_version_id ?? '');
      return { ...versionDetail(version), is_current: String(version.id) === currentVersionId };
    },

    async saveCustomTemplateVersion(id: string, raw: unknown, actor: CustomTemplateActor) {
      const input = saveCustomTemplateVersionSchema.parse(raw);
      const layout = validateCustomTemplateLayout(input.layout_config_json);
      return sequelize.transaction(async (transaction) => {
        const template = await findTemplateOrThrow(id, { transaction, lock: true });
        assertVersion(actor, template);
        assertLockVersion(template, input.expected_lock_version);
        if (plain(template).status === 'archived') throw new ApiError(409, 'Archived Custom Templates cannot be edited until restored');
        const latest = (await CustomTemplateVersion.max('versionNumber', { where: { customTemplateId: id }, transaction })) as number | null;
        const versionNumber = (latest ?? 0) + 1;
        const version = await CustomTemplateVersion.create(
          { customTemplateId: id, versionNumber, schemaVersion: CUSTOM_TEMPLATE_SCHEMA_VERSION, layoutConfigJson: layout as any, changeSummary: input.change_summary ?? null, createdBy: actor.id } as any,
          { transaction }
        );
        await template.update({ currentVersionId: version.id, lockVersion: plain(template).lockVersion + 1, updatedBy: actor.id }, { transaction });
        await writeAuthAuditLog({ action: 'CUSTOM_TEMPLATE_VERSION_CREATED', adminUserId: actor.id, metadata: { custom_template_id: id, version_id: version.id, version_number: versionNumber } }, transaction);
        return this.getCustomTemplateDetail(id, actor, transaction);
      });
    },

    async duplicateCustomTemplate(id: string, raw: unknown, actor: CustomTemplateActor) {
      const input = duplicateCustomTemplatePayloadSchema.parse(raw);
      return sequelize.transaction(async (transaction) => {
        const source = await findTemplateOrThrow(id, { transaction });
        assertDuplicate(actor, source);
        let sourceVersion: any;
        if (input.source_version_id) {
          sourceVersion = await CustomTemplateVersion.findOne({ where: { id: input.source_version_id, customTemplateId: id }, transaction });
          if (!sourceVersion) throw new ApiError(404, 'Custom Template version was not found');
        } else {
          const currentVersionId = plain(source).currentVersionId ?? plain(source).current_version_id;
          if (!currentVersionId) throw new ApiError(422, 'Custom Template has no version to duplicate');
          sourceVersion = await CustomTemplateVersion.findByPk(currentVersionId, { transaction });
          if (!sourceVersion) throw new ApiError(422, 'Custom Template has no version to duplicate');
        }
        const layoutCopy = JSON.parse(JSON.stringify(plain(sourceVersion).layoutConfigJson ?? plain(sourceVersion).layout_config_json));
        const layout = validateCustomTemplateLayout(layoutCopy);
        const name = input.name ?? `Copy of ${plain(source).name}`;
        const duplicate = await CustomTemplate.create(
          { name, description: plain(source).description ?? null, status: 'draft', ownerId: actor.id, lockVersion: 1, createdBy: actor.id, updatedBy: actor.id } as any,
          { transaction }
        );
        const version = await CustomTemplateVersion.create(
          { customTemplateId: duplicate.id, versionNumber: 1, schemaVersion: CUSTOM_TEMPLATE_SCHEMA_VERSION, layoutConfigJson: layout as any, changeSummary: `Duplicated from Custom Template ${id}`, createdBy: actor.id } as any,
          { transaction }
        );
        await duplicate.update({ currentVersionId: version.id }, { transaction });
        await writeAuthAuditLog({ action: 'CUSTOM_TEMPLATE_DUPLICATED', adminUserId: actor.id, metadata: { source_custom_template_id: id, new_custom_template_id: duplicate.id } }, transaction);
        return this.getCustomTemplateDetail(String(duplicate.id), actor, transaction);
      });
    },

    async activateCustomTemplate(id: string, raw: unknown, actor: CustomTemplateActor) {
      const input = lifecyclePayloadSchema.parse(raw);
      return sequelize.transaction(async (transaction) => {
        const template = await findTemplateOrThrow(id, { transaction, lock: true });
        assertActivate(actor, template);
        assertLockVersion(template, input.expected_lock_version);
        const data = plain(template);
        if (data.status === 'active') return this.getCustomTemplateDetail(id, actor, transaction);
        if (!data.currentVersionId && !data.current_version_id) throw new ApiError(422, 'Custom Template has no version to activate');
        const version = await CustomTemplateVersion.findByPk(data.currentVersionId ?? data.current_version_id, { transaction });
        if (!version) throw new ApiError(422, 'Custom Template has no version to activate');
        validateCustomTemplateLayout(plain(version).layoutConfigJson ?? plain(version).layout_config_json);
        await template.update({ status: 'active', activatedAt: new Date(), activatedBy: actor.id, lockVersion: data.lockVersion + 1, updatedBy: actor.id }, { transaction });
        await writeAuthAuditLog({ action: 'CUSTOM_TEMPLATE_ACTIVATED', adminUserId: actor.id, metadata: { custom_template_id: id, previous_status: data.status } }, transaction);
        return this.getCustomTemplateDetail(id, actor, transaction);
      });
    },

    async archiveCustomTemplate(id: string, raw: unknown, actor: CustomTemplateActor) {
      const input = lifecyclePayloadSchema.parse(raw);
      return sequelize.transaction(async (transaction) => {
        const template = await findTemplateOrThrow(id, { transaction, lock: true });
        assertArchive(actor, template);
        assertLockVersion(template, input.expected_lock_version);
        const data = plain(template);
        if (data.status === 'archived') return this.getCustomTemplateDetail(id, actor, transaction);
        await template.update({ status: 'archived', statusBeforeArchive: data.status, archivedAt: new Date(), archivedBy: actor.id, lockVersion: data.lockVersion + 1, updatedBy: actor.id }, { transaction });
        await writeAuthAuditLog({ action: 'CUSTOM_TEMPLATE_ARCHIVED', adminUserId: actor.id, metadata: { custom_template_id: id, previous_status: data.status } }, transaction);
        return this.getCustomTemplateDetail(id, actor, transaction);
      });
    },

    async restoreCustomTemplate(id: string, raw: unknown, actor: CustomTemplateActor) {
      const input = lifecyclePayloadSchema.parse(raw);
      return sequelize.transaction(async (transaction) => {
        const template = await findTemplateOrThrow(id, { transaction, lock: true });
        assertRestore(actor, template);
        assertLockVersion(template, input.expected_lock_version);
        const data = plain(template);
        if (data.status !== 'archived') return this.getCustomTemplateDetail(id, actor, transaction);
        const restoredStatus = data.statusBeforeArchive ?? data.status_before_archive ?? 'draft';
        await template.update({ status: restoredStatus, statusBeforeArchive: null, restoredAt: new Date(), restoredBy: actor.id, lockVersion: data.lockVersion + 1, updatedBy: actor.id }, { transaction });
        await writeAuthAuditLog({ action: 'CUSTOM_TEMPLATE_RESTORED', adminUserId: actor.id, metadata: { custom_template_id: id, new_status: restoredStatus } }, transaction);
        return this.getCustomTemplateDetail(id, actor, transaction);
      });
    },

    async permanentlyDeleteCustomTemplate(id: string, actor: CustomTemplateActor) {
      assertPermanentDelete(actor);
      return sequelize.transaction(async (transaction) => {
        const template = await findTemplateOrThrow(id, { transaction, lock: true });
        const data = plain(template);
        if (data.status !== 'archived') throw new ApiError(409, 'Only archived Custom Templates can be permanently deleted');
        const inUse = await BlogVersion.count({ where: { customTemplateId: id }, transaction });
        if (inUse > 0) {
          throw new ApiError(409, 'Custom Template is in use by one or more Blogs and cannot be permanently deleted', undefined, undefined, { code: CUSTOM_TEMPLATE_IN_USE });
        }
        await writeAuthAuditLog({ action: 'CUSTOM_TEMPLATE_PERMANENTLY_DELETED', adminUserId: actor.id, metadata: { custom_template_id: id, name: data.name } }, transaction);
        await CustomTemplateVersion.destroy({ where: { customTemplateId: id }, transaction });
        await template.destroy({ transaction });
        return { id };
      });
    }
  };
}

export type CustomTemplateService = ReturnType<typeof createCustomTemplateService>;
