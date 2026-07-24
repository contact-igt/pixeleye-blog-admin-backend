import { DeleteObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createMediaController } from '../src/modules/media/media.controller.js';
import { signAccessToken } from '../src/services/security/jwt.service.js';
import { AdminSession, AdminUser } from '../src/modules/auth/index.js';

function stubR2Env(overrides: Record<string, string> = {}) {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '1234567890abcdef1234567890abcdef');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'r2-access-key');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'r2-secret-key');
  vi.stubEnv('R2_BUCKET_NAME', 'pixel-eye-blog-media');
  vi.stubEnv('R2_REGION', 'auto');
  vi.stubEnv('R2_ENDPOINT', 'https://1234567890abcdef1234567890abcdef.r2.cloudflarestorage.com');
  vi.stubEnv('R2_PUBLIC_BASE_URL', 'https://media.example.com');
  vi.stubEnv('R2_OBJECT_PREFIX', 'pixel-eye-blog');
  vi.stubEnv('R2_MAX_FILE_SIZE_MB', '5');
  vi.stubEnv('R2_ALLOWED_IMAGE_TYPES', 'image/jpeg,image/png,image/webp,image/avif');
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

async function imageBuffer(format: 'jpeg' | 'png' | 'webp' | 'avif' = 'jpeg', width = 32, height = 24): Promise<Buffer> {
  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 20, g: 120, b: 200, alpha: 1 }
    }
  });
  if (format === 'jpeg') return base.jpeg().toBuffer();
  if (format === 'png') return base.png().toBuffer();
  if (format === 'webp') return base.webp().toBuffer();
  return base.avif().toBuffer();
}

function mediaFile(buffer: Buffer, mimetype = 'image/jpeg', overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'folder/my image.jpg',
    encoding: '7bit',
    mimetype,
    size: buffer.byteLength,
    buffer,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides
  };
}

function mockUploadedAsset(values: Record<string, unknown>) {
  return {
    id: '99',
    get() {
      return {
        id: '99',
        clientId: null,
        storageProvider: 'cloudflare_r2',
        provider: 'cloudflare_r2',
        bucketName: 'pixel-eye-blog-media',
        originalObjectKey: 'pixel-eye-blog/media/object-id/original.webp',
        originalUrl: 'https://media.example.com/pixel-eye-blog/media/object-id/original.webp',
        variantsJson: {
          thumbnail: {
            key: 'pixel-eye-blog/media/object-id/thumbnail.webp',
            url: 'https://media.example.com/pixel-eye-blog/media/object-id/thumbnail.webp',
            width: 200,
            height: 200,
            size_bytes: 100,
            mime_type: 'image/webp'
          }
        },
        purpose: 'hero',
        originalFileName: 'my image.jpg',
        originalFilename: 'my image.jpg',
        mimeType: 'image/jpeg',
        outputMimeType: 'image/webp',
        sizeBytes: 512,
        fileSize: 512,
        width: 32,
        height: 24,
        altText: 'Alt text',
        metadata: {},
        status: 'active',
        uploadedBy: '1',
        createdAt: new Date('2026-07-22T00:00:00Z'),
        updatedAt: new Date('2026-07-22T00:00:00Z'),
        deletedAt: null,
        ...values
      };
    }
  };
}



function mediaAuthToken(role: 'super_admin' | 'editor' | 'author' | 'viewer' = 'super_admin') {
  vi.spyOn(AdminUser, 'findByPk').mockResolvedValue({ id: '1', role, status: 'active' } as never);
  vi.spyOn(AdminSession, 'findByPk').mockResolvedValue({ id: '10', adminUserId: '1', revokedAt: null, expiresAt: new Date(Date.now() + 100000) } as never);
  return signAccessToken({ sub: '1', role, session_id: '10', token_type: 'access' });
}
function mockMutableAsset(values: Record<string, unknown> = {}) {
  const asset: any = mockUploadedAsset(values);
  let state = asset.get();
  asset.update = vi.fn(async (updates: Record<string, unknown>) => {
    state = { ...state, ...updates, updatedAt: new Date('2026-07-22T01:00:00Z') };
    asset.get = () => state;
    return asset;
  });
  asset.destroy = vi.fn(async () => undefined);
  return asset;
}
beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  stubR2Env();
});

