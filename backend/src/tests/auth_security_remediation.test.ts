import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import https from 'https';
import app from '../index';
import { initializeDB, verifyTestDbSafety } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { verifySupabaseToken } from '../utils/token';

let pool: Pool;
let rsaKeyPair: crypto.KeyPairSyncResult<string, string>;
let ecKeyPair: crypto.KeyPairSyncResult<string, string>;
let testUserAuthId: string;
let testUserEmail: string;

beforeAll(async () => {
  pool = initializeDB();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DESTRUCTIVE_TESTS = 'true';
  verifyTestDbSafety();

  const client = await pool.connect();
  try {
    await client.query('DROP TABLE IF EXISTS performance_entries CASCADE;');
    await client.query('DROP TABLE IF EXISTS capital_authorizations CASCADE;');
    await client.query('DROP TABLE IF EXISTS decisions CASCADE;');
    await client.query('DROP TABLE IF EXISTS audit_logs CASCADE;');
    await client.query('DROP TABLE IF EXISTS experiment_creatives CASCADE;');
    await client.query('DROP TABLE IF EXISTS experiments CASCADE;');
    await client.query('DROP TABLE IF EXISTS creatives CASCADE;');
    await client.query('DROP TABLE IF EXISTS offers CASCADE;');
    await client.query('DROP TABLE IF EXISTS products CASCADE;');
    await client.query('DROP TABLE IF EXISTS evidences CASCADE;');
    await client.query('DROP TABLE IF EXISTS opportunities CASCADE;');
    await client.query('DROP TABLE IF EXISTS users CASCADE;');
    await client.query('DROP TABLE IF EXISTS schema_migrations CASCADE;');
  } finally {
    client.release();
  }

  await runMigrations(pool);
  await seedDemoData(pool);

  // Generate test RSA & EC keypairs for JWKS mock verification
  rsaKeyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  ecKeyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const userRes = await pool.query("SELECT auth_user_id, email, role FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' LIMIT 1");
  testUserAuthId = userRes.rows[0].auth_user_id;
  testUserEmail = userRes.rows[0].email;
});

afterAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_MODE = 'demo';
  delete process.env.SUPABASE_JWKS_URL;
  delete process.env.SUPABASE_ISSUER;
  delete process.env.SUPABASE_AUDIENCE;
  await pool.end();
});

// Helper to sign asymmetric JWT with test private key
function signAsymmetricJwt(payload: any, privateKeyPem: string, kid: string = 'test-key-1', alg: string = 'RS256'): string {
  const header = { alg, typ: 'JWT', kid };
  const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sign = crypto.createSign('SHA256');
  sign.update(`${headerBase64}.${payloadBase64}`);
  const signature = sign.sign(
    alg === 'ES256' ? { key: privateKeyPem, dsaEncoding: 'ieee-p1363' } : privateKeyPem,
    'base64url'
  );
  return `${headerBase64}.${payloadBase64}.${signature}`;
}

