import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const ITERATIONS = 120_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url');
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [scheme, iterationsValue, salt, storedHash] = passwordHash.split('$');
  if (scheme !== 'pbkdf2' || !iterationsValue || !salt || !storedHash) {
    return false;
  }

  const iterations = Number(iterationsValue);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const actual = Buffer.from(pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('base64url'));
  const expected = Buffer.from(storedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