describe('Cloudflare R2 service', () => {
  it('builds public URLs from object keys', async () => {
    const { buildR2PublicUrl } = await import('../src/services/integrations/cloudflare.service.js');

    expect(buildR2PublicUrl('pixel-eye-blog/media/abc/original.webp')).toBe(
      'https://media.example.com/pixel-eye-blog/media/abc/original.webp'
    );
  });


  it('encodes object-key URL segments safely', async () => {
    const { buildR2PublicUrl } = await import('../src/services/integrations/cloudflare.service.js');

    expect(buildR2PublicUrl('pixel-eye-blog/media/id/file name.webp')).toBe(
      'https://media.example.com/pixel-eye-blog/media/id/file%20name.webp'
    );
  });
  it('generates expected object keys', async () => {
    const { generateR2ObjectKey } = await import('../src/services/integrations/cloudflare.service.js');

    expect(generateR2ObjectKey('11111111-1111-4111-8111-111111111111', 'hero')).toBe(
      'pixel-eye-blog/media/11111111-1111-4111-8111-111111111111/hero.webp'
    );
  });

  it('rejects missing configuration', async () => {
    vi.resetModules();
    stubR2Env({ R2_PUBLIC_BASE_URL: '' });
    const { buildR2PublicUrl } = await import('../src/services/integrations/cloudflare.service.js');

    expect(() => buildR2PublicUrl('pixel-eye-blog/media/abc/original.webp')).toThrow('Cloudflare R2 configuration is incomplete');
  });

  it('uploads with WebP content type and immutable cache control', async () => {
    const send = vi.fn(async (command) => {
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input.ContentType).toBe('image/webp');
      expect(command.input.CacheControl).toBe('public, max-age=31536000, immutable');
      expect(command.input.Bucket).toBe('pixel-eye-blog-media');
      return { ETag: 'etag-1' };
    });
    const { uploadR2Object } = await import('../src/services/integrations/cloudflare.service.js');

    await expect(
      uploadR2Object({ key: 'pixel-eye-blog/media/id/original.webp', body: Buffer.from('x') }, { send } as never)
    ).resolves.toMatchObject({
      key: 'pixel-eye-blog/media/id/original.webp',
      bucket: 'pixel-eye-blog-media',
      url: 'https://media.example.com/pixel-eye-blog/media/id/original.webp',
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable'
    });
  });

  it('handles provider upload failure without exposing secrets', async () => {
    const send = vi.fn(async () => {
      throw new Error('provider refused');
    });
    const { uploadR2Object } = await import('../src/services/integrations/cloudflare.service.js');

    await expect(
      uploadR2Object({ key: 'pixel-eye-blog/media/id/original.webp', body: Buffer.from('x') }, { send } as never)
    ).rejects.toThrow('Cloudflare R2 upload failed');
  });

  it('deletes an object successfully', async () => {
    const send = vi.fn(async (command) => {
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input.Key).toBe('pixel-eye-blog/media/id/original.webp');
      return {};
    });
    const { deleteR2Object } = await import('../src/services/integrations/cloudflare.service.js');

    await expect(deleteR2Object('pixel-eye-blog/media/id/original.webp', { send } as never)).resolves.toBeUndefined();
  });

  it('handles delete request failure', async () => {
    const send = vi.fn(async () => {
      throw new Error('delete failed');
    });
    const { deleteR2Object } = await import('../src/services/integrations/cloudflare.service.js');

    await expect(deleteR2Object('pixel-eye-blog/media/id/original.webp', { send } as never)).rejects.toThrow(
      'Cloudflare R2 delete failed'
    );
  });


  it('checks object existence with HeadObject before restore', async () => {
    const send = vi.fn(async (command) => {
      expect(command).toBeInstanceOf(HeadObjectCommand);
      expect(command.input.Key).toBe('pixel-eye-blog/media/id/original.webp');
      return {};
    });
    const { verifyR2ObjectsExist } = await import('../src/services/integrations/cloudflare.service.js');

    await expect(verifyR2ObjectsExist(['pixel-eye-blog/media/id/original.webp'], { send } as never)).resolves.toBeUndefined();
  });
  it('verifies R2 with HeadBucket', async () => {
    const send = vi.fn(async (command) => {
      expect(command).toBeInstanceOf(HeadBucketCommand);
      expect(command.input.Bucket).toBe('pixel-eye-blog-media');
      return {};
    });
    const { verifyR2Connection } = await import('../src/services/integrations/cloudflare.service.js');

    await expect(verifyR2Connection({ send } as never)).resolves.toBeUndefined();
  });

  it('reports controlled R2 verification failure', async () => {
    const send = vi.fn(async () => {
      throw new Error('bad credentials');
    });
    const { verifyR2Connection } = await import('../src/services/integrations/cloudflare.service.js');

    await expect(verifyR2Connection({ send } as never)).rejects.toThrow('Cloudflare R2 verification failed');
  });
});

