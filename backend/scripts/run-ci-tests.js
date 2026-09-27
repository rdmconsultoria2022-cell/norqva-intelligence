const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ciEnv = {
  ...process.env,
  NODE_ENV: 'test',
  ALLOW_DESTRUCTIVE_TESTS: 'true',
  AUTH_MODE: 'real',
  SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_JWKS_URL: 'https://mock.supabase.co/auth/v1/.well-known/jwks.json',
  SUPABASE_PUBLISHABLE_KEY: 'sb_pub_mock',
  ASAAS_API_KEY: 'MOCK',
  ASAAS_BASE_URL: 'https://api-sandbox.asaas.com/v3',
  ASAAS_ENV: 'sandbox',
  ASAAS_WEBHOOK_AUTH_TOKEN: 'test_token',
  CPF_CNPJ_HASH_SECRET: 'test_cpf_cnpj_hash_secret_32_characters_minimum'
};

const args = process.argv.slice(2);
const vitestArgs = ['vitest', 'run', ...args];

console.log('[CI Test Runner] Running:', vitestArgs.join(' '));
const result = spawnSync('npx', vitestArgs, {
  env: ciEnv,
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  shell: true
});

process.exit(result.status ?? 1);

