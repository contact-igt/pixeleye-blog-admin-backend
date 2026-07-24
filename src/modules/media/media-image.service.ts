import sharp, { type FitEnum, type Metadata } from 'sharp';
import { ApiError } from '../../utils/api-error.js';
import type { R2VariantName } from '../../services/integrations/cloudflare.service.js';

export interface ProcessedImageVariant {
  name: R2VariantName;
  buffer: Buffer;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  mimeType: 'image/webp';
}

export interface ProcessedImageSet {
  source: {
    width: number | null;
    height: number | null;
    format: string | undefined;
    pages: number | undefined;
  };
  variants: ProcessedImageVariant[];
}

interface VariantDefinition {
  name: R2VariantName;
  width?: number;
  height?: number;
  fit?: keyof FitEnum;
  withoutEnlargement?: boolean;
}

const variantDefinitions: VariantDefinition[] = [
  { name: 'original', width: 2400, fit: 'inside', withoutEnlargement: true },
  { name: 'thumbnail', width: 200, height: 200, fit: 'cover' },
  { name: 'card', width: 600, height: 400, fit: 'cover' },
  { name: 'content', width: 1200, fit: 'inside', withoutEnlargement: true },
  { name: 'hero', width: 1600, height: 900, fit: 'cover' },
  { name: 'avatar', width: 300, height: 300, fit: 'cover' }
];

async function decodeMetadata(buffer: Buffer): Promise<Metadata> {
  try {
    return await sharp(buffer, { animated: false }).metadata();
  } catch (error) {
    throw new ApiError(415, 'Image could not be decoded', undefined, error);
  }
}

function assertSupportedImage(metadata: Metadata): void {
  if (!metadata.width || !metadata.height) throw new ApiError(415, 'Image dimensions could not be detected');
  if (metadata.pages && metadata.pages > 1) throw new ApiError(415, 'Animated images are not supported');
}

async function buildVariant(buffer: Buffer, definition: VariantDefinition): Promise<ProcessedImageVariant> {
  let pipeline = sharp(buffer, { animated: false }).rotate();
  if (definition.width || definition.height) {
    pipeline = pipeline.resize({
      width: definition.width,
      height: definition.height,
      fit: definition.fit,
      withoutEnlargement: definition.withoutEnlargement
    });
  }

  const outputBuffer = await pipeline.webp({ quality: 85 }).toBuffer();
  const metadata = await sharp(outputBuffer).metadata();
  return {
    name: definition.name,
    buffer: outputBuffer,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    sizeBytes: outputBuffer.byteLength,
    mimeType: 'image/webp'
  };
}

export async function processMediaImage(buffer: Buffer): Promise<ProcessedImageSet> {
  const metadata = await decodeMetadata(buffer);
  assertSupportedImage(metadata);
  const variants = await Promise.all(variantDefinitions.map((definition) => buildVariant(buffer, definition)));
  return {
    source: {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      format: metadata.format,
      pages: metadata.pages
    },
    variants
  };
}