describe('media validation and image processing', () => {
  it('accepts JPEG upload signatures', async () => {
    const buffer = await imageBuffer('jpeg');
    const { validateMediaFile } = await import('../src/modules/media/media.validation.js');

    expect(validateMediaFile(mediaFile(buffer, 'image/jpeg'), 'hero')).toBeTruthy();
  });

  it('accepts PNG upload signatures', async () => {
    const buffer = await imageBuffer('png');
    const { validateMediaFile } = await import('../src/modules/media/media.validation.js');

    expect(validateMediaFile(mediaFile(buffer, 'image/png'), 'hero')).toBeTruthy();
  });

  it('accepts WebP upload signatures', async () => {
    const buffer = await imageBuffer('webp');
    const { validateMediaFile } = await import('../src/modules/media/media.validation.js');

    expect(validateMediaFile(mediaFile(buffer, 'image/webp'), 'hero')).toBeTruthy();
  });

  it('accepts AVIF upload signatures when Sharp supports AVIF', async () => {
    const buffer = await imageBuffer('avif');
    const { validateMediaFile } = await import('../src/modules/media/media.validation.js');

    expect(validateMediaFile(mediaFile(buffer, 'image/avif'), 'hero')).toBeTruthy();
  });

  it('rejects invalid MIME types', async () => {
    const { validateMediaFile } = await import('../src/modules/media/media.validation.js');

    expect(() => validateMediaFile(mediaFile(Buffer.from('<svg />'), 'image/svg+xml'), 'hero')).toThrow(
      'Unsupported image MIME type'
    );
  });

  it('rejects files that exceed purpose size limits', async () => {
    const { validateMediaFile, mediaUploadLimitsBytes } = await import('../src/modules/media/media.validation.js');
    const buffer = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(mediaUploadLimitsBytes.avatar + 1)]);

    expect(() => validateMediaFile(mediaFile(buffer, 'image/jpeg', { size: buffer.byteLength }), 'avatar')).toThrow(
      'Image is too large for avatar uploads'
    );
  });

  it('rejects fake images with image MIME types', async () => {
    const { validateMediaFile } = await import('../src/modules/media/media.validation.js');

    expect(() => validateMediaFile(mediaFile(Buffer.from('not-image'), 'image/jpeg'), 'hero')).toThrow(
      'Image file signature does not match an allowed image type'
    );
  });

  it('reports Sharp decode failures', async () => {
    const { processMediaImage } = await import('../src/modules/media/media-image.service.js');

    await expect(processMediaImage(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).rejects.toThrow('Image could not be decoded');
  });

  it('generates original and named WebP variants', async () => {
    const { processMediaImage } = await import('../src/modules/media/media-image.service.js');
    const result = await processMediaImage(await imageBuffer('png', 1000, 800));

    expect(result.variants.map((variant) => variant.name)).toEqual([
      'original',
      'thumbnail',
      'card',
      'content',
      'hero',
      'avatar'
    ]);
    expect(result.variants.every((variant) => variant.mimeType === 'image/webp')).toBe(true);
  });
});