// Helper to construct forged HMAC JWT
function signForgedHmacJwt(payload: any, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${headerBase64}.${payloadBase64}`).digest('base64url');
  return `${headerBase64}.${payloadBase64}.${signature}`;
}

describe('NORQVA S4 Auth Security Remediation Suite', () => {

  // 1. Real mode + valid legitimate Supabase token -> accepted
  it('1. should accept legitimate Supabase RS256 token in real auth mode with valid JWKS', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalJwks = process.env.SUPABASE_JWKS_URL;
    const originalIssuer = process.env.SUPABASE_ISSUER;
    const originalAudience = process.env.SUPABASE_AUDIENCE;

    try {
      process.env.AUTH_MODE = 'real';
      process.env.SUPABASE_JWKS_URL = 'https://mock.supabase.co/auth/v1/.well-known/jwks.json';
      process.env.SUPABASE_ISSUER = 'https://mock.supabase.co/auth/v1';
      process.env.SUPABASE_AUDIENCE = 'authenticated';

      const rsaPublicKeyObj = crypto.createPublicKey(rsaKeyPair.publicKey);
      const jwk = rsaPublicKeyObj.export({ format: 'jwk' });
      jwk.kid = 'test-key-1';
      jwk.alg = 'RS256';

      const mockJwksPayload = JSON.stringify({ keys: [jwk] });
      vi.spyOn(https, 'get').mockImplementation((url: any, callback: any): any => {
        const res: any = {
          on: (event: string, handler: any) => {
            if (event === 'data') handler(mockJwksPayload);
            if (event === 'end') handler();
            return res;
          }
        };
        callback(res);
        return { on: vi.fn() };
      });

      const validPayload = {
        sub: testUserAuthId,
        iss: 'https://mock.supabase.co/auth/v1',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const token = signAsymmetricJwt(validPayload, rsaKeyPair.privateKey, 'test-key-1', 'RS256');

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(testUserEmail);
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.SUPABASE_JWKS_URL = originalJwks;
      process.env.SUPABASE_ISSUER = originalIssuer;
      process.env.SUPABASE_AUDIENCE = originalAudience;
      vi.restoreAllMocks();
    }
  });

  // 2. Real mode + forged HS256 token -> 401
  it('2. should reject forged HS256 token with 401 in real auth mode', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalJwks = process.env.SUPABASE_JWKS_URL;
    try {
      process.env.AUTH_MODE = 'real';
      process.env.SUPABASE_JWKS_URL = 'https://mock.supabase.co/auth/v1/.well-known/jwks.json';

      const forgedToken = signForgedHmacJwt(
        { sub: testUserAuthId, exp: Math.floor(Date.now() / 1000) + 3600 },
        'any-arbitrary-key'
      );

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('token');
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.SUPABASE_JWKS_URL = originalJwks;
    }
  });

  // 3. Real mode + former fallback signing material -> 401
  it('3. should reject token signed with former fallback secret with 401 in real mode', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalJwks = process.env.SUPABASE_JWKS_URL;
    try {
      process.env.AUTH_MODE = 'real';
      process.env.SUPABASE_JWKS_URL = 'https://mock.supabase.co/auth/v1/.well-known/jwks.json';

      const legacyForgedToken = signForgedHmacJwt(
        { sub: testUserAuthId, exp: Math.floor(Date.now() / 1000) + 3600 },
        'norqva-super-secret-token-key-2026'
      );

      const res = await request(app)
        .get('/api/executive/dashboard')
        .set('Authorization', `Bearer ${legacyForgedToken}`);

      expect(res.status).toBe(401);
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.SUPABASE_JWKS_URL = originalJwks;
    }
  });

  // 4. Real mode + invalid signature -> 401
  it('4. should reject token with invalid signature with 401 in real mode', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalJwks = process.env.SUPABASE_JWKS_URL;
    try {
      process.env.AUTH_MODE = 'real';
      process.env.SUPABASE_JWKS_URL = 'https://mock.supabase.co/auth/v1/.well-known/jwks.json';

      const otherRsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const badToken = signAsymmetricJwt(
        { sub: testUserAuthId, iss: 'https://mock.supabase.co/auth/v1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
        otherRsa.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
      );

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${badToken}`);

      expect(res.status).toBe(401);
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.SUPABASE_JWKS_URL = originalJwks;
    }
  });

  // 5. Real mode + wrong issuer -> 401
  it('5. should reject token with wrong issuer with 401 in real mode', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalJwks = process.env.SUPABASE_JWKS_URL;
    const originalIssuer = process.env.SUPABASE_ISSUER;
    try {
      process.env.AUTH_MODE = 'real';
      process.env.SUPABASE_JWKS_URL = 'https://mock.supabase.co/auth/v1/.well-known/jwks.json';
      process.env.SUPABASE_ISSUER = 'https://expected.supabase.co/auth/v1';

      const token = signAsymmetricJwt(
        { sub: testUserAuthId, iss: 'https://wrong-issuer.com', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
        rsaKeyPair.privateKey
      );

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.SUPABASE_JWKS_URL = originalJwks;
      process.env.SUPABASE_ISSUER = originalIssuer;
    }
  });

  // 6. Real mode + wrong audience -> 401
  it('6. should reject token with wrong audience with 401 in real mode', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalJwks = process.env.SUPABASE_JWKS_URL;
    const originalAud = process.env.SUPABASE_AUDIENCE;
    try {
      process.env.AUTH_MODE = 'real';
      process.env.SUPABASE_JWKS_URL = 'https://mock.supabase.co/auth/v1/.well-known/jwks.json';
      process.env.SUPABASE_AUDIENCE = 'authenticated';

      const token = signAsymmetricJwt(
        { sub: testUserAuthId, iss: 'https://mock.supabase.co/auth/v1', aud: 'wrong_audience', exp: Math.floor(Date.now() / 1000) + 3600 },
        rsaKeyPair.privateKey
      );

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.SUPABASE_JWKS_URL = originalJwks;
      process.env.SUPABASE_AUDIENCE = originalAud;
    }
  });

  // 7. Real mode + expired token -> 401
  it('7. should reject expired token with 401 in real mode', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalJwks = process.env.SUPABASE_JWKS_URL;
    try {
      process.env.AUTH_MODE = 'real';
      process.env.SUPABASE_JWKS_URL = 'https://mock.supabase.co/auth/v1/.well-known/jwks.json';

      const token = signAsymmetricJwt(
        { sub: testUserAuthId, iss: 'https://mock.supabase.co/auth/v1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) - 100 },
        rsaKeyPair.privateKey
      );

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.SUPABASE_JWKS_URL = originalJwks;
    }
  });

  // 8. Real mode + unknown subject -> 403
  it('8. should reject unknown subject UUID with 403 Forbidden', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalJwks = process.env.SUPABASE_JWKS_URL;
    try {
      process.env.AUTH_MODE = 'real';
      process.env.SUPABASE_JWKS_URL = 'https://mock.supabase.co/auth/v1/.well-known/jwks.json';

      const rsaPublicKeyObj = crypto.createPublicKey(rsaKeyPair.publicKey);
      const jwk = rsaPublicKeyObj.export({ format: 'jwk' });
      jwk.kid = 'test-key-1';
      jwk.alg = 'RS256';

      const mockJwksPayload = JSON.stringify({ keys: [jwk] });
      vi.spyOn(https, 'get').mockImplementation((url: any, callback: any): any => {
        const res: any = {
          on: (event: string, handler: any) => {
            if (event === 'data') handler(mockJwksPayload);
            if (event === 'end') handler();
            return res;
          }
        };
        callback(res);
        return { on: vi.fn() };
      });

      const unknownSub = crypto.randomUUID();
      const token = signAsymmetricJwt(
        { sub: unknownSub, iss: 'https://mock.supabase.co/auth/v1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
        rsaKeyPair.privateKey
      );

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('profile does not exist');
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.SUPABASE_JWKS_URL = originalJwks;
      vi.restoreAllMocks();
    }
  });

  // 9. Token payload self-asserting ADMIN -> does not override server-side role
  it('9. should not grant ADMIN privileges if user is CREATIVE in database even if token claims role=ADMIN', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalJwks = process.env.SUPABASE_JWKS_URL;
    try {
      process.env.AUTH_MODE = 'real';
      process.env.SUPABASE_JWKS_URL = 'https://mock.supabase.co/auth/v1/.well-known/jwks.json';

      const rsaPublicKeyObj = crypto.createPublicKey(rsaKeyPair.publicKey);
      const jwk = rsaPublicKeyObj.export({ format: 'jwk' });
      jwk.kid = 'test-key-1';
      jwk.alg = 'RS256';

      const mockJwksPayload = JSON.stringify({ keys: [jwk] });
      vi.spyOn(https, 'get').mockImplementation((url: any, callback: any): any => {
        const res: any = {
          on: (event: string, handler: any) => {
            if (event === 'data') handler(mockJwksPayload);
            if (event === 'end') handler();
            return res;
          }
        };
        callback(res);
        return { on: vi.fn() };
      });

      // Fetch a non-admin user
      const creativeRes = await pool.query("SELECT auth_user_id, email, role FROM users WHERE role = 'CREATIVE' AND status = 'ACTIVE' LIMIT 1");
      const creativeUser = creativeRes.rows[0];

      // Sign token claiming role: 'ADMIN'
      const token = signAsymmetricJwt(
        { sub: creativeUser.auth_user_id, role: 'ADMIN', iss: 'https://mock.supabase.co/auth/v1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
        rsaKeyPair.privateKey
      );

      // Try accessing an admin-only endpoint
      const res = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('insufficient privileges');
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.SUPABASE_JWKS_URL = originalJwks;
      vi.restoreAllMocks();
    }
  });

  // 10. Production mock login -> unavailable / 403 rejected
  it('10. should reject POST /api/auth/login with 403 in production or real auth mode', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.AUTH_MODE = 'real';
      const res1 = await request(app)
        .post('/api/auth/login')
        .send({ email: testUserEmail, password: 'any' });
      expect(res1.status).toBe(403);
      expect(res1.body.error).toContain('disabled in production/real mode');

      process.env.AUTH_MODE = 'demo';
      process.env.NODE_ENV = 'production';
      const res2 = await request(app)
        .post('/api/auth/login')
        .send({ email: testUserEmail, password: 'any' });
      expect(res2.status).toBe(403);
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  // 11. Missing JWKS/config in real mode -> fail closed
  it('11. should fail closed (401) when SUPABASE_JWKS_URL is missing in real mode', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalJwks = process.env.SUPABASE_JWKS_URL;
    try {
      process.env.AUTH_MODE = 'real';
      delete process.env.SUPABASE_JWKS_URL;

      const token = signAsymmetricJwt(
        { sub: testUserAuthId, iss: 'https://mock.supabase.co/auth/v1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
        rsaKeyPair.privateKey
      );

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.SUPABASE_JWKS_URL = originalJwks;
    }
  });

  // 12. Demo/test auth remains isolated from production behavior
  it('12. should operate in demo/test mode when explicitly configured without affecting real mode', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.AUTH_MODE = 'demo';
      process.env.NODE_ENV = 'test';

      const decoded = await verifySupabaseToken('invalid.token.here');
      expect(decoded).toBeNull();
    } finally {
      process.env.AUTH_MODE = originalAuthMode;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

});
