import { describe, it, expect } from 'vitest';
import { AsaasPaymentProvider } from '../utils/payment';

describe('GATE 06.2A — Asaas Payment Provider Production Safety & Fail-Closed Guard', () => {
  const dummySandboxKey = '$aact_dummy_sandbox_api_key_12345';
  const dummyProdKey = '$aact_dummy_production_api_key_67890';
  const dummyWebhookToken = 'dummy_webhook_secret_token_abcde';

  it('TEST 01: sandbox env + sandbox URL -> PASS', () => {
    expect(() => {
      const provider = new AsaasPaymentProvider(
        dummySandboxKey,
        'https://api-sandbox.asaas.com/v3',
        'sandbox'
      );
      expect(provider).toBeDefined();
    }).not.toThrow();
  });

  it('TEST 02: sandbox env + production URL -> FAIL CLOSED', () => {
    expect(() => {
      new AsaasPaymentProvider(
        dummySandboxKey,
        'https://api.asaas.com/v3',
        'sandbox'
      );
    }).toThrow(/Sandbox environment requires https:\/\/api-sandbox\.asaas\.com base URL/);
  });

  it('TEST 03: production env + production URL + allowProductionPayments=false -> FAIL CLOSED', () => {
    expect(() => {
      new AsaasPaymentProvider(
        dummyProdKey,
        'https://api.asaas.com/v3',
        'production',
        { allowProductionPayments: false, webhookAuthToken: dummyWebhookToken }
      );
    }).toThrow(/Production payments are strictly blocked/);
  });

  it('TEST 04: production env + production URL + allow=true without API key -> FAIL CLOSED', () => {
    expect(() => {
      new AsaasPaymentProvider(
        '',
        'https://api.asaas.com/v3',
        'production',
        { allowProductionPayments: true, webhookAuthToken: dummyWebhookToken }
      );
    }).toThrow(/Asaas API key must be provided and non-empty/);
  });

  it('TEST 05: production env + production URL + allow=true without webhook token -> FAIL CLOSED', () => {
    expect(() => {
      new AsaasPaymentProvider(
        dummyProdKey,
        'https://api.asaas.com/v3',
        'production',
        { allowProductionPayments: true, webhookAuthToken: '' }
      );
    }).toThrow(/Production environment requires ASAAS_WEBHOOK_AUTH_TOKEN to be configured/);
  });

  it('TEST 06: production env + production URL + allow=true + all credentials present -> PROVIDER INITIALIZATION PASS', () => {
    expect(() => {
      const provider = new AsaasPaymentProvider(
        dummyProdKey,
        'https://api.asaas.com/v3',
        'production',
        { allowProductionPayments: true, webhookAuthToken: dummyWebhookToken }
      );
      expect(provider).toBeDefined();
    }).not.toThrow();
  });

  it('TEST 07: verify that secret values never appear in exception error messages', () => {
    const sensitiveSecret = 'SUPER_SECRET_VALUE_NEVER_LEAK_99999';
    try {
      new AsaasPaymentProvider(
        sensitiveSecret,
        'https://invalid-host.asaas.com/v3',
        'production',
        { allowProductionPayments: false }
      );
      expect.unreachable('Should have thrown an exception');
    } catch (err) {
      expect(err.message).not.toContain(sensitiveSecret);
    }
  });

  it('TEST 08: hybrid combinations & invalid environment strings -> FAIL CLOSED', () => {
    expect(() => {
      new AsaasPaymentProvider(
        dummyProdKey,
        'https://api-sandbox.asaas.com/v3',
        'production',
        { allowProductionPayments: true, webhookAuthToken: dummyWebhookToken }
      );
    }).toThrow(/Production environment requires https:\/\/api\.asaas\.com base URL/);

    expect(() => {
      new AsaasPaymentProvider(
        dummySandboxKey,
        'https://api-sandbox.asaas.com/v3',
        'staging'
      );
    }).toThrow(/Invalid ASAAS_ENV 'staging'/);
  });
});