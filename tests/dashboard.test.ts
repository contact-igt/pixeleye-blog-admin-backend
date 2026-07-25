import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/services/security/jwt.service.js';
import { AdminSession, AdminUser } from '../src/modules/auth/index.js';

describe('Dashboard Module Backend Tests', () => {
  vi.spyOn(AdminUser, 'findByPk').mockResolvedValue({ id: '1', role: 'super_admin', status: 'active', name: 'Admin', email: 'admin@example.com' } as never);
  vi.spyOn(AdminSession, 'findByPk').mockResolvedValue({ id: '10', adminUserId: '1', revokedAt: null, expiresAt: new Date(Date.now() + 100000) } as never);
  const adminToken = signAccessToken({ sub: '1', role: 'super_admin', session_id: '10', token_type: 'access' });
  const app = createApp(async () => true);

  it('requires authentication for GET /api/v1/dashboard/stats', async () => {
    const response = await request(app).get('/api/v1/dashboard/stats');
    expect(response.status).toBe(401);
  });

  it('fetches aggregated dashboard statistics for authenticated admin', async () => {
    const response = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('blogs');
    expect(response.body.data).toHaveProperty('media');
    expect(response.body.data).toHaveProperty('templates');
    expect(response.body.data).toHaveProperty('recent_blogs');
    expect(response.body.data).toHaveProperty('recent_media');

    // Confirm Tracked Storage property name and System Templates count
    expect(response.body.data.media).toHaveProperty('tracked_storage_formatted');
    expect(response.body.data.templates.system_count).toBeGreaterThanOrEqual(2);
  });

  it('omits heavy block/content JSON fields in recent_blogs payload', async () => {
    const response = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    const recentBlogs = response.body.data.recent_blogs;
    if (recentBlogs.length > 0) {
      const blog = recentBlogs[0];
      expect(blog).not.toHaveProperty('blocks_json');
      expect(blog).not.toHaveProperty('content_html');
      expect(blog).not.toHaveProperty('content_json');
    }
  });
});
