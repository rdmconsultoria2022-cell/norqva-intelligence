export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
}

export function validateProductionEnvironment(): EnvValidationResult {
  if (process.env.ALLOW_DESTRUCTIVE_TESTS === 'true' && process.env.NODE_ENV !== 'test') {
    throw new Error(
      `[DATABASE SAFETY VIOLATION]: Destructive database operations are strictly prohibited outside isolated local test environments. ` +
      `Required conditions: NODE_ENV=test (got '${process.env.NODE_ENV}').`
    );
  }

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    return { valid: true, missing: [] };
  }

  const requiredVars = [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_JWKS_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'ASAAS_API_KEY',
    'ASAAS_BASE_URL',
    'ASAAS_WEBHOOK_AUTH_TOKEN',
    'CORS_ALLOWED_ORIGINS'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName] || process.env[varName]!.trim() === '');

  // Asaas Environment Multi-Guard Validation
  const asaasEnv = (process.env.ASAAS_ENV || 'sandbox').trim().toLowerCase();
  const asaasBase = (process.env.ASAAS_BASE_URL || '').trim();
  const allowProd = process.env.ALLOW_PRODUCTION_PAYMENTS === 'true';
  const asaasKey = process.env.ASAAS_API_KEY || '';
  const webhookToken = process.env.ASAAS_WEBHOOK_AUTH_TOKEN || '';

  if (asaasEnv === 'sandbox') {
    if (!asaasBase.includes('api-sandbox.asaas.com')) {
      throw new Error('[SECURITY ERROR]: Sandbox environment requires https://api-sandbox.asaas.com base URL.');
    }
  } else if (asaasEnv === 'production') {
    if (!allowProd) {
      throw new Error('[SECURITY ERROR]: Production payments are strictly blocked. ALLOW_PRODUCTION_PAYMENTS must be true.');
    }
    if (!asaasBase.includes('api.asaas.com') || asaasBase.includes('sandbox')) {
      throw new Error('[SECURITY ERROR]: Production environment requires https://api.asaas.com base URL.');
    }
    if (!asaasKey || asaasKey.trim() === '') {
      throw new Error('[SECURITY ERROR]: Production environment requires non-empty ASAAS_API_KEY.');
    }
    if (!webhookToken || webhookToken.trim() === '') {
      throw new Error('[SECURITY ERROR]: Production environment requires non-empty ASAAS_WEBHOOK_AUTH_TOKEN.');
    }
  } else {
    throw new Error(`[SECURITY ERROR]: Invalid ASAAS_ENV '${process.env.ASAAS_ENV}'. Must be 'sandbox' or 'production'.`);
  }

  // Lock staging specifically to Asaas Sandbox
  if (process.env.APP_ENV === 'staging' && asaasEnv !== 'sandbox') {
    throw new Error('[SECURITY ERROR]: Staging environment must be locked to Asaas Sandbox.');
  }

  if (missing.length > 0) {
    const errorMsg = `[FATAL CONFIG ERROR]: Missing required environment variables in production mode: ${missing.join(', ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return { valid: true, missing: [] };
}