describe('media R2 persistence flow', () => {
  it('uploads processed variants and creates a safe DB record', async () => {
    const uploadedKeys: string[] = [];
    const uploadObject = vi.fn(async ({ key }: { key: string }) => {
      uploadedKeys.push(key);
      return {
        key,
        bucket: 'pixel-eye-blog-media',
        url: `https://media.example.com/${key}`,
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable'
      };
    });
    const repository = {
      create: vi.fn(async (values: Record<string, unknown>) => mockUploadedAsset(values)),
      findByPk: vi.fn()
    };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository, uploadObject, deleteObjects: vi.fn() });

    const response = await service.uploadMediaAsset({
      file: mediaFile(await imageBuffer('jpeg')),
      body: { purpose: 'hero', uploaded_by: '1', alt_text: 'Alt text' }
    });

    expect(uploadObject).toHaveBeenCalledTimes(6);
    expect(uploadedKeys.every((key) => key.startsWith('pixel-eye-blog/media/'))).toBe(true);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ storageProvider: 'cloudflare_r2', uploadedBy: '1' }));
    expect(JSON.stringify(response)).not.toContain('r2-secret-key');
    expect(response.storage_provider).toBe('cloudflare_r2');
  });

  it('cleans up already uploaded objects after a partial R2 upload failure', async () => {
    const deleteObjects = vi.fn(async () => undefined);
    const uploadObject = vi
      .fn()
      .mockImplementationOnce(async ({ key }: { key: string }) => ({ key, bucket: 'pixel-eye-blog-media', url: `https://media.example.com/${key}`, contentType: 'image/webp', cacheControl: 'cache' }))
      .mockImplementationOnce(async () => {
        throw new Error('upload failed');
      });
    const repository = { create: vi.fn(), findByPk: vi.fn() };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository, uploadObject, deleteObjects });

    await expect(service.uploadMediaAsset({ file: mediaFile(await imageBuffer()), body: { purpose: 'hero' } })).rejects.toThrow(
      'Media asset could not be saved'
    );
    expect(deleteObjects).toHaveBeenCalledWith([expect.stringContaining('/original.webp')]);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('cleans up uploaded objects when database insert fails', async () => {
    const deleteObjects = vi.fn(async () => undefined);
    const uploadObject = vi.fn(async ({ key }: { key: string }) => ({ key, bucket: 'pixel-eye-blog-media', url: `https://media.example.com/${key}`, contentType: 'image/webp', cacheControl: 'cache' }));
    const repository = {
      create: vi.fn(async () => {
        throw new Error('insert failed');
      }),
      findByPk: vi.fn()
    };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository, uploadObject, deleteObjects });

    await expect(service.uploadMediaAsset({ file: mediaFile(await imageBuffer()), body: { purpose: 'hero' } })).rejects.toThrow(
      'Media asset could not be saved'
    );
    expect(deleteObjects).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining('/original.webp')]));
  });

  it('moves media to trash without deleting R2 objects or destroying the DB row', async () => {
    const asset = mockMutableAsset({});
    const deleteObjects = vi.fn(async () => undefined);
    const repository = { create: vi.fn(), findByPk: vi.fn(async () => asset) };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository, deleteObjects });

    await expect(service.softDeleteMediaAsset('99', { id: '1', role: 'editor' })).resolves.toMatchObject({ status: 'trashed', trashed_by: { id: '1' } });
    expect(deleteObjects).not.toHaveBeenCalled();
    expect(asset.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'trashed', trashedBy: '1', restoredAt: null }));
    expect(asset.destroy).not.toHaveBeenCalled();
  });

  it('treats repeated trash moves as idempotent when already trashed', async () => {
    const asset = mockUploadedAsset({ status: 'trashed', trashedAt: new Date('2026-07-22T00:00:00Z'), trashedBy: '1' });
    const deleteObjects = vi.fn(async () => undefined);
    const repository = { create: vi.fn(), findByPk: vi.fn(async () => asset) };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository, deleteObjects });

    await expect(service.softDeleteMediaAsset('99', { id: '1', role: 'editor' })).resolves.toMatchObject({ already_trashed: true });
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  it('restores trashed media after verifying R2 objects exist', async () => {
    const asset = mockMutableAsset({ status: 'trashed', trashedAt: new Date('2026-07-22T00:00:00Z'), trashedBy: '1', purgeAfter: new Date('2026-08-21T00:00:00Z') });
    const verifyObjects = vi.fn(async () => undefined);
    const repository = { create: vi.fn(), findByPk: vi.fn(async () => asset) };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository, verifyObjects });

    await expect(service.restoreMediaAsset('99', { id: '1', role: 'editor' })).resolves.toMatchObject({ status: 'active', restored_by: { id: '1' } });
    expect(verifyObjects).toHaveBeenCalledWith(expect.arrayContaining(['pixel-eye-blog/media/object-id/original.webp']));
    expect(asset.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', trashedAt: null, purgeAfter: null, restoredBy: '1' }));
  });

  it('blocks restore when R2 objects are missing', async () => {
    const asset = mockMutableAsset({ status: 'trashed', trashedAt: new Date('2026-07-22T00:00:00Z'), trashedBy: '1' });
    const verifyObjects = vi.fn(async () => {
      throw new Error('missing');
    });
    const repository = { create: vi.fn(), findByPk: vi.fn(async () => asset) };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository, verifyObjects });

    await expect(service.restoreMediaAsset('99', { id: '1', role: 'editor' })).rejects.toThrow('storage objects are unavailable');
    expect(asset.update).not.toHaveBeenCalled();
  });

  it('permanently deletes only trashed media and retains the DB row', async () => {
    const asset = mockMutableAsset({ status: 'trashed' });
    const deleteObjects = vi.fn(async () => undefined);
    const repository = { create: vi.fn(), findByPk: vi.fn(async () => asset) };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository, deleteObjects });

    await expect(service.permanentlyDeleteMediaAsset('99', { id: '1', role: 'super_admin' })).resolves.toMatchObject({ status: 'deleted', deleted_by: { id: '1' }, deleted_object_count: 2 });
    expect(deleteObjects).toHaveBeenCalledWith(expect.arrayContaining(['pixel-eye-blog/media/object-id/original.webp']));
    expect(asset.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'deleting', deleteFailureReason: null }));
    expect(asset.destroy).not.toHaveBeenCalled();
  });

  it('marks permanent delete failures as retryable delete_failed', async () => {
    const asset = mockMutableAsset({ status: 'trashed' });
    const deleteObjects = vi.fn(async () => {
      throw new Error('delete failed');
    });
    const repository = { create: vi.fn(), findByPk: vi.fn(async () => asset) };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository, deleteObjects });

    await expect(service.permanentlyDeleteMediaAsset('99', { id: '1', role: 'super_admin' })).rejects.toThrow('Permanent media deletion failed');
    expect(asset.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'delete_failed', deletedAt: null, deleteFailureReason: 'Cloudflare R2 delete failed' }));
  });

  it('purges expired trashed media and preserves non-eligible rows', async () => {
    const expired = mockMutableAsset({ status: 'trashed', purgeAfter: new Date('2026-07-01T00:00:00Z') });
    const active = mockMutableAsset({ status: 'active', purgeAfter: null });
    const repository = { create: vi.fn(), findByPk: vi.fn(), findAll: vi.fn(async () => [expired]) };
    const deleteObjects = vi.fn(async () => undefined);
    const auditWriter = vi.fn(async () => undefined);
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository, deleteObjects, auditWriter });

    await expect(service.purgeExpiredTrashedMediaAssets({ now: new Date('2026-08-01T00:00:00Z'), batchSize: 50 })).resolves.toEqual({ scanned: 1, purged: 1, failed: 0 });
    expect(repository.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'trashed' }), limit: 50, paranoid: false }));
    expect(expired.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'deleted' }));
    expect(active.update).not.toHaveBeenCalled();
    expect(auditWriter).toHaveBeenCalledWith(expect.objectContaining({ action: 'MEDIA_AUTO_PURGED' }));
  });});

