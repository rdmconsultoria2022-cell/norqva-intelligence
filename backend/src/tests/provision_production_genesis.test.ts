import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import {
  validateGenesisPreconditions,
  executeGenesisCore,
  GenesisEnvironmentConfig
} from '../db/provision_production_genesis';
import { runMigrations } from '../db/migrations';

describe('NORQVA Production Genesis Provisioner Hardening Suite V1', () => {
  const originalEnv = { ...process.env };
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL_TEST || 'postgresql://postgres:RicardoAndradeLucas@localhost:5432/norqva_test'
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. Environment & Precondition Validation (Fail-Closed)', () => {
    const validConfig: GenesisEnvironmentConfig = {
      nodeEnv: 'production',
      appEnv: 'production',
      allowGenesis: 'true',
      allowProdPayments: 'false',
      databaseUrl: 'postgres://user:pass@host:5432/norqva_production',
      adminAuthUserId: '00000000-0000-0000-0000-000000000001',
      adminEmail: 'admin.genesis@norqva.com',
      adminName: 'Production Admin'
    };

    it('passes validation when all required production preconditions are met', () => {
      const result = validateGenesisPreconditions(validConfig);
      expect(result.databaseUrl).toBe(validConfig.databaseUrl);
      expect(result.adminAuthUserId).toBe('00000000-0000-0000-0000-000000000001');
      expect(result.adminEmail).toBe('admin.genesis@norqva.com');
      expect(result.adminName).toBe('Production Admin');
    });

    it('fails closed when NODE_ENV is not production', () => {
      expect(() => {
        validateGenesisPreconditions({ ...validConfig, nodeEnv: 'development' });
      }).toThrow(/NODE_ENV=production/);

      expect(() => {
        validateGenesisPreconditions({ ...validConfig, nodeEnv: undefined });
      }).toThrow(/NODE_ENV=production/);
    });

    it('fails closed when APP_ENV is not production', () => {
      expect(() => {
        validateGenesisPreconditions({ ...validConfig, appEnv: 'staging' });
      }).toThrow(/APP_ENV=production/);

      expect(() => {
        validateGenesisPreconditions({ ...validConfig, appEnv: undefined });
      }).toThrow(/APP_ENV=production/);
    });

    it('fails closed when ALLOW_PRODUCTION_GENESIS is not true', () => {
      expect(() => {
        validateGenesisPreconditions({ ...validConfig, allowGenesis: 'false' });
      }).toThrow(/ALLOW_PRODUCTION_GENESIS=true/);

      expect(() => {
        validateGenesisPreconditions({ ...validConfig, allowGenesis: undefined });
      }).toThrow(/ALLOW_PRODUCTION_GENESIS=true/);
    });

    it('fails closed when ALLOW_PRODUCTION_PAYMENTS is true', () => {
      expect(() => {
        validateGenesisPreconditions({ ...validConfig, allowProdPayments: 'true' });
      }).toThrow(/ALLOW_PRODUCTION_PAYMENTS=false/);
    });

    it('fails closed when DATABASE_URL is missing or empty', () => {
      expect(() => {
        validateGenesisPreconditions({ ...validConfig, databaseUrl: '' });
      }).toThrow(/DATABASE_URL is required/);

      expect(() => {
        validateGenesisPreconditions({ ...validConfig, databaseUrl: undefined });
      }).toThrow(/DATABASE_URL is required/);
    });

    it('fails closed when ADMIN_AUTH_USER_ID is missing or empty (zero hardcoded fallback)', () => {
      expect(() => {
        validateGenesisPreconditions({ ...validConfig, adminAuthUserId: '' });
      }).toThrow(/ADMIN_AUTH_USER_ID environment variable is required/);

      expect(() => {
        validateGenesisPreconditions({ ...validConfig, adminAuthUserId: undefined });
      }).toThrow(/ADMIN_AUTH_USER_ID environment variable is required/);
    });

    it('fails closed when ADMIN_EMAIL is missing or empty (zero hardcoded fallback)', () => {
      expect(() => {
        validateGenesisPreconditions({ ...validConfig, adminEmail: '' });
      }).toThrow(/ADMIN_EMAIL environment variable is required/);

      expect(() => {
        validateGenesisPreconditions({ ...validConfig, adminEmail: undefined });
      }).toThrow(/ADMIN_EMAIL environment variable is required/);
    });
  });

  describe('2. Positive Allow-List Database Validation', () => {
    it('fails closed when connected database name does not match expected allow-list', async () => {
      const client = await pool.connect();
      try {
        await expect(
          executeGenesisCore(client, {
            adminAuthUserId: '00000000-0000-0000-0000-000000000001',
            adminEmail: 'admin@norqva.com',
            adminName: 'Admin',
            allowedDatabaseName: 'strictly_different_database_name'
          })
        ).rejects.toThrow(/Database target mismatch/);
      } finally {
        client.release();
      }
    });
  });

  describe('3. Atomic Transaction & Pre/Post Assertions', () => {
    let client: any;
    let currentDbName: string;

    beforeEach(async () => {
      client = await pool.connect();
      const res = await client.query('SELECT current_database() as db_name');
      currentDbName = res.rows[0].db_name;

      // Reset test DB schema cleanly
      await client.query('DROP TABLE IF EXISTS performance_entries CASCADE;');
      await client.query('DROP TABLE IF EXISTS capital_authorizations CASCADE;');
      await client.query('DROP TABLE IF EXISTS decisions CASCADE;');
      await client.query('DROP TABLE IF EXISTS audit_logs CASCADE;');
      await client.query('DROP TABLE IF EXISTS experiment_creatives CASCADE;');
      await client.query('DROP TABLE IF EXISTS experiments CASCADE;');
      await client.query('DROP TABLE IF EXISTS creatives CASCADE;');
      await client.query('DROP TABLE IF EXISTS evidences CASCADE;');
      await client.query('DROP TABLE IF EXISTS opportunities CASCADE;');
      await client.query('DROP TABLE IF EXISTS offer_digital_assets CASCADE;');
      await client.query('DROP TABLE IF EXISTS digital_assets CASCADE;');
      await client.query('DROP TABLE IF EXISTS payments CASCADE;');
      await client.query('DROP TABLE IF EXISTS orders CASCADE;');
      await client.query('DROP TABLE IF EXISTS customers CASCADE;');
      await client.query('DROP TABLE IF EXISTS offers CASCADE;');
      await client.query('DROP TABLE IF EXISTS products CASCADE;');
      await client.query('DROP TABLE IF EXISTS users CASCADE;');
      await client.query('DROP TABLE IF EXISTS schema_migrations CASCADE;');

      await runMigrations(pool);
    });

    afterEach(async () => {
      if (client) {
        client.release();
      }
    });

    it('executes successfully on clean empty baseline with exactly 5 canonical records', async () => {
      const result = await executeGenesisCore(client, {
        adminAuthUserId: '00000000-0000-0000-0000-000000000001',
        adminEmail: 'canonical.admin@norqva.com',
        adminName: 'Genesis Administrator',
        allowedDatabaseName: currentDbName
      });

      expect(result.success).toBe(true);
      expect(result.writes).toBe(5);

      // Verify canonical records in database
      const userRes = await client.query('SELECT * FROM users');
      expect(userRes.rows.length).toBe(1);
      expect(userRes.rows[0].auth_user_id).toBe('00000000-0000-0000-0000-000000000001');
      expect(userRes.rows[0].email).toBe('canonical.admin@norqva.com');
      expect(userRes.rows[0].role).toBe('ADMIN');
      expect(userRes.rows[0].status).toBe('ACTIVE');

      const prodRes = await client.query('SELECT * FROM products');
      expect(prodRes.rows.length).toBe(1);
      expect(prodRes.rows[0].human_id).toBe('PRD-000003');
      expect(prodRes.rows[0].name).toBe('TRATTORIA EM CASA');
      expect(prodRes.rows[0].data_provenance).toBe('COMMERCIAL_PRODUCTION');
      expect(prodRes.rows[0].is_demo).toBe(false);

      const assetRes = await client.query('SELECT * FROM digital_assets');
      expect(assetRes.rows.length).toBe(1);
      expect(assetRes.rows[0].name).toBe('TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf');
      expect(assetRes.rows[0].storage_bucket).toBe('digital-products');

      const offerRes = await client.query('SELECT * FROM offers');
      expect(offerRes.rows.length).toBe(1);
      expect(offerRes.rows[0].human_id).toBe('OFF-000001');
      expect(Number(offerRes.rows[0].price)).toBe(19.90);
      expect(offerRes.rows[0].status).toBe('ATIVA');

      const mapRes = await client.query('SELECT * FROM offer_digital_assets');
      expect(mapRes.rows.length).toBe(1);
      expect(mapRes.rows[0].offer_id).toBe('c127bfa3-5feb-4abb-a6f3-4d21f9ace192');
      expect(mapRes.rows[0].asset_id).toBe('a34eb944-eb2b-41e1-bea9-b4e98f3dd425');
    });

    it('fails and rolls back if PRD-000003 already exists', async () => {
      await client.query(`
        INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, origin_provenance)
        VALUES ('bf13ad7b-92cf-4e99-b4ea-ff3e86f0ffd7', 'PRD-000003', 'Existing', 'INFOPRODUTO', 'Desc', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', 'ORIGINAL')
      `);

      await expect(
        executeGenesisCore(client, {
          adminAuthUserId: '00000000-0000-0000-0000-000000000001',
          adminEmail: 'admin@norqva.com',
          adminName: 'Admin',
          allowedDatabaseName: currentDbName
        })
      ).rejects.toThrow(/PRD-000003 already exists/);

      // Verify no other records were created
      const userRes = await client.query('SELECT COUNT(*) FROM users');
      expect(parseInt(userRes.rows[0].count, 10)).toBe(0);
    });

    it('fails and rolls back if database contains existing orders or payments', async () => {
      await client.query(`
        INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, origin_provenance)
        VALUES ('11111111-1111-1111-1111-111111111111', 'PRD-EXISTING', 'Existing', 'INFOPRODUTO', 'Desc', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', 'ORIGINAL')
      `);
      await client.query(`
        INSERT INTO offers (id, human_id, product_id, name, description, price, status, is_demo, data_provenance)
        VALUES ('22222222-2222-2222-2222-222222222222', 'OFF-EXISTING', '11111111-1111-1111-1111-111111111111', 'Existing Offer', 'Offer Desc', 10, 'ATIVA', false, 'COMMERCIAL_PRODUCTION')
      `);
      await client.query(`
        INSERT INTO customers (id, name, email, phone)
        VALUES ('33333333-3333-3333-3333-333333333333', 'Test Cust', 'cust@test.com', '11999999999')
      `);
      await client.query(`
        INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
        VALUES ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 10, 'PENDING', 'idem_mock_1', false, 'COMMERCIAL_PRODUCTION')
      `);

      await expect(
        executeGenesisCore(client, {
          adminAuthUserId: '00000000-0000-0000-0000-000000000001',
          adminEmail: 'admin@norqva.com',
          adminName: 'Admin',
          allowedDatabaseName: currentDbName
        })
      ).rejects.toThrow(/Database contains existing orders/);
    });
  });
});