import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

export const newSessionToken = () => randomBytes(32).toString('hex');

/** Only the hash is stored, so a database leak does not expose live sessions. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const makeRef = (prefix: string) => {
  const bytes = randomBytes(6);
  return `${prefix}-${Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('')}`;
};