describe('media route security', () => {
  it('rejects unauthenticated uploads', async () => {
    const response = await request(createApp(async () => undefined, 10_000)).post('/api/v1/media/assets');

    expect(response.status).toBe(401);
  });

  it('rejects unauthenticated deletes', async () => {
    const response = await request(createApp(async () => undefined, 10_000)).delete('/api/v1/media/assets/1');

    expect(response.status).toBe(401);
  });

  it('does not accept uploaded_by spoofing from the request body', async () => {
    const uploadMediaAsset = vi.fn(async (input) => input.body);
    const controller = createMediaController({ uploadMediaAsset, softDeleteMediaAsset: vi.fn(), deleteProviderAsset: vi.fn() } as never);
    const requestMock = {
      authenticatedAdmin: { id: '1' },
      body: { purpose: 'hero', uploaded_by: '999' },
      file: mediaFile(await imageBuffer())
    };
    const responseMock = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await controller.upload(requestMock as never, responseMock as never, next);

    expect(uploadMediaAsset).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ uploaded_by: '1' }) }));
  });

  it('does not include secrets in authenticated media route responses', async () => {
    vi.spyOn(AdminUser, 'findByPk').mockResolvedValue({ id: '1', role: 'super_admin', status: 'active' } as never);
    vi.spyOn(AdminSession, 'findByPk').mockResolvedValue({ id: '10', revokedAt: null, expiresAt: new Date(Date.now() + 100000) } as never);
    const token = signAccessToken({ sub: '1', role: 'super_admin', session_id: '10', token_type: 'access' });
    const response = await request(createApp(async () => undefined, 10_000))
      .post('/api/v1/media/assets')
      .set('Authorization', `Bearer ${token}`)
      .field('purpose', 'hero');

    expect(JSON.stringify(response.body)).not.toContain('r2-secret-key');
  });
});





