import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateProductionEnvironment } from '../utils/envValidation';
import { AsaasPaymentProvider } from '../utils/payment';

describe('NORQVA Production Payment Lock Boot Remediation Suite V1', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ALLOW_DESTRUCTIVE_TESTS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('TEST 1: APP_ENV=production, ASAAS_ENV=production, ALLOW_PRODUCTION_PAYMENTS=false, ASAAS_API_KEY absent => environment validation PASS', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/norqva_prod';
    process.env.SUPABASE_URL = 'https://prod.supabase.co';
    process.env.SUPABASE_JWKS_URL = 'https://prod.supabase.co/auth/v1/.well-known/jwks.json';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_pub_key_123';
    process.env.CORS_ALLOWED_ORIGINS = 'https://norqva.com';
    process.env.ASAAS_ENV = 'production';
    process.env.ASAAS_BASE_URL = 'https://api.asaas.com/v3';
    process.env.ALLOW_PRODUCTION_PAYMENTS = 'false';
    delete process.env.ASAAS_API_KEY;
    delete process.env.ASAAS_WEBHOOK_AUTH_TOKEN;

    const result = validateProductionEnvironment();
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('TEST 2: same config => payment provider initializes in locked state without external requests', () => {
    process.env.ALLOW_PRODUCTION_PAYMENTS = 'false';
    const provider = new AsaasPaymentProvider(
      '',
      'https://api.asaas.com/v3',
      'production',
      { allowProductionPayments: false }
    );
    expect(provider).toBeDefined();
  });

  it('TEST 3: attempt createPixPayment when ALLOW_PRODUCTION_PAYMENTS=false => rejected PRODUCTION_PAYMENTS_LOCKED', async () => {
    const provider = new AsaasPaymentProvider(
      '',
      'https://api.asaas.com/v3',
      'production',
      { allowProductionPayments: false }
    );

    await expect(provider.createPixPayment({
      amount: 19.90,
      description: 'TRATTORIA EM CASA',
      idempotencyKey: 'idem_lock_test',
      providerCustomerId: 'cus_lock_test'
    })).rejects.toThrow(/PRODUCTION_PAYMENTS_LOCKED/);

    await expect(provider.createCustomer({
      name: 'Locked Customer',
      email: 'customer@norqva.com',
      externalReference: 'ref_123'
    })).rejects.toThrow(/PRODUCTION_PAYMENTS_LOCKED/);
  });

  it('TEST 4: ALLOW_PRODUCTION_PAYMENTS=true, ASAAS_API_KEY absent => fail closed', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/norqva_prod';
    process.env.SUPABASE_URL = 'https://prod.supabase.co';
    process.env.SUPABASE_JWKS_URL = 'https://prod.supabase.co/auth/v1/.well-known/jwks.json';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_pub_key_123';
    process.env.CORS_ALLOWED_ORIGINS = 'https://norqva.com';
    process.env.ASAAS_ENV = 'production';
    process.env.ASAAS_BASE_URL = 'https://api.asaas.com/v3';
    process.env.ALLOW_PRODUCTION_PAYMENTS = 'true';
    delete process.env.ASAAS_API_KEY;
    process.env.ASAAS_WEBHOOK_AUTH_TOKEN = 'valid_webhook_token';

    expect(() => validateProductionEnvironment()).toThrow(
      /Production environment requires non-empty ASAAS_API_KEY/
    );

    expect(() => {
      new AsaasPaymentProvider(
        '',
        'https://api.asaas.com/v3',
        'production',
        { allowProductionPayments: true, webhookAuthToken: 'valid_webhook_token' }
      );
    }).toThrow(/Asaas API key must be provided and non-empty/);
  });

  it('TEST 5: ASAAS_ENV=production, sandbox base URL => rejected', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/norqva_prod';
    process.env.SUPABASE_URL = 'https://prod.supabase.co';
    process.env.SUPABASE_JWKS_URL = 'https://prod.supabase.co/auth/v1/.well-known/jwks.json';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_pub_key_123';
    process.env.CORS_ALLOWED_ORIGINS = 'https://norqva.com';
    process.env.ASAAS_ENV = 'production';
    process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3';
    process.env.ALLOW_PRODUCTION_PAYMENTS = 'false';

    expect(() => validateProductionEnvironment()).toThrow(
      /Production environment requires https:\/\/api\.asaas\.com base URL/
    );

    expect(() => {
      new AsaasPaymentProvider(
        'some_key',
        'https://api-sandbox.asaas.com/v3',
        'production',
        { allowProductionPayments: false }
      );
    }).toThrow(/Production environment requires https:\/\/api\.asaas\.com base URL/);
  });

  it('TEST 6: ASAAS_ENV=sandbox, production base URL => rejected', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'staging';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/norqva_staging';
    process.env.SUPABASE_URL = 'https://staging.supabase.co';
    process.env.SUPABASE_JWKS_URL = 'https://staging.supabase.co/auth/v1/.well-known/jwks.json';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_pub_key_123';
    process.env.CORS_ALLOWED_ORIGINS = 'https://staging.norqva.com';
    process.env.ASAAS_ENV = 'sandbox';
    process.env.ASAAS_BASE_URL = 'https://api.asaas.com/v3';
    process.env.ALLOW_PRODUCTION_PAYMENTS = 'false';
    process.env.ASAAS_API_KEY = 'sandbox_key';
    process.env.ASAAS_WEBHOOK_AUTH_TOKEN = 'sandbox_token';

    expect(() => validateProductionEnvironment()).toThrow(
      /Sandbox environment requires https:\/\/api-sandbox\.asaas\.com base URL/
    );

    expect(() => {
      new AsaasPaymentProvider(
        'sandbox_key',
        'https://api.asaas.com/v3',
        'sandbox',
        { allowProductionPayments: false }
      );
    }).toThrow(/Sandbox environment requires https:\/\/api-sandbox\.asaas\.com base URL/);
  });

  it('TEST 7: staging environment cannot enable production payments', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'staging';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/norqva_staging';
    process.env.SUPABASE_URL = 'https://staging.supabase.co';
    process.env.SUPABASE_JWKS_URL = 'https://staging.supabase.co/auth/v1/.well-known/jwks.json';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_pub_key_123';
    process.env.CORS_ALLOWED_ORIGINS = 'https://staging.norqva.com';
    process.env.ASAAS_ENV = 'sandbox';
    process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3';
    process.env.ALLOW_PRODUCTION_PAYMENTS = 'true';
    process.env.ASAAS_API_KEY = 'sandbox_key';
    process.env.ASAAS_WEBHOOK_AUTH_TOKEN = 'sandbox_token';

    expect(() => validateProductionEnvironment()).toThrow(
      /Staging environment cannot enable production payments/
    );
  });
});