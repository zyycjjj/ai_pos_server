import { Injectable } from '@nestjs/common';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const ITERATIONS = 120_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

@Injectable()
export class ManagerPinService {
  hashPin(pin: string) {
    const salt = randomBytes(16).toString('base64url');
    const hash = pbkdf2Sync(pin, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url');
    return { hash, salt };
  }

  verifyPin(pin: string, salt?: string | null, storedHash?: string | null) {
    if (!salt || !storedHash) return false;
    const actual = Buffer.from(pbkdf2Sync(pin, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url'));
    const expected = Buffer.from(storedHash);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
