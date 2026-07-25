import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { getFeedbackSummary } from './feedback.service.js';
import { Blog } from './blog.model.js';
import { ApiError } from '../../utils/api-error.js';
import { z } from 'zod';

const summaryQuerySchema = z.object({
  version: z.string().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional()
}).strict();

export function createAdminFeedbackController() {
  return {
    async getSummary(request: Request, response: Response, next: NextFunction) {
      try {
        const blogId = String(request.params.blogId ?? '').trim();
        if (!blogId || !/^\d+$/.test(blogId)) {
          throw new ApiError(400, 'Invalid blog ID');
        }

        const query = summaryQuerySchema.parse(request.query);

        // Verify blog exists and user can access it
        const blog = await Blog.findByPk(blogId, {
          attributes: ['id', 'currentPublishedVersionId']
        });

        if (!blog) {
          throw new ApiError(404, 'Blog not found');
        }

        const publishedVersionId = blog.get('currentPublishedVersionId');
        if (!publishedVersionId && !query.version) {
          // No published version and no specific version requested
          return sendSuccess(response, 'Feedback summary', {
            blog_id: blogId,
            published_version_id: null,
            yes_count: 0,
            no_count: 0,
            total_count: 0,
            helpful_percentage: 0,
            versions: []
          });
        }

        // Get summary for specific version or all versions
        if (query.version) {
          const allVersionSummaries = await getFeedbackSummary(blogId, query.version);
          if (allVersionSummaries.length === 0) {
            return sendSuccess(response, 'Feedback summary', {
              blog_id: blogId,
              published_version_id: query.version,
              yes_count: 0,
              no_count: 0,
              total_count: 0,
              helpful_percentage: 0,
              versions: []
            });
          }

          const summary = allVersionSummaries[0]!;
          return sendSuccess(response, 'Feedback summary', {
            blog_id: blogId,
            published_version_id: query.version,
            yes_count: summary.yes_count,
            no_count: summary.no_count,
            total_count: summary.total_count,
            helpful_percentage: summary.helpful_percentage,
            versions: [summary]
          });
        }

        // Get all version summaries for this blog
        const allVersionSummaries = await getFeedbackSummary(blogId);

        // Find the published version summary if it exists
        const publishedSummary = allVersionSummaries.find(
          (s) => s.blog_version_id === String(publishedVersionId)
        );

        return sendSuccess(response, 'Feedback summary', {
          blog_id: blogId,
          published_version_id: publishedVersionId ? String(publishedVersionId) : null,
          yes_count: publishedSummary?.yes_count ?? 0,
          no_count: publishedSummary?.no_count ?? 0,
          total_count: publishedSummary?.total_count ?? 0,
          helpful_percentage: publishedSummary?.helpful_percentage ?? 0,
          versions: allVersionSummaries
        });
      } catch (error) {
        next(error);
      }
    }
  };
}
