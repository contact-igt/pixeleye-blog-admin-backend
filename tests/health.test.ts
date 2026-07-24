import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

describe('health API', () => {
  it('returns a standard ready response', async () => {
    const response = await request(createApp(async () => undefined)).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.database).toBe('connected');
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.body.data).not.toHaveProperty('password');
  });

  it('keeps liveness independent from the database', async () => {
    const databaseCheck = vi.fn(async () => { throw new Error('connection refused'); });
    const response = await request(createApp(databaseCheck)).get('/api/v1/health/live');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('running');
    expect(databaseCheck).not.toHaveBeenCalled();
  });

  it('returns a standard 404 response', async () => {
    const response = await request(createApp(async () => undefined)).get('/missing');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false });
    expect(response.body.request_id).toBeTruthy();
  });

  it('returns controlled 503 readiness when the database check fails', async () => {
    const response = await request(createApp(async () => { throw new Error('connection refused'); })).get('/api/v1/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Pixel Eye Blog API is not ready');
    expect(response.body.request_id).toBeTruthy();
    expect(response.body).not.toHaveProperty('debug');
  });

  it('accepts an approved CORS origin', async () => {
    const response = await request(createApp(async () => undefined)).get('/api/v1/health/live').set('Origin', 'http://localhost:3000');
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('rejects an unapproved CORS origin', async () => {
    const response = await request(createApp(async () => undefined)).get('/api/v1/health/live').set('Origin', 'https://untrusted.example');
    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it('supports CORS preflight for an approved origin', async () => {
    const response = await request(createApp(async () => undefined))
      .options('/api/v1/health/live')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('preserves a safe incoming request ID', async () => {
    const response = await request(createApp(async () => undefined))
      .get('/api/v1/health/live')
      .set('X-Request-ID', 'request-safe_123');
    expect(response.headers['x-request-id']).toBe('request-safe_123');
  });

  it('replaces an unsafe incoming request ID', async () => {
    const response = await request(createApp(async () => undefined))
      .get('/api/v1/health/live')
      .set('X-Request-ID', 'unsafe request id');
    expect(response.headers['x-request-id']).toMatch(/^req_/);
  });

  it('returns controlled JSON when rate limited', async () => {
    const app = createApp(async () => undefined, 1);
    await request(app).get('/api/v1/health/live');
    const response = await request(app).get('/api/v1/health/live');
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Too many requests. Please try again later.'
    });
    expect(response.body.request_id).toBeTruthy();
  });

  it('returns controlled JSON for an oversized body', async () => {
    const response = await request(createApp(async () => undefined))
      .post('/api/v1/health/live')
      .set('Content-Type', 'application/json')
      .send({ value: 'x'.repeat(1_100_000) });
    expect(response.status).toBe(413);
    expect(response.body.message).toBe('Request body is too large');
  });

  it('sets Helmet security headers', async () => {
    const response = await request(createApp(async () => undefined)).get('/api/v1/health/live');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});


