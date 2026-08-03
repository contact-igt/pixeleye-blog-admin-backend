import { Op } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { env } from '../../config/environment.js';
import { NewsletterCampaign } from './newsletter-campaign.model.js';
import { NewsletterDelivery } from './newsletter-delivery.model.js';
import { writeNewsletterAuditSafely } from './newsletter-audit.service.js';

function isProviderRateLimit(row: { lastErrorCode?: string | null; lastErrorMessage?: string | null }): boolean {
  const value = `${row.lastErrorCode || ''} ${row.lastErrorMessage || ''}`.toLowerCase();
  return /\b(421|429|450|451|452)\b|rate.?limit|temporary overload/.test(value);
}

export async function autoPauseCampaignForDeliveryFailures(campaignId: string): Promise<boolean> {
  return sequelize.transaction(async (transaction) => {
    const campaign = await NewsletterCampaign.findByPk(campaignId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!campaign || !['queued', 'sending'].includes(campaign.get('status')) || campaign.get('deletedAt')) return false;
    const deliveries = await NewsletterDelivery.findAll({
      where: { campaignId, [Op.or]: [{ attemptCount: { [Op.gt]: 0 } }, { status: 'sent' }] },
      attributes: ['status', 'lastErrorCode', 'lastErrorMessage', 'updatedAt'],
      order: [['updatedAt', 'DESC']],
      raw: true,
      transaction
    }) as unknown as Array<{ status: string; lastErrorCode: string | null; lastErrorMessage: string | null; updatedAt: Date }>;
    const attempts = deliveries.length;
    const failures = deliveries.filter((delivery) => ['failed', 'retry_pending', 'uncertain'].includes(delivery.status)).length;
    const consecutiveRateLimits = deliveries.slice(0, env.NEWSLETTER_AUTO_PAUSE_CONSECUTIVE_ERRORS).filter(isProviderRateLimit).length;
    let reasonCode: string | null = null;
    let resumeAt: Date | null = null;
    if (consecutiveRateLimits >= env.NEWSLETTER_AUTO_PAUSE_CONSECUTIVE_ERRORS) {
      reasonCode = 'provider_rate_limited';
      resumeAt = new Date(Date.now() + env.NEWSLETTER_RATE_LIMIT_PAUSE_SECONDS * 1000);
    } else if (attempts >= env.NEWSLETTER_AUTO_PAUSE_MIN_ATTEMPTS && (failures / attempts) * 100 >= env.NEWSLETTER_AUTO_PAUSE_FAILURE_PERCENT) {
      reasonCode = 'high_failure_rate';
    }
    if (!reasonCode) return false;
    await campaign.update({ status: 'paused', pausedAt: new Date(), pausedBy: null, pauseReasonCode: reasonCode, pauseReasonMessage: null, autoPaused: true, resumeAt }, { transaction });
    await writeNewsletterAuditSafely({ action: 'CAMPAIGN_AUTO_PAUSED', adminUserId: null, metadata: { campaign_id: campaignId, reason_code: reasonCode, attempts, failures } }, transaction);
    return true;
  });
}

export async function autoPauseActiveCampaignsForSmtp(): Promise<number> {
  return sequelize.transaction(async (transaction) => {
    const active = await NewsletterCampaign.findAll({
      where: { status: { [Op.in]: ['queued', 'sending'] }, deletedAt: null },
      attributes: ['id'], raw: true, transaction
    }) as unknown as Array<{ id: string }>;
    if (active.length === 0) return 0;
    const ids = active.map((campaign) => String(campaign.id));
    const [affected] = await NewsletterCampaign.update({
      status: 'paused', pausedAt: new Date(), pausedBy: null, pauseReasonCode: 'smtp_unavailable',
      pauseReasonMessage: null, autoPaused: true, resumeAt: null
    }, { where: { id: { [Op.in]: ids }, status: { [Op.in]: ['queued', 'sending'] }, deletedAt: null }, transaction });
    for (const campaignId of ids) {
      await writeNewsletterAuditSafely({ action: 'CAMPAIGN_AUTO_PAUSED', adminUserId: null, metadata: { campaign_id: campaignId, reason_code: 'smtp_unavailable' } }, transaction);
    }
    return affected;
  });
}

export async function autoResumeDueRateLimitedCampaigns(): Promise<number> {
  const due = await NewsletterCampaign.findAll({
    where: { status: 'paused', autoPaused: true, pauseReasonCode: 'provider_rate_limited', resumeAt: { [Op.lte]: new Date() }, deletedAt: null },
    attributes: ['id', 'startedAt']
  });
  let resumed = 0;
  for (const campaign of due) {
    await sequelize.transaction(async (transaction) => {
      const locked = await NewsletterCampaign.findByPk(campaign.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!locked || locked.get('status') !== 'paused' || locked.get('pauseReasonCode') !== 'provider_rate_limited') return;
      const pending = await NewsletterDelivery.count({ where: { campaignId: campaign.id, status: { [Op.in]: ['pending', 'retry_pending'] } }, transaction });
      if (pending === 0) return;
      const status = locked.get('startedAt') ? 'sending' : 'queued';
      await locked.update({ status, pausedAt: null, pausedBy: null, pauseReasonCode: null, pauseReasonMessage: null, autoPaused: false, resumeAt: null }, { transaction });
      await writeNewsletterAuditSafely({ action: 'CAMPAIGN_AUTO_RESUMED', adminUserId: null, metadata: { campaign_id: String(campaign.id), resumed_status: status } }, transaction);
      resumed += 1;
    });
  }
  return resumed;
}
