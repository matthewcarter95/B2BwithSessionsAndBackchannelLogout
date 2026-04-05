import jwt from 'jsonwebtoken';
import jwksClient, { SigningKey } from 'jwks-rsa';
import { config } from '../config';
import { LogoutTokenPayload, DecodedToken } from '../types';

// JWKS client for fetching Auth0 public keys
const client = jwksClient({
  jwksUri: `https://${config.auth0.domain}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 24 * 60 * 60 * 1000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

// Cache for signing keys
const keyCache = new Map<string, string>();

/**
 * Get signing key from JWKS endpoint
 */
async function getSigningKey(kid: string): Promise<string> {
  // Check cache first
  if (keyCache.has(kid)) {
    return keyCache.get(kid)!;
  }

  try {
    const key: SigningKey = await client.getSigningKey(kid);
    const publicKey = key.getPublicKey();

    // Cache the key
    keyCache.set(kid, publicKey);

    return publicKey;
  } catch (error) {
    console.error('Failed to fetch signing key:', error);
    throw new Error('Failed to fetch JWKS signing key');
  }
}

/**
 * Decode JWT without verification (to get header)
 */
function decodeToken(token: string): DecodedToken {
  try {
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded || typeof decoded === 'string') {
      throw new Error('Invalid token format');
    }

    return decoded as unknown as DecodedToken;
  } catch (error) {
    throw new Error('Failed to decode token');
  }
}

/**
 * Get all possible issuer values
 * Includes both Auth0 domain and custom domain, with and without trailing slash
 */
function getPossibleIssuers(): [string, ...string[]] {
  const customDomain = process.env.AUTH0_CUSTOM_DOMAIN || 'adp-auth.demo-connect.us';

  return [
    `https://${config.auth0.domain}/`,
    `https://${config.auth0.domain}`,
    `https://${customDomain}/`,
    `https://${customDomain}`
  ];
}

/**
 * Verify JWT signature and validate claims
 */
async function verifyToken(
  token: string,
  publicKey: string
): Promise<LogoutTokenPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      publicKey,
      {
        algorithms: ['RS256'],
        issuer: getPossibleIssuers(),
        audience: config.auth0.clientId,
      },
      (err, decoded) => {
        if (err) {
          return reject(err);
        }

        resolve(decoded as LogoutTokenPayload);
      }
    );
  });
}

/**
 * Validate logout token claims
 */
function validateLogoutTokenClaims(payload: LogoutTokenPayload): void {
  // Check required claims exist
  if (!payload.iss) {
    throw new Error('Missing iss claim');
  }

  if (!payload.aud) {
    throw new Error('Missing aud claim');
  }

  if (!payload.exp) {
    throw new Error('Missing exp claim');
  }

  if (!payload.events) {
    throw new Error('Missing events claim');
  }

  // Debug: Log the events claim structure
  console.log('🔍 Events claim structure:', JSON.stringify(payload.events, null, 2));

  // Validate issuer - accept multiple possible formats
  const possibleIssuers = getPossibleIssuers();
  if (!possibleIssuers.includes(payload.iss)) {
    throw new Error(`Invalid issuer. Expected one of [${possibleIssuers.join(', ')}], got ${payload.iss}`);
  }

  // Validate audience
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(config.auth0.clientId)) {
    throw new Error('Invalid audience');
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('Token expired');
  }

  // Check issued at (should be in the past)
  if (payload.iat > now + 60) {
    // Allow 60 second clock skew
    throw new Error('Token issued in the future');
  }

  // Validate events claim structure - Auth0 uses the correct OIDC event type URI
  const backchannelEvent =
    payload.events['http://schemas.openid.net/event/backchannel-logout'] ||
    payload.events['http://openid.net/specs/openid-connect-backchannel-1_0.html#event'];

  if (!backchannelEvent) {
    const eventKeys = Object.keys(payload.events);
    throw new Error(`Missing backchannel logout event in events claim. Found keys: ${eventKeys.join(', ')}`);
  }
}

/**
 * Extract session ID (sid) from logout token
 */
export function extractSid(payload: LogoutTokenPayload): string {
  // Try the correct OIDC event type first, then fall back to the spec URL
  const backchannelEvent =
    payload.events['http://schemas.openid.net/event/backchannel-logout'] ||
    payload.events['http://openid.net/specs/openid-connect-backchannel-1_0.html#event'];

  if (!backchannelEvent) {
    throw new Error('Missing backchannel logout event in events claim');
  }

  // The sid can be in the event object or directly in the payload
  const sid = backchannelEvent.sid || payload.sid;

  if (!sid) {
    throw new Error('Missing sid in backchannel logout event or token payload');
  }

  return sid;
}

/**
 * Main function: Validate logout token and extract sid
 */
export async function validateLogoutToken(token: string): Promise<{
  payload: LogoutTokenPayload;
  sid: string;
}> {
  try {
    // Step 1: Decode token to get header (kid)
    const decoded = decodeToken(token);

    if (!decoded.header.kid) {
      throw new Error('Missing kid in token header');
    }

    // Step 2: Get signing key from JWKS
    const publicKey = await getSigningKey(decoded.header.kid);

    // Step 3: Verify token signature and claims
    const payload = await verifyToken(token, publicKey);

    // Step 4: Validate logout token specific claims
    validateLogoutTokenClaims(payload);

    // Step 5: Extract sid
    const sid = extractSid(payload);

    console.log('✅ Token validation successful', {
      sub: payload.sub,
      sid,
      iat: new Date(payload.iat * 1000).toISOString(),
      exp: new Date(payload.exp * 1000).toISOString(),
    });

    return { payload, sid };
  } catch (error) {
    console.error('❌ Token validation failed:', error);

    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error(`Invalid token: ${error.message}`);
    } else {
      throw error;
    }
  }
}

/**
 * Clear JWKS cache (useful for testing or key rotation)
 */
export function clearKeyCache(): void {
  keyCache.clear();
  console.log('🔄 JWKS key cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: keyCache.size,
    keys: Array.from(keyCache.keys()),
  };
}
