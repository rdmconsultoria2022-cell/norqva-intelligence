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

  // Lock staging to Asaas Sandbox
  if (process.env.APP_ENV === 'staging' || !process.env.ALLOW_PRODUCTION_PAYMENTS) {
    const asaasEnv = process.env.ASAAS_ENV || 'sandbox';
    const asaasBase = process.env.ASAAS_BASE_URL || '';
    if (asaasEnv !== 'sandbox' || !asaasBase.includes('sandbox')) {
      throw new Error('[SECURITY ERROR]: Staging environment must be locked to Asaas Sandbox. Production Asaas credentials are forbidden.');
    }
  }

  if (missing.length > 0) {
    const errorMsg = `[FATAL CONFIG ERROR]: Missing required environment variables in production mode: ${missing.join(', ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return { valid: true, missing: [] };
}
