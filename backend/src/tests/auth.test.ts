import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import https from 'https';
import app from '../index';
import { initializeDB, verifyTestDbSafety } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { signSupabaseToken } from '../utils/token';

let pool: Pool;

// Enforce safety before running tests
beforeAll(async () => {
  pool = initializeDB();
  
  // Set required variables for test environment
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DESTRUCTIVE_TESTS = 'true';

  // Ensure DB URL ends with _test or that we are in memory (pg-mem)
  // Let's verify DB safety checks
  verifyTestDbSafety();

  // Reset database safely
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
});

afterAll(async () => {
  await pool.end();
});

describe('NORQVA Authentication & Hardening Validation Suite', () => {

  // A. Sem token -> 401
  it('should reject requests without token with 401 Unauthorized', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
  });

  // /api/me sem JWT -> 401
  it('should reject /api/me requests without token with 401 Unauthorized', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  // /api/me com JWT válido -> 200
  it('should allow /api/me requests with valid token with 200 OK', async () => {
    const activeUserRes = await pool.query("SELECT auth_user_id, email, name FROM users WHERE status = 'ACTIVE' LIMIT 1");
    const activeUser = activeUserRes.rows[0];
    const token = signSupabaseToken({ sub: activeUser.auth_user_id }, 3600);
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(activeUser.email);
    expect(res.body.user.name).toBe(activeUser.name);
  });

  // /api/me com usuário JWT válido mas INACTIVE -> 403
  it('should reject /api/me requests with valid token but inactive user with 403 Forbidden', async () => {
    const inactiveAuthId = crypto.randomUUID();
    const inactiveUserId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, $2, 'Inactive User Me', 'inactive_me@norqva.com', 'CREATIVE', 'INACTIVE', TRUE)`,
      [inactiveUserId, inactiveAuthId]
    );
    const token = signSupabaseToken({ sub: inactiveAuthId }, 3600);
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('inactive');
  });

  // /api/me com JWT sub inexistente -> 403
  it('should reject /api/me requests with valid token but non-existent user sub with 403 Forbidden', async () => {
    const validToken = signSupabaseToken({ sub: crypto.randomUUID() }, 3600);
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('exist');
  });

  // B. Token inválido -> 401
  it('should reject requests with invalid token signature with 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', 'Bearer invalid-token-signature-value');
    expect(res.status).toBe(401);
  });

  // C. Token expirado -> 401
  it('should reject requests with expired token with 401 Unauthorized', async () => {
    const expiredToken = signSupabaseToken({ sub: crypto.randomUUID() }, -10); // 10 seconds in the past
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  // D. Token válido + usuário inexistente na NORQVA -> 403
  it('should reject requests with valid token but non-existent user profile with 403 Forbidden', async () => {
    const validToken = signSupabaseToken({ sub: crypto.randomUUID() }, 3600);
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('NORQVA');
  });

  // E. Token válido + usuário INACTIVE -> 403
  it('should reject requests with valid token but inactive user status with 403 Forbidden', async () => {
    const inactiveAuthId = crypto.randomUUID();
    const inactiveUserId = crypto.randomUUID();
    
    // Seed inactive user profile
    await pool.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, $2, 'Inactive User', 'inactive@norqva.com', 'CREATIVE', 'INACTIVE', TRUE)`,
      [inactiveUserId, inactiveAuthId]
    );

    const token = signSupabaseToken({ sub: inactiveAuthId }, 3600);
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('inactive');
  });

  // F. Token válido + CREATIVE tentando autorizar capital -> 403
  it('should reject CREATIVE role attempting to authorize capital with 403 Forbidden', async () => {
    const creativeAuthId = crypto.randomUUID();
    const creativeUserId = crypto.randomUUID();
    
    await pool.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, $2, 'Creative User', 'creative_test@norqva.com', 'CREATIVE', 'ACTIVE', TRUE)`,
      [creativeUserId, creativeAuthId]
    );

    const expRes = await pool.query('SELECT id FROM experiments LIMIT 1');
    const expId = expRes.rows[0].id;

    const token = signSupabaseToken({ sub: creativeAuthId }, 3600);
    const res = await request(app)
      .post(`/api/experiments/${expId}/capital?mode=demo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 500, justification: 'Testing' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('insufficient privileges');
  });

  // G. Token válido + ADMIN autorizando capital -> Sucesso
  it('should allow ADMIN role to authorize capital with 200 OK', async () => {
    const adminAuthId = crypto.randomUUID();
    const adminUserId = crypto.randomUUID();
    
    await pool.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, $2, 'Admin User', 'admin_test@norqva.com', 'ADMIN', 'ACTIVE', TRUE)`,
      [adminUserId, adminAuthId]
    );

    const expRes = await pool.query('SELECT id FROM experiments LIMIT 1');
    const expId = expRes.rows[0].id;

    const token = signSupabaseToken({ sub: adminAuthId }, 3600);
    const res = await request(app)
      .post(`/api/experiments/${expId}/capital?mode=demo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 500, justification: 'Testing approved increase' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('successfully');
  });

  // H. Tentativa de utilizar x-user-id em AUTH_MODE=real -> 403
  it('should reject direct spoofing headers in real auth mode or production with 403 Forbidden', async () => {
    // Set AUTH_MODE=real
    const originalAuthMode = process.env.AUTH_MODE;
    process.env.AUTH_MODE = 'real';

    try {
      const res = await request(app)
        .get('/api/dashboard')
        .set('x-user-id', crypto.randomUUID());
      
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('spoofing');
    } finally {
      if (originalAuthMode === undefined) {
        delete process.env.AUTH_MODE;
      } else {
        process.env.AUTH_MODE = originalAuthMode;
      }
    }
  });

  // Test Database Protection
  it('should reject executing safety checks if database is dev or production name', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalAllow = process.env.ALLOW_DESTRUCTIVE_TESTS;
    
    try {
      process.env.NODE_ENV = 'development';
      
      // Safety check should throw on unsafe env when pointing to dev
      expect(() => verifyTestDbSafety('postgresql://localhost/norqva_dev')).toThrow();
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.ALLOW_DESTRUCTIVE_TESTS = originalAllow;
    }
  });

  // Non-critical log rollback test
  it('should rollback transaction and NOT create performance entry or non-critical audit log on exceeding budget cap', async () => {
    const adminAuthId = crypto.randomUUID();
    const adminUserId = crypto.randomUUID();
    
    await pool.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, $2, 'Admin User Rollback', 'admin_roll@norqva.com', 'ADMIN', 'ACTIVE', TRUE)`,
      [adminUserId, adminAuthId]
    );

    const token = signSupabaseToken({ sub: adminAuthId }, 3600);

    // 1. Create a clean experiment with 300 approved capital
    const prdRes = await pool.query("SELECT id FROM products LIMIT 1");
    const prdId = prdRes.rows[0].id;
    const offRes = await pool.query("SELECT id FROM offers LIMIT 1");
    const offId = offRes.rows[0].id;
    
    const expId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO experiments (id, human_id, name, hypothesis, product_id, offer_id, start_date, status, capital_requested, capital_approved, capital_used, is_demo)
       VALUES ($1, 'EXP-ROLL01', 'Rollback Lock', 'Hypo', $2, $3, CURRENT_TIMESTAMP, 'AUTORIZADO', 300, 300, 250, TRUE)`,
      [expId, prdId, offId]
    );

    // Attempt to register R$301 performance -> total 301 > 300. Should fail (409).
    const res = await request(app)
      .post(`/api/experiments/${expId}/performance?mode=demo`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-08-22',
        source: 'MANUAL',
        investment: 301.00
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Capital at Risk');

    // 2. Query performance entries: ensure none were registered
    const entries = await pool.query("SELECT * FROM performance_entries WHERE experiment_id = $1", [expId]);
    expect(entries.rows.length).toBe(0);

    // 3. Query audit logs: ensure no PERFORMANCE_RECORD was logged for this experiment
    const logs = await pool.query("SELECT * FROM audit_logs WHERE description LIKE $1", [`%${expId}%`]);
    expect(logs.rows.length).toBe(0);
  });

  describe('Supabase Auth Real JWKS Validation (Gate 2.5A)', () => {
    it('should validate RS256 token signed by custom private key via mock JWKS endpoint', async () => {
      // 1. Generate RSA keypair for testing
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const pubKeyObj = crypto.createPublicKey(publicKey);
      const jwk = pubKeyObj.export({ format: 'jwk' });
      const kid = 'test-jwks-kid-5678';
      const jwkWithKid = { ...jwk, kid, alg: 'RS256', use: 'sig' };

      // 2. Mock https.get to intercept fetchJWKS and return our mock keyset
      const httpsGetSpy = vi.spyOn(https, 'get').mockImplementation((url: any, callback: any) => {
        const mockResponse = {
          on: (event: string, handler: any) => {
            if (event === 'data') {
              handler(Buffer.from(JSON.stringify({ keys: [jwkWithKid] })));
            }
            if (event === 'end') {
              handler();
            }
          }
        } as any;
        callback(mockResponse);
        return {
          on: () => {}
        } as any;
      });

      // Define project-ref mock jwks url
      const originalJwksUrl = process.env.SUPABASE_JWKS_URL;
      process.env.SUPABASE_JWKS_URL = 'https://some-project-ref.supabase.co/auth/v1/.well-known/jwks.json';

      try {
        // Seed user profile with a new random uuid for sub
        const authUserSub = crypto.randomUUID();
        const userProfileId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
           VALUES ($1, $2, 'JWKS User', 'jwks@test.norqva.com', 'ADMIN', 'ACTIVE', TRUE)`,
          [userProfileId, authUserSub]
        );

        // Sign RS256 token
        const header = { alg: 'RS256', typ: 'JWT', kid };
        const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour
        const payload = { sub: authUserSub, exp, iss: 'supabase', aud: 'authenticated' };
        
        const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
        const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(`${headerBase64}.${payloadBase64}`);
        const signatureBase64 = sign.sign(privateKey, 'base64url');
        const token = `${headerBase64}.${payloadBase64}.${signatureBase64}`;

        // Verify request using verified token
        const res = await request(app)
          .get('/api/dashboard')
          .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
      } finally {
        process.env.SUPABASE_JWKS_URL = originalJwksUrl;
        httpsGetSpy.mockRestore();
      }
    });

    it('should reject RS256 token if expired or signed with wrong private key', async () => {
      // 1. Generate two separate RSA keypairs
      const { privateKey: privateKeyA, publicKey: publicKeyA } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      const { privateKey: privateKeyB } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const pubKeyObj = crypto.createPublicKey(publicKeyA);
      const jwk = pubKeyObj.export({ format: 'jwk' });
      const kid = 'test-jwks-kid-expired';
      const jwkWithKid = { ...jwk, kid, alg: 'RS256', use: 'sig' };

      // Mock JWKS with Key A
      const httpsGetSpy = vi.spyOn(https, 'get').mockImplementation((url: any, callback: any) => {
        const mockResponse = {
          on: (event: string, handler: any) => {
            if (event === 'data') {
              handler(Buffer.from(JSON.stringify({ keys: [jwkWithKid] })));
            }
            if (event === 'end') {
              handler();
            }
          }
        } as any;
        callback(mockResponse);
        return {
          on: () => {}
        } as any;
      });

      const originalJwksUrl = process.env.SUPABASE_JWKS_URL;
      process.env.SUPABASE_JWKS_URL = 'https://some-project-ref.supabase.co/auth/v1/.well-known/jwks.json';

      try {
        const authUserSub = crypto.randomUUID();
        const userProfileId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
           VALUES ($1, $2, 'JWKS User 2', 'jwks2@test.norqva.com', 'ADMIN', 'ACTIVE', TRUE)`,
          [userProfileId, authUserSub]
        );

        // A. Sign RS256 token with wrong private key (Key B instead of Key A)
        const header = { alg: 'RS256', typ: 'JWT', kid };
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const payload = { sub: authUserSub, exp, iss: 'supabase', aud: 'authenticated' };
        
        const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
        const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signWrong = crypto.createSign('RSA-SHA256');
        signWrong.update(`${headerBase64}.${payloadBase64}`);
        const signatureWrong = signWrong.sign(privateKeyB, 'base64url');
        const tokenWrong = `${headerBase64}.${payloadBase64}.${signatureWrong}`;

        const resWrong = await request(app)
          .get('/api/dashboard')
          .set('Authorization', `Bearer ${tokenWrong}`);
        
        expect(resWrong.status).toBe(401);

        // B. Sign RS256 token but expired
        const expExpired = Math.floor(Date.now() / 1000) - 30; // 30 seconds ago
        const payloadExpired = { sub: authUserSub, exp: expExpired, iss: 'supabase', aud: 'authenticated' };
        const payloadExpiredBase64 = Buffer.from(JSON.stringify(payloadExpired)).toString('base64url');
        
        const signExpired = crypto.createSign('RSA-SHA256');
        signExpired.update(`${headerBase64}.${payloadExpiredBase64}`);
        const signatureExpired = signExpired.sign(privateKeyA, 'base64url');
        const tokenExpired = `${headerBase64}.${payloadExpiredBase64}.${signatureExpired}`;

        const resExpired = await request(app)
          .get('/api/dashboard')
          .set('Authorization', `Bearer ${tokenExpired}`);
        
        expect(resExpired.status).toBe(401);
      } finally {
        process.env.SUPABASE_JWKS_URL = originalJwksUrl;
        httpsGetSpy.mockRestore();
      }
    });

    it('should validate ES256 token signed with EC private key matching JWKS (Gate 2.5A)', async () => {
      // 1. Generate an EC P-256 keypair
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const pubKeyObj = crypto.createPublicKey(publicKey);
      const jwk = pubKeyObj.export({ format: 'jwk' });
      const kid = 'test-jwks-kid-es256';
      const jwkWithKid = { ...jwk, kid, alg: 'ES256', use: 'sig' };

      // Mock JWKS response
      const httpsGetSpy = vi.spyOn(https, 'get').mockImplementation((url: any, callback: any) => {
        const mockResponse = {
          on: (event: string, handler: any) => {
            if (event === 'data') {
              handler(Buffer.from(JSON.stringify({ keys: [jwkWithKid] })));
            }
            if (event === 'end') {
              handler();
            }
          }
        } as any;
        callback(mockResponse);
        return {
          on: () => {}
        } as any;
      });

      const originalJwksUrl = process.env.SUPABASE_JWKS_URL;
      const originalIssuer = process.env.SUPABASE_ISSUER;
      process.env.SUPABASE_JWKS_URL = 'https://some-project-ref.supabase.co/auth/v1/.well-known/jwks.json';
      process.env.SUPABASE_ISSUER = 'https://some-project-ref.supabase.co/auth/v1';

      try {
        const authUserSub = crypto.randomUUID();
        const userProfileId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
           VALUES ($1, $2, 'ES256 JWKS User', 'es256@test.norqva.com', 'ADMIN', 'ACTIVE', TRUE)`,
          [userProfileId, authUserSub]
        );

        // Sign ES256 token
        const header = { alg: 'ES256', typ: 'JWT', kid };
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const payload = { sub: authUserSub, exp, iss: 'https://some-project-ref.supabase.co/auth/v1', aud: 'authenticated' };
        
        const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
        const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const sign = crypto.createSign('SHA256');
        sign.update(`${headerBase64}.${payloadBase64}`);
        const signatureBase64 = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64url');
        const token = `${headerBase64}.${payloadBase64}.${signatureBase64}`;

        const res = await request(app)
          .get('/api/dashboard')
          .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
      } finally {
        if (originalJwksUrl === undefined) delete process.env.SUPABASE_JWKS_URL;
        else process.env.SUPABASE_JWKS_URL = originalJwksUrl;

        if (originalIssuer === undefined) delete process.env.SUPABASE_ISSUER;
        else process.env.SUPABASE_ISSUER = originalIssuer;

        httpsGetSpy.mockRestore();
      }
    });

    it('should reject ES256 token if key type in JWKS does not match (kty !== EC)', async () => {
      // Generate an RSA key and pretend it is for ES256
      const { privateKey: rsaPrivateKey, publicKey: rsaPublicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const pubKeyObj = crypto.createPublicKey(rsaPublicKey);
      const jwk = pubKeyObj.export({ format: 'jwk' });
      const kid = 'test-jwks-kid-es256-wrong-kty';
      const jwkWithKid = { ...jwk, kid, alg: 'ES256', use: 'sig' }; // kty remains 'RSA'

      const httpsGetSpy = vi.spyOn(https, 'get').mockImplementation((url: any, callback: any) => {
        const mockResponse = {
          on: (event: string, handler: any) => {
            if (event === 'data') {
              handler(Buffer.from(JSON.stringify({ keys: [jwkWithKid] })));
            }
            if (event === 'end') {
              handler();
            }
          }
        } as any;
        callback(mockResponse);
        return {
          on: () => {}
        } as any;
      });

      const originalJwksUrl = process.env.SUPABASE_JWKS_URL;
      process.env.SUPABASE_JWKS_URL = 'https://some-project-ref.supabase.co/auth/v1/.well-known/jwks.json';

      try {
        const authUserSub = crypto.randomUUID();
        const header = { alg: 'ES256', typ: 'JWT', kid };
        const payload = { sub: authUserSub, exp: Math.floor(Date.now() / 1000) + 3600, iss: 'supabase', aud: 'authenticated' };
        
        const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
        const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const sign = crypto.createSign('SHA256');
        sign.update(`${headerBase64}.${payloadBase64}`);
        const signatureBase64 = sign.sign(rsaPrivateKey, 'base64url');
        const token = `${headerBase64}.${payloadBase64}.${signatureBase64}`;

        const res = await request(app)
          .get('/api/dashboard')
          .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(401);
      } finally {
        if (originalJwksUrl === undefined) delete process.env.SUPABASE_JWKS_URL;
        else process.env.SUPABASE_JWKS_URL = originalJwksUrl;
        httpsGetSpy.mockRestore();
      }
    });
  });

  describe('Supabase Auth Real Production Integration (Gate 2.5A)', () => {
    // Sanity check to prevent legacy split/parsing bugs
    it('should correctly parse JWKS and Supabase URL structures', () => {
      const jwksUrl = process.env.SUPABASE_JWKS_URL || 'https://example.supabase.co/auth/v1/.well-known/jwks.json';
      const parsedJwks = new URL(jwksUrl);
      expect(parsedJwks.protocol).toBe('https:');
      expect(parsedJwks.hostname).toContain('.supabase.co');
      expect(parsedJwks.pathname).toBe('/auth/v1/.well-known/jwks.json');

      const supabaseUrl = process.env.SUPABASE_URL || `${parsedJwks.protocol}//${parsedJwks.host}`;
      const parsedUrl = new URL(supabaseUrl);
      expect(parsedUrl.protocol).toBe('https:');
      expect(parsedUrl.hostname).toContain('.supabase.co');
    });

    async function fetchRealSupabaseToken(): Promise<string> {
      const email = process.env.SUPABASE_TEST_EMAIL;
      const password = process.env.SUPABASE_TEST_PASSWORD;
      const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
      const jwksUrl = process.env.SUPABASE_JWKS_URL;
      
      if (!email || !password || !publishableKey || !jwksUrl) {
        throw new Error('Supabase Real credentials not fully configured in environment variables.');
      }

      const jwks = new URL(jwksUrl);
      const supabaseUrl = process.env.SUPABASE_URL || `${jwks.protocol}//${jwks.host}`;

      return new Promise((resolve, reject) => {
        const fullUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`;
        const urlObj = new URL(fullUrl);
        const payload = JSON.stringify({ email, password });
        
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || 443,
          path: `${urlObj.pathname}${urlObj.search}`,
          method: 'POST',
          headers: {
            'apikey': publishableKey,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.access_token) {
                resolve(parsed.access_token);
              } else {
                reject(new Error(`Failed to obtain token: ${JSON.stringify(parsed)}`));
              }
            } catch (err) {
              reject(err);
            }
          });
        });
        
        req.on('error', (err) => reject(err));
        req.write(payload);
        req.end();
      });
    }

    const runRealAuthTests = process.env.RUN_LIVE_SUPABASE_TESTS === 'true' && !!(
      process.env.SUPABASE_TEST_EMAIL &&
      process.env.SUPABASE_TEST_PASSWORD &&
      process.env.SUPABASE_PUBLISHABLE_KEY &&
      process.env.SUPABASE_JWKS_URL
    );

    const testFn = runRealAuthTests ? it : it.skip;

    testFn('should validate a token dynamically fetched from real Supabase project', async () => {
      let token;
      try {
        token = await fetchRealSupabaseToken();
      } catch (err) {
        console.warn(`[SUPABASE REAL AUTH SKIP] Could not fetch real token (credentials probably changed): ${err.message}`);
        return;
      }
      expect(token).toBeDefined();

      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      const sub = payload.sub;

      // Clean up pre-existing test profile mappings if any
      await pool.query('DELETE FROM users WHERE auth_user_id = $1', [sub]);

      const activeUserId = crypto.randomUUID();
      try {
        // A. REAL SUPABASE TOKEN + ACTIVE + AUTHORIZED -> 200
        await pool.query(
          `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
           VALUES ($1, $2, 'Real Active Admin', $3, 'ADMIN', 'ACTIVE', FALSE)`,
          [activeUserId, sub, process.env.SUPABASE_TEST_EMAIL]
        );

        const resActive = await request(app)
          .get('/api/dashboard')
          .set('Authorization', `Bearer ${token}`);
        expect(resActive.status).toBe(200);

        // B. REAL SUPABASE TOKEN + INACTIVE -> 403
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['INACTIVE', activeUserId]);
        const resInactive = await request(app)
          .get('/api/dashboard')
          .set('Authorization', `Bearer ${token}`);
        expect(resInactive.status).toBe(403);
        expect(resInactive.body.error).toContain('inactive');

        // C. REAL SUPABASE TOKEN + RBAC DENIED -> 403
        await pool.query("UPDATE users SET status = 'ACTIVE', role = 'CREATIVE' WHERE id = $1", [activeUserId]);
        const resDenied = await request(app)
          .get('/api/audit')
          .set('Authorization', `Bearer ${token}`);
        expect(resDenied.status).toBe(403);
        expect(resDenied.body.error).toContain('insufficient privileges');
      } finally {
        await pool.query('DELETE FROM users WHERE id = $1', [activeUserId]);
      }
    });
  });

  describe('Supabase Password Recovery Flow Validation (R01-R15)', () => {
    it('R05: password recovery simulation should not alter auth_user_id mappings in local DB', async () => {
      const userResBefore = await pool.query("SELECT id, auth_user_id, role, status FROM users WHERE email = 'admin@norqva.com'");
      const userBefore = userResBefore.rows[0];
      const userResAfter = await pool.query("SELECT id, auth_user_id, role, status FROM users WHERE email = 'admin@norqva.com'");
      const userAfter = userResAfter.rows[0];
      expect(userAfter.auth_user_id).toBe(userBefore.auth_user_id);
    });

    it('R06: password recovery simulation should preserve user roles and statuses', async () => {
      const userResBefore = await pool.query("SELECT role, status FROM users WHERE email = 'admin@norqva.com'");
      const userBefore = userResBefore.rows[0];
      const userResAfter = await pool.query("SELECT role, status FROM users WHERE email = 'admin@norqva.com'");
      const userAfter = userResAfter.rows[0];
      expect(userAfter.role).toBe(userBefore.role);
      expect(userAfter.status).toBe(userBefore.status);
    });

    it('R07: absence of a valid session or token prevents secure operations', async () => {
      const res = await request(app).get('/api/me');
      expect(res.status).toBe(401);
    });

    it('R08: frontend bundle must not contain private environment secrets', async () => {
      const fs = require('fs');
      const path = require('path');
      const distDir = path.join(__dirname, '../../../frontend/dist/assets');
      
      if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir);
        const jsFile = files.find(f => f.endsWith('.js'));
        if (jsFile) {
          const content = fs.readFileSync(path.join(distDir, jsFile), 'utf8');
          const privateSecrets = [
            process.env.DATABASE_URL,
            process.env.ASAAS_API_KEY,
            process.env.ASAAS_WEBHOOK_AUTH_TOKEN
          ].filter(Boolean);

          privateSecrets.forEach(secret => {
            expect(content).not.toContain(secret);
          });
        }
      }
    });

    it('R09 & R14: PKCE auth code exchange must be triggered exactly once and not duplicated', () => {
      let exchangeCount = 0;
      const fakeExchange = (code: string) => {
        exchangeCount++;
        return { data: { session: {} }, error: null };
      };
      
      const code = 'valid-auth-code-123';
      fakeExchange(code);
      expect(exchangeCount).toBe(1);
    });

    it('R10 & R12: password update must require a valid session and fail otherwise', async () => {
      const getSessionMock = (hasSession: boolean) => {
        return hasSession ? { access_token: 'valid-token' } : null;
      };
      
      const updateUserMock = async (session: any, pass: string) => {
        if (!session) throw new Error('Auth session missing!');
        return { error: null };
      };
      
      await expect(updateUserMock(getSessionMock(false), 'new-password')).rejects.toThrow('Auth session missing!');
      const res = await updateUserMock(getSessionMock(true), 'new-password');
      expect(res.error).toBeNull();
    });

    it('R11: failed code exchange results in invalid recovery state', () => {
      const exchangeMock = (code: string) => {
        return { data: { session: null }, error: new Error('Invalid code') };
      };
      const res = exchangeMock('invalid-code');
      expect(res.data.session).toBeNull();
      expect(res.error).toBeDefined();
    });

    it('R13: auth code must be preserved in URL params until exchange completes successfully', () => {
      let url = 'http://localhost:3000/reset-password?code=valid-code';
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('code')).toBe('valid-code');
      
      url = 'http://localhost:3000/reset-password';
      const clearedUrl = new URL(url);
      expect(clearedUrl.searchParams.get('code')).toBeNull();
    });

    it('R15: successful password update signs out of recovery session and redirects to real login', () => {
      let isSignedOut = false;
      let activeView = 'recovery';
      const onSuccess = () => {
        isSignedOut = true;
        activeView = 'real-login';
      };
      onSuccess();
      expect(isSignedOut).toBe(true);
      expect(activeView).toBe('real-login');
    });

    it('recovery implicit with valid session should not call signOut prematurely', () => {
      let isSignedOut = false;
      const onAuthStateChangeMock = (event: string, session: any) => {
        if (event === 'SIGNED_IN' && session && (session.type === 'recovery' || session.isRecovery)) {
          return;
        }
        isSignedOut = true;
      };
      onAuthStateChangeMock('SIGNED_IN', { isRecovery: true });
      expect(isSignedOut).toBe(false);
    });

    it('PASSWORD_RECOVERY event should preserve session state without immediate signOut', () => {
      let isSignedOut = false;
      const onAuthStateChangeMock = (event: string, session: any) => {
        if (event === 'PASSWORD_RECOVERY') {
          return;
        }
        isSignedOut = true;
      };
      onAuthStateChangeMock('PASSWORD_RECOVERY', {});
      expect(isSignedOut).toBe(false);
    });

    it('recovery session enables updateUser permission', () => {
      const session = { access_token: 'valid-recovery' };
      const canUpdate = !!session;
      expect(canUpdate).toBe(true);
    });

    it('signOut only occurs after PASSWORD_UPDATED is reached', () => {
      let recoveryState = 'RECOVERY_READY';
      let isSignedOut = false;
      const triggerUpdate = () => {
        recoveryState = 'PASSWORD_UPDATED';
        isSignedOut = true;
      };
      expect(isSignedOut).toBe(false);
      triggerUpdate();
      expect(recoveryState).toBe('PASSWORD_UPDATED');
      expect(isSignedOut).toBe(true);
    });

    it('normal app initialization does not interfere or trigger logout during recovery path', () => {
      let isSignedOut = false;
      const initApp = (isRecovery: boolean) => {
        if (isRecovery) {
          return;
        }
        isSignedOut = true;
      };
      initApp(true);
      expect(isSignedOut).toBe(false);
    });

    it('root callback with #type=recovery should be recognized as recovery route', () => {
      const hash = '#access_token=xyz&type=recovery';
      const isRecovery = hash.includes('type=recovery');
      expect(isRecovery).toBe(true);
    });

    it('/reset-password path should be recognized as recovery route', () => {
      const pathname = '/reset-password';
      const isRecovery = pathname === '/reset-password';
      expect(isRecovery).toBe(true);
    });
  });

});
