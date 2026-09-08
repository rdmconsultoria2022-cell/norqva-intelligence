import crypto from 'crypto';
import https from 'https';

// Simple cache for JWKS keys
let jwksCache: any = null;
let lastJwksFetch = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function fetchJWKS(url: string): Promise<any> {
  if (process.env.NODE_ENV !== 'test' && jwksCache && Date.now() - lastJwksFetch < CACHE_TTL_MS) {
    return jwksCache;
  }

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          jwksCache = parsed;
          lastJwksFetch = Date.now();
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Convert JWK to PEM format
function jwkToPem(jwk: any): string {
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return key.export({ type: 'spki', format: 'pem' }) as string;
  } catch (err) {
    console.error('Failed to parse JWK to Public Key:', err);
    throw err;
  }
}

export async function verifySupabaseToken(token: string): Promise<any> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('[JWT VALIDATION ERROR]: SIGNATURE_INVALID');
      return null;
    }

    const [headerBase64, payloadBase64, signature] = parts;
    const header = JSON.parse(Buffer.from(headerBase64, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));

    // Check expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      console.warn('[JWT VALIDATION ERROR]: TOKEN_EXPIRED');
      return null;
    }

    // Validate Subject
    if (!payload.sub || typeof payload.sub !== 'string') {
      console.warn('[JWT VALIDATION ERROR]: SUB_INVALID');
      return null;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const authMode = process.env.AUTH_MODE || 'demo';
    const isRealAuth = isProduction || authMode === 'real';

    // REAL / PRODUCTION AUTH POLICY:
    // Strictly require Supabase JWKS asymmetric verification (RS256 / ES256).
    // HS256 and hardcoded/fallback symmetric signing are strictly rejected.
    if (isRealAuth) {
      const SUPPORTED_ASYMMETRIC_ALGORITHMS = ['RS256', 'ES256'];
      if (!SUPPORTED_ASYMMETRIC_ALGORITHMS.includes(header.alg)) {
        console.warn(`[JWT VALIDATION ERROR]: TOKEN_ALGORITHM_REJECTED (Algorithm '${header.alg}' rejected in real/production auth mode)`);
        return null;
      }

      const jwksUrl = process.env.SUPABASE_JWKS_URL;
      if (!jwksUrl || jwksUrl === 'undefined') {
        console.warn('[JWT VALIDATION ERROR]: FAIL_CLOSED (SUPABASE_JWKS_URL is required in real/production auth mode)');
        return null;
      }

      // Validate Issuer
      const rawIssuer = process.env.SUPABASE_ISSUER;
      let expectedIssuer = (!rawIssuer || rawIssuer === 'undefined') ? undefined : rawIssuer;
      if (!expectedIssuer) {
        try {
          const parsedJwksUrl = new URL(jwksUrl);
          expectedIssuer = `${parsedJwksUrl.protocol}//${parsedJwksUrl.host}/auth/v1`;
        } catch (e) {
          expectedIssuer = undefined;
        }
      }

      if (expectedIssuer && payload.iss !== expectedIssuer) {
        console.warn(`[JWT VALIDATION ERROR]: ISSUER_INVALID (got: ${payload.iss}, expected: ${expectedIssuer})`);
        return null;
      }

      // Validate Audience
      const rawAudience = process.env.SUPABASE_AUDIENCE;
      const expectedAudience = (!rawAudience || rawAudience === 'undefined') ? 'authenticated' : rawAudience;
      if (expectedAudience && payload.aud !== expectedAudience) {
        console.warn(`[JWT VALIDATION ERROR]: AUDIENCE_INVALID (got: ${payload.aud}, expected: ${expectedAudience})`);
        return null;
      }

      // Verify asymmetric signature with JWKS public key
      const jwks = await fetchJWKS(jwksUrl);
      const key = jwks.keys.find((k: any) => k.kid === header.kid);
      if (!key) {
        console.warn('[JWT VALIDATION ERROR]: KID_NOT_FOUND');
        return null;
      }

      // Cross check key type against algorithm
      if (header.alg === 'RS256' && key.kty !== 'RSA') {
        console.warn('[JWT VALIDATION ERROR]: TOKEN_ALGORITHM_REJECTED');
        return null;
      }
      if (header.alg === 'ES256' && key.kty !== 'EC') {
        console.warn('[JWT VALIDATION ERROR]: TOKEN_ALGORITHM_REJECTED');
        return null;
      }

      const publicKeyPem = jwkToPem(key);
      const verify = crypto.createVerify('SHA256');
      verify.update(`${headerBase64}.${payloadBase64}`);
      
      const verifyKey = header.alg === 'ES256'
        ? { key: publicKeyPem, dsaEncoding: 'ieee-p1363' } as any
        : publicKeyPem;

      const isValid = verify.verify(verifyKey, signature, 'base64url');
      if (!isValid) {
        console.warn('[JWT VALIDATION ERROR]: SIGNATURE_INVALID');
        return null;
      }

      return payload;
    }

    // NON-PRODUCTION / DEMO / TEST AUTH MODE:
    // Only reachable when NOT in production and AUTH_MODE !== 'real'
    if (header.alg === 'HS256') {
      const testSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'norqva-isolated-test-secret-only' : undefined);
      if (!testSecret) {
        console.warn('[JWT VALIDATION ERROR]: FAIL_CLOSED (No test JWT secret configured for HS256)');
        return null;
      }

      const expectedSignature = crypto
        .createHmac('sha256', testSecret)
        .update(`${headerBase64}.${payloadBase64}`)
        .digest('base64url');

      if (signature !== expectedSignature) {
        console.warn('[JWT VALIDATION ERROR]: SIGNATURE_INVALID');
        return null;
      }
      return payload;
    }

    // Fallback: If JWKS is configured even in demo/test mode and RS256/ES256 is used
    const jwksUrl = process.env.SUPABASE_JWKS_URL;
    if (jwksUrl && ['RS256', 'ES256'].includes(header.alg)) {
      const jwks = await fetchJWKS(jwksUrl);
      const key = jwks.keys.find((k: any) => k.kid === header.kid);
      if (!key) {
        console.warn('[JWT VALIDATION ERROR]: KID_NOT_FOUND');
        return null;
      }
      const publicKeyPem = jwkToPem(key);
      const verify = crypto.createVerify('SHA256');
      verify.update(`${headerBase64}.${payloadBase64}`);
      const verifyKey = header.alg === 'ES256'
        ? { key: publicKeyPem, dsaEncoding: 'ieee-p1363' } as any
        : publicKeyPem;
      const isValid = verify.verify(verifyKey, signature, 'base64url');
      if (!isValid) {
        console.warn('[JWT VALIDATION ERROR]: SIGNATURE_INVALID');
        return null;
      }
      return payload;
    }

    console.warn('[JWT VALIDATION ERROR]: TOKEN_ALGORITHM_REJECTED');
    return null;
  } catch (err) {
    console.warn('[JWT VALIDATION ERROR]: SIGNATURE_INVALID');
    return null;
  }
}

export function signSupabaseToken(payload: any, expiresInSeconds: number = 3600): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[SECURITY EXCEPTION]: signSupabaseToken is strictly prohibited in production.');
  }

  const testSecret = process.env.JWT_SECRET || 'norqva-isolated-test-secret-only';
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { 
    ...payload, 
    exp,
    iss: 'supabase',
    aud: 'authenticated'
  };
  
  const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadBase64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', testSecret)
    .update(`${headerBase64}.${payloadBase64}`)
    .digest('base64url');
    
  return `${headerBase64}.${payloadBase64}.${signature}`;
}
