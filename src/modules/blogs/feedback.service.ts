import { Op, type Transaction } from 'sequelize';
import { createHash, randomBytes } from 'crypto';
import { sequelize } from '../../config/database.js';
import { env } from '../../config/environment.js';
import { ApiError } from '../../utils/api-error.js';
import { Blog } from './blog.model.js';
import { BlogVersion } from './blog-version.model.js';
import { BlogFeedback } from './blog-feedback.model.js';
import { normalizeBlogBlocks } from './blog-block.validation.js';

const FEEDBACK_VISITOR_HASH_SECRET = env.FEEDBACK_VISITOR_HASH_SECRET;

export interface FeedbackResponse {
  success: boolean;
  data: {
    response: 'yes' | 'no';
    message: string;
  };
}

export interface FeedbackSummary {
  yes_count: number;
  no_count: number;
  total_count: number;
  helpful_percentage: number;
}

export interface FeedbackSummaryWithVersion extends FeedbackSummary {
  blog_version_id: string;
  version_number: number;
}

function hashVisitorKey(visitorKey: string): string {
  return createHash('sha256')
    .update(visitorKey + FEEDBACK_VISITOR_HASH_SECRET)
    .digest('hex');
}

function hashUserAgent(userAgent: string): string {
  return createHash('sha256')
    .update(userAgent + FEEDBACK_VISITOR_HASH_SECRET)
    .digest('hex');
}

export async function generateVisitorKey(): Promise<string> {
  return randomBytes(32).toString('hex');
}

export async function submitFeedback(
  slug: string,
  response: string,
  visitorKeyHash: string,
  userAgentHash?: string,
  transaction?: Transaction
): Promise<FeedbackResponse> {
  if (!['yes', 'no'].includes(response)) {
    throw new ApiError(422, 'Invalid feedback response');
  }

  return sequelize.transaction({ transaction }, async (t) => {
    // Get published blog
    const blog = await Blog.findOne({
      where: { slug: slug.trim().toLowerCase(), status: 'published' },
      include: [{ model: BlogVersion, as: 'currentPublishedVersion', required: false }],
      transaction: t
    }) as any;

    if (!blog) {
      throw new ApiError(404, 'Blog not found or not published');
    }

    const blogData = blog.get({ plain: true }) as any;
    const publishedVersion = blogData?.currentPublishedVersion;
    if (!publishedVersion) {
      throw new ApiError(404, 'Published version not found');
    }

    const blogId = String(blogData.id);
    const versionId = String(publishedVersion.id);

    const blocksDocument = normalizeBlogBlocks(publishedVersion.blocksJson);
    const customFeedbackEnabled = Object.values(blocksDocument.custom_instances ?? {}).some(
      (instance) => instance.componentKey === 'feedback' && instance.enabled
    );
    if (!blocksDocument.blocks.feedback.enabled && !customFeedbackEnabled) {
      throw new ApiError(403, 'Feedback is not enabled for this article');
    }

    // Upsert feedback
    const [feedback] = await BlogFeedback.findOrCreate({
      where: {
        blogVersionId: versionId,
        visitorKeyHash: visitorKeyHash
      },
      defaults: {
        blogId,
        blogVersionId: versionId,
        response: response as any,
        visitorKeyHash,
        userAgentHash: userAgentHash || null
      },
      transaction: t
    });

    // If found, update the response
    const feedbackData = feedback.get({ plain: true });
    if (feedbackData.response !== response) {
      await feedback.update({ response: response as any }, { transaction: t });
    }

    return {
      success: true,
      data: {
        response: response as 'yes' | 'no',
        message: 'Thank you for your feedback.'
      }
    };
  });
}

export async function getFeedbackSummary(
  blogId: string,
  versionId?: string,
  transaction?: Transaction
): Promise<FeedbackSummaryWithVersion[]> {
  const where: any = { blog_id: blogId };
  if (versionId) {
    where.blog_version_id = versionId;
  }

  const feedback = await BlogFeedback.findAll({
    where,
    attributes: [
      'blogVersionId',
      [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
      [sequelize.fn('SUM', sequelize.where(sequelize.col('response'), Op.eq, 'yes')), 'yes_count'],
      [sequelize.fn('SUM', sequelize.where(sequelize.col('response'), Op.eq, 'no')), 'no_count']
    ],
    group: ['blog_version_id'],
    raw: true,
    transaction
  });

  // Get version numbers
  const versionIds = feedback.map((f: any) => f.blogVersionId);
  const versions = await BlogVersion.findAll({
    where: { id: versionIds },
    attributes: ['id', 'versionNumber'],
    transaction
  });

  const versionMap = new Map<string, any>();
  versions.forEach((v: any) => {
    const vData = v.get?.({ plain: true }) || v;
    versionMap.set(String(vData.id), vData.versionNumber);
  });

  return feedback.map((f: any) => {
    const yesCount = Number(f.yes_count) || 0;
    const noCount = Number(f.no_count) || 0;
    const totalCount = yesCount + noCount;
    const helpfulPercentage = totalCount > 0 ? Math.round((yesCount / totalCount) * 100) : 0;
    const versionNumber = versionMap.get(String(f.blogVersionId));

    return {
      blog_version_id: String(f.blogVersionId),
      version_number: versionNumber || 1,
      yes_count: yesCount,
      no_count: noCount,
      total_count: totalCount,
      helpful_percentage: helpfulPercentage
    };
  });
}

export async function getFeedbackSummaryForPublishedVersion(
  slug: string,
  transaction?: Transaction
): Promise<FeedbackSummary> {
  const blog = await Blog.findOne({
    where: { slug: slug.trim().toLowerCase(), status: 'published' },
    attributes: ['id', 'currentPublishedVersionId'],
    transaction
  });

  if (!blog) {
    throw new ApiError(404, 'Blog not found');
  }

  const versionId = blog.get('currentPublishedVersionId');
  if (!versionId) {
    return {
      yes_count: 0,
      no_count: 0,
      total_count: 0,
      helpful_percentage: 0
    };
  }

  const summary = await getFeedbackSummary(String(blog.get('id')), String(versionId), transaction);
  if (!summary || summary.length === 0) {
    return {
      yes_count: 0,
      no_count: 0,
      total_count: 0,
      helpful_percentage: 0
    };
  }

  const s = summary[0]!;
  return {
    yes_count: s.yes_count,
    no_count: s.no_count,
    total_count: s.total_count,
    helpful_percentage: s.helpful_percentage
  };
}

export { hashVisitorKey, hashUserAgent };
