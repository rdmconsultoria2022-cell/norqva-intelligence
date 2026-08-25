import { test, expect, describe } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';

describe('NORQVA Test Server Startup and Database Safety Guards (CLI Spawning)', () => {
  const indexScript = path.join(__dirname, '../index.ts');

  function runServerProcess(env: Record<string, string>, timeoutMs = 25000): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
      // Use process.execPath with ts-node/register for cross-platform, shell-less execution
      const child = spawn(process.execPath, ['-r', 'ts-node/register', indexScript], {
        env: {
          ...process.env,
          TS_NODE_TRANSPILE_ONLY: 'true', // Fast transpile-only execution to bypass slow type-checks under test CPU load
          ...env
        }
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      child.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        if (str.includes('[Server] NORQVA Hardened Core V1 running')) {
          if (!resolved) {
            resolved = true;
            child.kill('SIGTERM');
            setTimeout(() => resolve({ stdout, stderr, code: child.exitCode }), 500);
          }
        }
      });

      child.stderr.on('data', (data) => {
        const str = data.toString();
        stderr += str;
        if (str.includes('DATABASE SAFETY VIOLATION') || str.includes('DATABASE CONFIG ERROR') || str.includes('Initialization failed')) {
          if (!resolved) {
            resolved = true;
            child.kill('SIGTERM');
            setTimeout(() => resolve({ stdout, stderr, code: child.exitCode }), 500);
          }
        }
      });

      child.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          resolve({ stdout, stderr, code });
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill('SIGTERM');
          resolve({ stdout, stderr, code: null });
        }
      }, timeoutMs);
    });
  }

  // 1. NODE_ENV=test & RUN_TEST_SERVER absent -> no HTTP listen
  test('1. NODE_ENV=test & RUN_TEST_SERVER absent -> does not start HTTP server', async () => {
    const res = await runServerProcess({
      NODE_ENV: 'test',
      RUN_TEST_SERVER: '',
      DATABASE_URL_TEST: 'postgresql://postgres:pass@localhost:5432/norqva_test',
      ALLOW_DESTRUCTIVE_TESTS: 'true'
    });

    expect(res.stdout).not.toContain('[Server] NORQVA Hardened Core V1 running');
    expect(res.stderr).not.toContain('DATABASE SAFETY VIOLATION');
    expect(res.stderr).not.toContain('DATABASE CONFIG ERROR');
  }, 30000);

  // 2. NODE_ENV=test & RUN_TEST_SERVER=true & DATABASE_URL_TEST ending in _test & ALLOW_DESTRUCTIVE_TESTS=true -> HTTP server allowed
  test('2. NODE_ENV=test & RUN_TEST_SERVER=true & DATABASE_URL_TEST ends in _test & ALLOW_DESTRUCTIVE_TESTS=true -> starts HTTP server', async () => {
    const res = await runServerProcess({
      NODE_ENV: 'test',
      RUN_TEST_SERVER: 'true',
      DATABASE_URL_TEST: '',
      DATABASE_URL: '', // Clear DATABASE_URL to prevent test environment fallback checks from throwing
      ALLOW_DESTRUCTIVE_TESTS: 'true',
      PORT: '5099'
    });

    expect(res.stderr).toBe('');
    expect(res.stdout).toContain('[Server] NORQVA Hardened Core V1 running');
  }, 30000);

  // 3. NODE_ENV=test & RUN_TEST_SERVER=true & database != *_test -> blocked
  test('3. NODE_ENV=test & RUN_TEST_SERVER=true & database does not end with _test -> throws DATABASE CONFIG ERROR or SAFETY VIOLATION', async () => {
    const res = await runServerProcess({
      NODE_ENV: 'test',
      RUN_TEST_SERVER: 'true',
      DATABASE_URL_TEST: 'postgresql://postgres:pass@localhost:5432/norqva_production',
      ALLOW_DESTRUCTIVE_TESTS: 'true'
    });

    const isSafetyOrConfigError = res.stderr.includes('DATABASE SAFETY VIOLATION') || res.stderr.includes('DATABASE CONFIG ERROR');
    expect(isSafetyOrConfigError).toBe(true);
    expect(res.stdout).not.toContain('[Server] NORQVA Hardened Core V1 running');
  }, 30000);

  // 4. NODE_ENV=production & RUN_TEST_SERVER=true -> must NOT enable destructive test bootstrap
  test('4. NODE_ENV=production & RUN_TEST_SERVER=true -> ignores RUN_TEST_SERVER and blocks destructive test bootstrap', async () => {
    const res = await runServerProcess({
      NODE_ENV: 'production',
      RUN_TEST_SERVER: 'true',
      AUTH_MODE: 'real',
      DATABASE_URL_TEST: 'postgresql://postgres:pass@localhost:5432/norqva_test',
      ALLOW_DESTRUCTIVE_TESTS: 'true'
    });

    expect(res.stderr).toContain('DATABASE SAFETY VIOLATION');
    expect(res.stdout).not.toContain('Seeding Demo Data finished');
  }, 30000);
});
