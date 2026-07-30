import { createHmac, timingSafeEqual } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret';

export interface JwtPayload {
   sub: string;
   iat: number;
   exp: number;
   [key: string]: unknown;
}

function base64UrlEncode(input: string): string {
   return Buffer.from(input, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
   const padded = input.replace(/-/g, '+').replace(/_/g, '/');
   const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
   return Buffer.from(padded + padding, 'base64').toString('utf8');
}

function sign(data: string): string {
   return createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
}

/**
 * Signs a minimal HMAC-SHA256 JWT-style token. Not a full JWT implementation
 * (no header alg negotiation), but structurally compatible: header.payload.signature.
 */
export function signJwt(
   payload: { sub: string; [key: string]: unknown },
   expiresInSeconds: number
): string {
   const now = Math.floor(Date.now() / 1000);
   const fullPayload: JwtPayload = {
      ...payload,
      sub: payload.sub,
      iat: now,
      exp: now + expiresInSeconds,
   };

   const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
   const body = base64UrlEncode(JSON.stringify(fullPayload));
   const signature = sign(`${header}.${body}`);

   return `${header}.${body}.${signature}`;
}

export class JwtError extends Error {
   code: 'malformed' | 'invalid_signature';

   constructor(code: 'malformed' | 'invalid_signature', message: string) {
      super(message);
      this.name = 'JwtError';
      this.code = code;
   }
}

/**
 * Decodes and verifies the signature of a token WITHOUT checking expiry.
 * Callers that need to distinguish "expired" from "not yet due for refresh"
 * must check `exp` against the current time themselves.
 *
 * @throws {JwtError} when the token is malformed or the signature is invalid
 */
export function decodeJwt(token: string): JwtPayload {
   const parts = token.split('.');
   if (parts.length !== 3) {
      throw new JwtError('malformed', 'Token must have three segments');
   }

   const [header, body, signature] = parts;

   const expectedSignature = sign(`${header}.${body}`);
   const providedSigBuf = Buffer.from(signature);
   const expectedSigBuf = Buffer.from(expectedSignature);

   const signaturesMatch =
      providedSigBuf.length === expectedSigBuf.length &&
      timingSafeEqual(providedSigBuf, expectedSigBuf);

   if (!signaturesMatch) {
      throw new JwtError('invalid_signature', 'Token signature is invalid');
   }

   try {
      return JSON.parse(base64UrlDecode(body)) as JwtPayload;
   } catch {
      throw new JwtError('malformed', 'Token payload is not valid JSON');
   }
}
