import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { AdminSession, AdminUser, AuditLog } from '../src/modules/auth/index.js';
import { hashPassword } from '../src/services/security/password.service.js';
import { generateRefreshToken, hashRefreshToken } from '../src/services/security/refresh-token.service.js';
import { signAccessToken } from '../src/services/security/jwt.service.js';
import { env } from '../src/config/environment.js';

function app() {
  return createApp(async () => undefined, 10_000);
}

function admin(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    name: 'Super Admin',
    email: 'admin@example.com',
    role: 'super_admin',
    status: 'active',
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordHash: '',
    update: vi.fn(async function update(this: any, values: Record<string, unknown>) {
      Object.assign(this, values);
      return this;
    }),
    ...overrides
  } as any;
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: '10',
    adminUserId: '1',
    refreshTokenHash: 'hash',
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    replacedBySessionId: null,
    sessionFamilyId: 'family-1',
    parentSessionId: null,
    ipHash: null,
    userAgent: null,
    lastUsedAt: null,
    update: vi.fn(async function update(this: any, values: Record<string, unknown>) {
      Object.assign(this, values);
      return this;
    }),
    ...overrides
  } as any;
}

function customAccessToken(payloadOverrides: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: '1',
    role: 'super_admin',
    session_id: '10',
    token_type: 'access',
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
    iat: now,
    exp: now + 900,
    ...payloadOverrides
  })).toString('base64url');
  const signature = createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}
function accessToken(overrides: Record<string, unknown> = {}, now?: Date) {
  return signAccessToken({ sub: '1', role: 'super_admin', session_id: '10', token_type: 'access', ...overrides } as any, now);
}

