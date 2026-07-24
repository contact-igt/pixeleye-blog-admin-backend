import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/environment.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/api-error.js';

const R2_TIMEOUT_MS = 15_000;
function hasUnsafeObjectKeyCharacter(key: string): boolean {
  return [...key].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}
const R2_CONTENT_TYPE = 'image/webp';
const R2_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export type R2VariantName = 'original' | 'thumbnail' | 'card' | 'content' | 'hero' | 'avatar';

export interface R2ObjectUploadInput {
  key: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface R2ObjectUploadResult {
  key: string;
  bucket: string;
  url: string;
  contentType: string;
  cacheControl: string;
  etag?: string;
}

export interface R2Configuration {
  configured: boolean;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region: string;
  endpoint: string;
  publicBaseUrl: string;
  objectPrefix: string;
  maxFileSizeMb: number;
  allowedImageTypes: string[];
}

function cleanPrefix(prefix: string): string {
  return prefix.trim().replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}

function buildDefaultEndpoint(accountId: string): string {
  return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '';
}

export function getR2Configuration(): R2Configuration {
  const endpoint = env.R2_ENDPOINT || buildDefaultEndpoint(env.CLOUDFLARE_ACCOUNT_ID);
  const allowedImageTypes = env.R2_ALLOWED_IMAGE_TYPES.split(',').map((type) => type.trim()).filter(Boolean);

  return {
    configured: Boolean(
      env.CLOUDFLARE_ACCOUNT_ID &&
        env.R2_ACCESS_KEY_ID &&
        env.R2_SECRET_ACCESS_KEY &&
        env.R2_BUCKET_NAME &&
        endpoint &&
        env.R2_PUBLIC_BASE_URL
    ),
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
    region: env.R2_REGION,
    endpoint,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL,
    objectPrefix: cleanPrefix(env.R2_OBJECT_PREFIX),
    maxFileSizeMb: env.R2_MAX_FILE_SIZE_MB,
    allowedImageTypes
  };
}

function assertR2Configuration(): R2Configuration {
  const config = getR2Configuration();
  if (!config.configured) throw new ApiError(503, 'Cloudflare R2 configuration is incomplete');
  if (config.allowedImageTypes.length === 0) throw new ApiError(503, 'Cloudflare R2 allowed image types are not configured');
  return config;
}

function encodeObjectKeyForUrl(objectKey: string): string {
  return objectKey.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}
function assertR2ObjectKey(key: string): void {
  if (!key || key.startsWith('/') || key.endsWith('/') || key.includes('..') || hasUnsafeObjectKeyCharacter(key)) {
    throw new ApiError(400, 'R2 object key is invalid');
  }
}

function getAbortSignal(): AbortSignal {
  return AbortSignal.timeout(R2_TIMEOUT_MS);
}

export function createR2Client(config: R2Configuration = assertR2Configuration()): S3Client {
  const clientConfig: S3ClientConfig = {
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  };
  return new S3Client(clientConfig);
}

export function generateR2ObjectKey(mediaId: string = randomUUID(), variant: R2VariantName = 'original'): string {
  if (!/^[a-f0-9-]{36}$/i.test(mediaId)) throw new ApiError(400, 'Media object ID is invalid');
  const config = getR2Configuration();
  const prefix = cleanPrefix(config.objectPrefix || 'pixel-eye-blog');
  return `${prefix}/media/${mediaId}/${variant}.webp`;
}

export function buildR2PublicUrl(objectKey: string): string {
  assertR2ObjectKey(objectKey);
  const config = assertR2Configuration();
  return `${config.publicBaseUrl.replace(/\/+$/, '')}/${encodeObjectKeyForUrl(objectKey)}`;
}

export async function uploadR2Object(
  input: R2ObjectUploadInput,
  client: S3Client = createR2Client()
): Promise<R2ObjectUploadResult> {
  const config = assertR2Configuration();
  assertR2ObjectKey(input.key);

  try {
    const result = await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType ?? R2_CONTENT_TYPE,
        CacheControl: R2_CACHE_CONTROL,
        Metadata: input.metadata
      }),
      { abortSignal: getAbortSignal() }
    );

    return {
      key: input.key,
      bucket: config.bucketName,
      url: buildR2PublicUrl(input.key),
      contentType: input.contentType ?? R2_CONTENT_TYPE,
      cacheControl: R2_CACHE_CONTROL,
      etag: result.ETag
    };
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'TimeoutError' ? 'Cloudflare R2 upload timed out' : 'Cloudflare R2 upload failed';
    throw new ApiError(502, message, undefined, error);
  }
}

export async function deleteR2Object(key: string, client: S3Client = createR2Client()): Promise<void> {
  const config = assertR2Configuration();
  assertR2ObjectKey(key);

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: key
      }),
      { abortSignal: getAbortSignal() }
    );
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'TimeoutError' ? 'Cloudflare R2 delete timed out' : 'Cloudflare R2 delete failed';
    throw new ApiError(502, message, undefined, error);
  }
}

export async function deleteR2Objects(keys: string[], client: S3Client = createR2Client()): Promise<void> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  for (const key of uniqueKeys) {
    await deleteR2Object(key, client);
  }
}


export async function headR2Object(key: string, client: S3Client = createR2Client()): Promise<void> {
  const config = assertR2Configuration();
  assertR2ObjectKey(key);

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.bucketName,
        Key: key
      }),
      { abortSignal: getAbortSignal() }
    );
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'TimeoutError' ? 'Cloudflare R2 object check timed out' : 'Cloudflare R2 object is unavailable';
    throw new ApiError(502, message, undefined, error);
  }
}

export async function verifyR2ObjectsExist(keys: string[], client: S3Client = createR2Client()): Promise<void> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  for (const key of uniqueKeys) {
    await headR2Object(key, client);
  }
}
export async function verifyR2Connection(client: S3Client = createR2Client()): Promise<void> {
  const config = assertR2Configuration();

  try {
    await client.send(
      new HeadBucketCommand({ Bucket: config.bucketName }),
      { abortSignal: getAbortSignal() }
    );
  } catch (error) {
    logger.debug({ err: error }, 'Cloudflare R2 verification request failed');
    throw new Error('Cloudflare R2 verification failed', { cause: error });
  }
}