describe('media listing and detail APIs', () => {
  it('routes GET /media/assets/trash to the trash listing instead of media detail validation', async () => {
    const token = mediaAuthToken();

    const response = await request(createApp(async () => undefined, 10_000)).get('/api/v1/media/assets/trash').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Media trash fetched');
    expect(response.body.message).not.toBe('Media asset ID is invalid');
  });

  it('routes GET /media/assets/:validId to media detail instead of invalid-ID validation', async () => {
    const token = mediaAuthToken();

    const response = await request(createApp(async () => undefined, 10_000)).get('/api/v1/media/assets/99').set('Authorization', `Bearer ${token}`);

    expect(response.status).not.toBe(400);
    expect(response.body.message).not.toBe('Media asset ID is invalid');
  });

  it('keeps invalid real media IDs on the detail route returning the invalid-ID error', async () => {
    const token = mediaAuthToken();

    const response = await request(createApp(async () => undefined, 10_000)).get('/api/v1/media/assets/not-a-number').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Media asset ID is invalid');
  });
  it('registers the uploaded-by eager-load association for runtime listing', async () => {
    const repository = {
      create: vi.fn(),
      findByPk: vi.fn(),
      findAndCountAll: vi.fn(async () => ({ rows: [], count: 0 }))
    };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const { MediaAsset } = await import('../src/modules/media/media.model.js');
    const service = createMediaService({ repository });

    await expect(service.listMediaAssets({ limit: '1' })).resolves.toHaveProperty('items');
    expect(MediaAsset.associations.uploadedByAdmin).toBeDefined();
    expect(MediaAsset.associations.trashedByAdmin).toBeDefined();
  });

  it('lists active media with default pagination and safe fields', async () => {
    const repository = {
      create: vi.fn(),
      findByPk: vi.fn(),
      findAndCountAll: vi.fn(async (options: Record<string, unknown>) => ({ rows: [mockUploadedAsset({})], count: 1, options }))
    };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository });

    const result = await service.listMediaAssets({});

    expect(repository.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 24, offset: 0, where: expect.objectContaining({ status: 'active' }) }));
    expect(result.pagination).toMatchObject({ page: 1, limit: 24, total_items: 1, total_pages: 1, has_next_page: false });
    expect(result.items[0]).toMatchObject({ id: '99', original_file_name: 'my image.jpg', original_url: expect.stringContaining('https://media.example.com') });
    expect(JSON.stringify(result.items[0])).not.toContain('original_object_key');
    expect(JSON.stringify(result.items[0])).not.toContain('bucket_name');
  });

  it('enforces maximum media list page size and builds search filters safely', async () => {
    const repository = {
      create: vi.fn(),
      findByPk: vi.fn(),
      findAndCountAll: vi.fn(async () => ({ rows: [], count: 0 }))
    };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository });

    const result = await service.listMediaAssets({ page: '2', limit: '500', search: 'hero_%', purpose: 'hero', sort_by: 'created_at', sort_order: 'asc' });

    expect(result.pagination.limit).toBe(100);
    expect(repository.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ offset: 100, order: [['createdAt', 'ASC']] }));
  });

  it('rejects unsafe media sort fields', async () => {
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository: { create: vi.fn(), findByPk: vi.fn(), findAndCountAll: vi.fn() } });

    await expect(service.listMediaAssets({ sort_by: '1;drop table' })).rejects.toThrow();
  });

  it('returns one media asset by id', async () => {
    const repository = { create: vi.fn(), findByPk: vi.fn(async () => mockUploadedAsset({})) };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository });

    await expect(service.getMediaAsset('99')).resolves.toMatchObject({ id: '99', status: 'active' });
  });

  it('rejects invalid media ids and deleted detail records', async () => {
    const repository = { create: vi.fn(), findByPk: vi.fn(async () => mockUploadedAsset({ status: 'deleted', deletedAt: new Date() })) };
    const { createMediaService } = await import('../src/modules/media/media.service.js');
    const service = createMediaService({ repository });

    await expect(service.getMediaAsset('abc')).rejects.toThrow('Media asset ID is invalid');
    await expect(service.getMediaAsset('99')).rejects.toThrow('Media asset was not found');
  });
});

