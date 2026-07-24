import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const scryptParams = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const versionedPrefix = 'scrypt$v1';

interface ParsedScryptHash {
  salt: string;
  derived: string;
  keyLength: number;
  N: number;
  r: number;
  p: number;
}

function parseVersionedHash(storedHash: string): ParsedScryptHash | null {
  const [algorithm, version, params, salt, derived] = storedHash.split('$');
  if (algorithm !== 'scrypt' || version !== 'v1' || !params || !salt || !derived) return null;
  const parsedParams = Object.fromEntries(params.split(',').map((item) => item.split('=')));
  return {
    salt,
    derived,
    keyLength: Number(parsedParams.keylen),
    N: Number(parsedParams.N),
    r: Number(parsedParams.r),
    p: Number(parsedParams.p)
  };
}

function parseLegacyHash(storedHash: string): ParsedScryptHash | null {
  const [algorithm, salt, derived] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !derived) return null;
  return { salt, derived, keyLength, N: scryptParams.N, r: scryptParams.r, p: scryptParams.p };
}

async function derive(password: string, salt: string, options: Omit<ParsedScryptHash, 'salt' | 'derived'>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, options.keyLength, {
      N: options.N,
      r: options.r,
      p: options.p,
      maxmem: scryptParams.maxmem
    }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await derive(password, salt, { N: scryptParams.N, r: scryptParams.r, p: scryptParams.p, keyLength });
  return `${versionedPrefix}$N=${scryptParams.N},r=${scryptParams.r},p=${scryptParams.p},keylen=${keyLength}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parsed = parseVersionedHash(storedHash) ?? parseLegacyHash(storedHash);
  if (!parsed || !Number.isFinite(parsed.keyLength) || parsed.keyLength <= 0) return false;

  const expected = Buffer.from(parsed.derived, 'hex');
  const actual = await derive(password, parsed.salt, parsed);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
