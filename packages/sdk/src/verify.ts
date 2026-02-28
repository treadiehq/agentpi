import * as jose from 'jose';
import { Claim, InvalidGrantError } from '@agentpi/shared';

let jwksCache: jose.JSONWebKeySet | null = null;
let jwksCacheTime = 0;
const CACHE_TTL = 60_000;

export interface VerifiedGrant {
  sub: string;
  jti: string;
  exp: number;
  agentpi: Claim;
}

export async function verifyConnectGrant(
  token: string,
  jwksUrl: string,
  expectedIssuer: string,
  expectedAudience: string,
): Promise<VerifiedGrant> {
  const now = Date.now();
  if (!jwksCache || now - jwksCacheTime > CACHE_TTL) {
    let res: Response;
    try {
      res = await fetch(jwksUrl);
    } catch (err) {
      throw new InvalidGrantError(
        `JWKS unreachable at ${jwksUrl}`,
        { jwks_url: jwksUrl, reason: String(err) },
      );
    }
    if (!res.ok) {
      throw new InvalidGrantError(
        `JWKS fetch failed — ${res.status} from ${jwksUrl}`,
        { jwks_url: jwksUrl, status: res.status },
      );
    }
    jwksCache = (await res.json()) as jose.JSONWebKeySet;
    jwksCacheTime = now;
  }

  const JWKS = jose.createLocalJWKSet(jwksCache);

  let payload: jose.JWTPayload;
  try {
    const result = await jose.jwtVerify(token, JWKS, {
      issuer: expectedIssuer,
      audience: expectedAudience,
    });
    payload = result.payload;
  } catch (err) {
    if (err instanceof jose.errors.JWTExpired) {
      throw new InvalidGrantError(
        `Connect grant expired at ${new Date((err.payload?.exp ?? 0) * 1000).toISOString()}`,
        { reason: 'expired', exp: err.payload?.exp },
      );
    }
    if (err instanceof jose.errors.JWTClaimValidationFailed) {
      const claim = err.claim;
      if (claim === 'aud') {
        throw new InvalidGrantError(
          `aud mismatch — expected ${expectedAudience}, got ${err.payload?.aud}`,
          { reason: 'aud_mismatch', expected: expectedAudience, got: err.payload?.aud },
        );
      }
      if (claim === 'iss') {
        throw new InvalidGrantError(
          `iss mismatch — expected ${expectedIssuer}, got ${err.payload?.iss}`,
          { reason: 'iss_mismatch', expected: expectedIssuer, got: err.payload?.iss },
        );
      }
      throw new InvalidGrantError(
        `JWT claim validation failed: ${err.message}`,
        { reason: 'claim_validation', claim },
      );
    }
    if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
      throw new InvalidGrantError(
        'JWT signature verification failed — key mismatch or tampered token',
        { reason: 'bad_signature' },
      );
    }
    throw new InvalidGrantError(
      `JWT verification failed: ${err instanceof Error ? err.message : String(err)}`,
      { reason: 'verification_error' },
    );
  }

  const p = payload as Record<string, unknown>;

  if (!p.jti) {
    throw new InvalidGrantError(
      'Missing required JWT claim: jti',
      { reason: 'missing_claim', claim: 'jti' },
    );
  }
  if (!p.sub) {
    throw new InvalidGrantError(
      'Missing required JWT claim: sub',
      { reason: 'missing_claim', claim: 'sub' },
    );
  }
  if (!p.agentpi) {
    throw new InvalidGrantError(
      'Missing required JWT claim: agentpi',
      { reason: 'missing_claim', claim: 'agentpi' },
    );
  }

  return {
    sub: p.sub as string,
    jti: p.jti as string,
    exp: p.exp as number,
    agentpi: p.agentpi as Claim,
  };
}