describe('media delete role policy', () => {
  it('allows authors to delete their own uploads and blocks other author deletes', async () => {
    const ownAsset = mockMutableAsset({ uploadedBy: '7' });
    const otherAsset = mockMutableAsset({ uploadedBy: '8' });
    const deleteObjects = vi.fn(async () => undefined);
    const { createMediaService } = await import('../src/modules/media/media.service.js');

    await expect(createMediaService({ repository: { create: vi.fn(), findByPk: vi.fn(async () => ownAsset) }, deleteObjects }).softDeleteMediaAsset('99', { id: '7', role: 'author' })).resolves.toMatchObject({ status: 'trashed' });
    await expect(createMediaService({ repository: { create: vi.fn(), findByPk: vi.fn(async () => otherAsset) }, deleteObjects }).softDeleteMediaAsset('99', { id: '7', role: 'author' })).rejects.toThrow('Insufficient permissions');
  });

  it('blocks viewer deletes at the route layer', async () => {
    vi.spyOn(AdminUser, 'findByPk').mockResolvedValue({ id: '1', role: 'viewer', status: 'active' } as never);
    vi.spyOn(AdminSession, 'findByPk').mockResolvedValue({ id: '10', adminUserId: '1', revokedAt: null, expiresAt: new Date(Date.now() + 100000) } as never);
    const token = signAccessToken({ sub: '1', role: 'viewer', session_id: '10', token_type: 'access' });

    const response = await request(createApp(async () => undefined, 10_000)).delete('/api/v1/media/assets/99').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});











