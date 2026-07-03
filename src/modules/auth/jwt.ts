import { createHmac, timingSafeEqual } from 'node:crypto';

export type AuthTokenPayload = {
  sub: string;
  activeStoreId: string;
  iat: number;
  exp: number;
};

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signData(data: string, secret: string) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function getJwtSecret() {
  return process.env.JWT_SECRET ?? process.env.AUTH_JWT_SECRET ?? 'ai-pos-local-dev-secret';
}

export function signAuthToken(input: { userId: string; activeStoreId: string; expiresInSeconds?: number }) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthTokenPayload = {
    sub: input.userId,
    activeStoreId: input.activeStoreId,
    iat: now,
    exp: now + (input.expiresInSeconds ?? 60 * 60 * 24 * 7),
  };
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlJson(payload);
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${signData(unsigned, getJwtSecret())}`;
}

export function verifyAuthToken(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, body, signature] = parts;
  const expected = signData(`${header}.${body}`, getJwtSecret());
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AuthTokenPayload;
    if (!payload.sub || !payload.activeStoreId || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
