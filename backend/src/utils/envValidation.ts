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
    'CORS_ALLOWED_ORIGINS'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName] || process.env[varName]!.trim() === '');

  // Asaas Environment Multi-Guard Validation
  const asaasEnv = (process.env.ASAAS_ENV || 'sandbox').trim().toLowerCase();
  const asaasBase = (process.env.ASAAS_BASE_URL || '').trim();
  const allowProd = process.env.ALLOW_PRODUCTION_PAYMENTS === 'true';
  const asaasKey = (process.env.ASAAS_API_KEY || '').trim();
  const webhookToken = (process.env.ASAAS_WEBHOOK_AUTH_TOKEN || '').trim();
  const appEnv = (process.env.APP_ENV || '').trim().toLowerCase();

  // Validate ASAAS_ENV Enum
  if (asaasEnv !== 'sandbox' && asaasEnv !== 'production') {
    throw new Error(`[SECURITY ERROR]: Invalid ASAAS_ENV '${process.env.ASAAS_ENV}'. Must be 'sandbox' or 'production'.`);
  }

  // Staging environment must remain locked to Sandbox and cannot enable production payments
  if (appEnv === 'staging') {
    if (asaasEnv !== 'sandbox') {
      throw new Error('[SECURITY ERROR]: Staging environment must be locked to Asaas Sandbox.');
    }
    if (allowProd) {
      throw new Error('[SECURITY ERROR]: Staging environment cannot enable production payments.');
    }
  }

  if (asaasEnv === 'sandbox') {
    if (allowProd) {
      throw new Error('[SECURITY ERROR]: Sandbox environment cannot enable production payments.');
    }
    if (!asaasBase || !asaasBase.includes('api-sandbox.asaas.com')) {
      throw new Error('[SECURITY ERROR]: Sandbox environment requires https://api-sandbox.asaas.com base URL.');
    }
    // If running in sandbox production mode (e.g. staging runtime), require sandbox keys
    if (!asaasKey) missing.push('ASAAS_API_KEY');
    if (!webhookToken) missing.push('ASAAS_WEBHOOK_AUTH_TOKEN');
  } else if (asaasEnv === 'production') {
    if (!asaasBase || !asaasBase.includes('api.asaas.com') || asaasBase.includes('sandbox')) {
      throw new Error('[SECURITY ERROR]: Production environment requires https://api.asaas.com base URL.');
    }

    if (allowProd) {
      // Production Payments ACTIVE: require live credentials
      if (!asaasKey) {
        throw new Error('[SECURITY ERROR]: Production environment requires non-empty ASAAS_API_KEY.');
      }
      if (!webhookToken) {
        throw new Error('[SECURITY ERROR]: Production environment requires non-empty ASAAS_WEBHOOK_AUTH_TOKEN.');
      }
    } else {
      // Production Payments LOCKED: Day Zero Safe Posture
      console.log('[SECURITY NOTICE]: Production payments are LOCKED (ALLOW_PRODUCTION_PAYMENTS=false). Mutating payment operations will be blocked fail-closed.');
    }
  }

  if (missing.length > 0) {
    const errorMsg = `[FATAL CONFIG ERROR]: Missing required environment variables in production mode: ${missing.join(', ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return { valid: true, missing: [] };
}

