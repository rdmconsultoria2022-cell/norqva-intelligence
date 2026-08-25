import crypto from 'crypto';
import https from 'https';

const JWT_SECRET = process.env.JWT_SECRET || 'norqva-super-secret-token-key-2026';
const JWKS_URL = process.env.SUPABASE_JWKS_URL;

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

    const isMockToken = header.alg === 'HS256';

    // Validate Issuer
    if (!isMockToken) {
      let expectedIssuer = process.env.SUPABASE_ISSUER;
      if (expectedIssuer === 'undefined') expectedIssuer = undefined;
      
      if (!expectedIssuer) {
        const jwks = process.env.SUPABASE_JWKS_URL;
        if (jwks && jwks !== 'undefined') {
          try {
            const jwksUrl = new URL(jwks);
            expectedIssuer = `${jwksUrl.protocol}//${jwksUrl.host}/auth/v1`;
          } catch (e) {
            expectedIssuer = undefined;
          }
        }
      }

      if (expectedIssuer) {
        const isAllowedMockIssuer = process.env.NODE_ENV === 'test' && payload.iss === 'supabase';
        if (payload.iss !== expectedIssuer && !isAllowedMockIssuer) {
          console.warn(`[JWT VALIDATION ERROR]: ISSUER_INVALID (got: ${payload.iss}, expected: ${expectedIssuer})`);
          return null;
        }
      }
    }

    // Validate Audience
    if (!isMockToken) {
      const expectedAudience = process.env.SUPABASE_AUDIENCE || 'authenticated';
      if (expectedAudience && payload.aud !== expectedAudience) {
        console.warn('[JWT VALIDATION ERROR]: AUDIENCE_INVALID');
        return null;
      }
    }

    // Validate Subject
    if (!payload.sub) {
      console.warn('[JWT VALIDATION ERROR]: SUB_INVALID');
      return null;
    }

    const jwksUrl = process.env.SUPABASE_JWKS_URL;
    const SUPPORTED_ALGORITHMS = ['RS256', 'ES256'];

    if (jwksUrl && SUPPORTED_ALGORITHMS.includes(header.alg)) {
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
    } else {
      if (jwksUrl && header.alg !== 'HS256') {
        console.warn('[JWT VALIDATION ERROR]: TOKEN_ALGORITHM_REJECTED');
        return null;
      }

      if (header.alg !== 'HS256') {
        console.warn('[JWT VALIDATION ERROR]: TOKEN_ALGORITHM_REJECTED');
        return null;
      }

      const expectedSignature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${headerBase64}.${payloadBase64}`)
        .digest('base64url');

      if (signature !== expectedSignature) {
        console.warn('[JWT VALIDATION ERROR]: SIGNATURE_INVALID');
        return null;
      }
      return payload;
    }
  } catch (err) {
    console.warn('[JWT VALIDATION ERROR]: SIGNATURE_INVALID');
    return null;
  }
}

export function signSupabaseToken(payload: any, expiresInSeconds: number = 3600): string {
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
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerBase64}.${payloadBase64}`)
    .digest('base64url');
    
  return `${headerBase64}.${payloadBase64}.${signature}`;
}