beforeEach(() => {
  vi.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
  vi.spyOn(AdminSession, 'findAll').mockResolvedValue([] as never);
  vi.spyOn(AdminSession, 'update').mockResolvedValue([1] as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('admin authentication API', () => {
  it('logs in with valid credentials', async () => {
    const adminUser = admin({ passwordHash: await hashPassword('CorrectPass123') });
    vi.spyOn(AdminUser, 'findOne').mockResolvedValue(adminUser);
    vi.spyOn(AdminSession, 'create').mockResolvedValue(session({ id: '10' }));

    const response = await request(app()).post('/api/v1/admin/auth/login').send({
      email: 'ADMIN@EXAMPLE.COM',
      password: 'CorrectPass123'
    });

    expect(response.status).toBe(200);
    expect(response.body.data.admin.email).toBe('admin@example.com');
    expect(response.body.data.access_token).toBeTruthy();
    expect(response.body.data.refresh_token).toBeUndefined();
    expect(response.headers['set-cookie']?.join(';')).toContain('pe_refresh_token=');
    expect(response.body.data).not.toHaveProperty('password_hash');
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_LOGIN_SUCCESS' }));
  }, 15_000);

  it('rejects an invalid login email', async () => {
    const findOne = vi.spyOn(AdminUser, 'findOne');
    const response = await request(app()).post('/api/v1/admin/auth/login').send({ email: 'bad', password: 'x' });

    expect(response.status).toBe(422);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rejects an invalid password with a generic message', async () => {
    const adminUser = admin({ passwordHash: await hashPassword('CorrectPass123') });
    vi.spyOn(AdminUser, 'findOne').mockResolvedValue(adminUser);

    const response = await request(app()).post('/api/v1/admin/auth/login').send({
      email: 'admin@example.com',
      password: 'WrongPass123'
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password');
    expect(adminUser.update).toHaveBeenCalledWith(expect.objectContaining({ failedLoginAttempts: 1 }));
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_LOGIN_FAILED' }));
  }, 15_000);

  it('rejects inactive users', async () => {
    vi.spyOn(AdminUser, 'findOne').mockResolvedValue(admin({ status: 'inactive' }));

    const response = await request(app()).post('/api/v1/admin/auth/login').send({
      email: 'admin@example.com',
      password: 'CorrectPass123'
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Admin account is inactive');
  });

  it('rejects blocked users', async () => {
    vi.spyOn(AdminUser, 'findOne').mockResolvedValue(admin({ status: 'blocked' }));

    const response = await request(app()).post('/api/v1/admin/auth/login').send({
      email: 'admin@example.com',
      password: 'CorrectPass123'
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Admin account is blocked');
  });

  it('locks the account after repeated failed attempts', async () => {
    const adminUser = admin({ failedLoginAttempts: 4, passwordHash: await hashPassword('CorrectPass123') });
    vi.spyOn(AdminUser, 'findOne').mockResolvedValue(adminUser);

    const response = await request(app()).post('/api/v1/admin/auth/login').send({
      email: 'admin@example.com',
      password: 'WrongPass123'
    });

    expect(response.status).toBe(401);
    expect(adminUser.update).toHaveBeenCalledWith(expect.objectContaining({ failedLoginAttempts: 5, lockedUntil: expect.any(Date) }));
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_ACCOUNT_LOCKED' }));
  }, 15_000);

  it('returns the authenticated admin profile', async () => {
    vi.spyOn(AdminUser, 'findByPk').mockResolvedValue(admin());
    vi.spyOn(AdminSession, 'findByPk').mockResolvedValue(session());

    const response = await request(app()).get('/api/v1/admin/auth/me').set('Authorization', `Bearer ${accessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.data.admin.email).toBe('admin@example.com');
  });

  it('rejects missing access tokens', async () => {
    const response = await request(app()).get('/api/v1/admin/auth/me');

    expect(response.status).toBe(401);
  });

  it('rejects invalid access tokens', async () => {
    const response = await request(app()).get('/api/v1/admin/auth/me').set('Authorization', 'Bearer invalid');

    expect(response.status).toBe(401);
  });

  it('rejects expired access tokens', async () => {
    const expired = accessToken({}, new Date(Date.now() - 60 * 60 * 1000));

    const response = await request(app()).get('/api/v1/admin/auth/me').set('Authorization', `Bearer ${expired}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Access token has expired');
  });

  it('rotates refresh tokens successfully', async () => {
    const token = generateRefreshToken();
    const oldSession = session({ refreshTokenHash: hashRefreshToken(token), adminUser: admin() });
    const newSession = session({ id: '11' });
    vi.spyOn(AdminSession, 'findOne').mockResolvedValue(oldSession);
    vi.spyOn(AdminSession, 'create').mockResolvedValue(newSession);

    const response = await request(app()).post('/api/v1/admin/auth/refresh').send({ refresh_token: token });

    expect(response.status).toBe(200);
    expect(response.body.data.refresh_token).toBeUndefined();
    expect(response.headers['set-cookie']?.join(';')).toContain('pe_refresh_token=');
    expect(AdminSession.create).toHaveBeenCalledWith(expect.objectContaining({ sessionFamilyId: 'family-1', parentSessionId: '10' }));
    expect(oldSession.update).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date), replacedBySessionId: '11' }));
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_REFRESH_SUCCESS' }));
  });


  it('refreshes from the HttpOnly cookie without a JSON refresh token', async () => {
    const token = generateRefreshToken();
    const oldSession = session({ refreshTokenHash: hashRefreshToken(token), adminUser: admin() });
    const newSession = session({ id: '12' });
    vi.spyOn(AdminSession, 'findOne').mockResolvedValue(oldSession);
    vi.spyOn(AdminSession, 'create').mockResolvedValue(newSession);

    const response = await request(app())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`pe_refresh_token=${encodeURIComponent(token)}`])
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.access_token).toBeTruthy();
    expect(response.body.data.refresh_token).toBeUndefined();
    expect(response.headers['set-cookie']?.join(';')).toContain('pe_refresh_token=');
    expect(AdminSession.create).toHaveBeenCalledWith(expect.objectContaining({ sessionFamilyId: 'family-1', parentSessionId: '10' }));
    expect(oldSession.update).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date), replacedBySessionId: '12' }));
  });

  it('logs out using only the refresh cookie and clears the cookie', async () => {
    const token = generateRefreshToken();
    const cookieSession = session({ refreshTokenHash: hashRefreshToken(token), adminUserId: '1' });
    vi.spyOn(AdminSession, 'findOne').mockResolvedValue(cookieSession);

    const response = await request(app())
      .post('/api/v1/auth/logout')
      .set('Cookie', [`pe_refresh_token=${encodeURIComponent(token)}`])
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.logged_out).toBe(true);
    expect(AdminSession.update).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date) }), expect.objectContaining({ where: expect.objectContaining({ sessionFamilyId: 'family-1' }) }));
    const setCookie = response.headers['set-cookie']?.join(';') ?? '';
    expect(setCookie).toContain('pe_refresh_token=');
    expect(setCookie).toMatch(/Max-Age=0|Expires=/i);
  });

  it('rejects reuse of a revoked refresh token', async () => {
    const token = generateRefreshToken();
    vi.spyOn(AdminSession, 'findOne').mockResolvedValue(session({ refreshTokenHash: hashRefreshToken(token), revokedAt: new Date() }));

    const response = await request(app()).post('/api/v1/admin/auth/refresh').send({ refresh_token: token });

    expect(response.status).toBe(401);
    expect(AdminSession.update).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date) }), expect.objectContaining({ where: expect.objectContaining({ sessionFamilyId: 'family-1' }) }));
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_REFRESH_REJECTED' }));
  });

  it('logs out idempotently', async () => {
    vi.spyOn(AdminUser, 'findByPk').mockResolvedValue(admin());
    vi.spyOn(AdminSession, 'findByPk')
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(session({ id: '10' }));

    const response = await request(app()).post('/api/v1/admin/auth/logout').set('Authorization', `Bearer ${accessToken()}`).send({});

    expect(response.status).toBe(200);
    expect(response.body.data.logged_out).toBe(true);
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_LOGOUT' }));
  });

  it('changes password and revokes sessions', async () => {
    const adminUser = admin({ passwordHash: await hashPassword('CorrectPass123') });
    vi.spyOn(AdminUser, 'findByPk')
      .mockResolvedValueOnce(adminUser)
      .mockResolvedValueOnce(adminUser);
    vi.spyOn(AdminSession, 'findByPk').mockResolvedValue(session());
    vi.spyOn(AdminSession, 'update').mockResolvedValue([2]);

    const response = await request(app())
      .patch('/api/v1/admin/auth/change-password')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send({ current_password: 'CorrectPass123', new_password: 'NewPass123' });

    expect(response.status).toBe(200);
    expect(adminUser.update).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: expect.stringMatching(/^scrypt\$v1\$/), passwordChangedAt: expect.any(Date) }));
    expect(AdminSession.update).toHaveBeenCalled();
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_PASSWORD_CHANGED' }));
  }, 15_000);


  it('supports the canonical /api/v1/auth login route', async () => {
    const adminUser = admin({ passwordHash: await hashPassword('CorrectPass123') });
    vi.spyOn(AdminUser, 'findOne').mockResolvedValue(adminUser);
    vi.spyOn(AdminSession, 'create').mockResolvedValue(session({ id: '10' }));

    const response = await request(app()).post('/api/v1/auth/login').send({
      email: 'admin@example.com',
      password: 'CorrectPass123'
    });

    expect(response.status).toBe(200);
    expect(response.body.data.access_token).toBeTruthy();
  }, 15_000);

  it('rejects unknown emails with a generic message', async () => {
    vi.spyOn(AdminUser, 'findOne').mockResolvedValue(null);

    const response = await request(app()).post('/api/v1/auth/login').send({
      email: 'missing@example.com',
      password: 'CorrectPass123'
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password');
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_LOGIN_FAILED' }));
  });

  it('rejects expired refresh tokens', async () => {
    const token = generateRefreshToken();
    const oldSession = session({ refreshTokenHash: hashRefreshToken(token), expiresAt: new Date(Date.now() - 1000) });
    vi.spyOn(AdminSession, 'findOne').mockResolvedValue(oldSession);

    const response = await request(app()).post('/api/v1/auth/refresh').send({ refresh_token: token });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Refresh token has expired');
    expect(oldSession.update).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date) }));
  });

  it('rejects wrong issuer and wrong audience JWTs', async () => {
    vi.spyOn(AdminUser, 'findByPk').mockResolvedValue(admin());
    vi.spyOn(AdminSession, 'findByPk').mockResolvedValue(session());

    const wrongIssuer = customAccessToken({ iss: 'wrong-issuer' });
    const wrongAudience = customAccessToken({ aud: 'wrong-audience' });

    expect((await request(app()).get('/api/v1/auth/me').set('Authorization', `Bearer ${wrongIssuer}`)).status).toBe(401);
    expect((await request(app()).get('/api/v1/auth/me').set('Authorization', `Bearer ${wrongAudience}`)).status).toBe(401);
  });

  it('denies media writes for viewer role admins', async () => {
    vi.spyOn(AdminUser, 'findByPk').mockResolvedValue(admin({ role: 'viewer' }));
    vi.spyOn(AdminSession, 'findByPk').mockResolvedValue(session());

    const response = await request(app())
      .post('/api/v1/media/assets')
      .set('Authorization', `Bearer ${accessToken({ role: 'viewer' })}`);

    expect(response.status).toBe(403);
  });
  it('rejects media upload without authentication', async () => {
    const response = await request(app()).post('/api/v1/media/assets');

    expect(response.status).toBe(401);
  });
});












