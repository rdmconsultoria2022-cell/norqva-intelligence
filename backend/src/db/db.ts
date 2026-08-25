import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

import { parse } from 'pg-connection-string';

let pool: Pool;
let isInMemory = false;

export function initializeDB(): Pool {
  if (pool) return pool;

  const isTest = process.env.NODE_ENV === 'test';
  let dbUrl = process.env.DATABASE_URL_TEST;

  // Strict check: Block fallback to DATABASE_URL in test env
  if (isTest && !dbUrl && process.env.DATABASE_URL) {
    throw new Error('[DATABASE CONFIG ERROR]: DATABASE_URL_TEST is required in test environment when DATABASE_URL is configured. Fallback to DATABASE_URL is blocked.');
  }

  if (!dbUrl && !isTest) {
    dbUrl = process.env.DATABASE_URL;
  }

  if (dbUrl) {
    let parsedConfig;
    try {
      parsedConfig = parse(dbUrl);
    } catch (err: any) {
      throw new Error(`[DATABASE CONFIG ERROR]: Invalid database connection URL format: ${err.message}`);
    }

    if (!parsedConfig.user) {
      throw new Error('[DATABASE CONFIG ERROR]: Database username is missing in the connection URL.');
    }

    if (!parsedConfig.password) {
      throw new Error('[DATABASE CONFIG ERROR]: Database password is missing in the connection URL. Ensure it is formatted as postgresql://user:password@host/db.');
    }

    if (!parsedConfig.database) {
      throw new Error('[DATABASE CONFIG ERROR]: Database name is missing in the connection URL.');
    }

    if (isTest && !parsedConfig.database.endsWith('_test')) {
      throw new Error(`[DATABASE CONFIG ERROR]: Database name must end with '_test' in test environment. Got '${parsedConfig.database}'.`);
    }

    if (process.env.ALLOW_DESTRUCTIVE_TESTS === 'true') {
      verifyTestDbSafety(dbUrl);
    }

    console.log('Connecting to PostgreSQL database via connection string...');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    isInMemory = false;
  } else {
    console.log('No database connection string found (DATABASE_URL_TEST or DATABASE_URL). Initializing pg-mem...');
    try {
      const { newDb } = require('pg-mem');
      const memDb = newDb();
      
      memDb.public.registerFunction({
        name: 'gen_random_uuid',
        returns: 'uuid',
        implementation: () => require('crypto').randomUUID()
      });

      const PgMemPool = memDb.adapters.createPg().Pool;
      pool = new PgMemPool();
      isInMemory = true;
    } catch (err) {
      console.error('Failed to initialize pg-mem emulator:', err);
      throw err;
    }
  }

  return pool;
}

export async function getDB(): Promise<Pool> {
  const p = initializeDB();
  return p;
}

export function isDbInMemory(): boolean {
  return isInMemory;
}

export function verifyTestDbSafety(customDbUrl?: string): void {
  const dbUrl = customDbUrl || process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  if (!dbUrl && isInMemory) return;
  if (!dbUrl) return;

  try {
    const isNodeEnvTest = process.env.NODE_ENV === 'test';
    const isAllowDestructive = process.env.ALLOW_DESTRUCTIVE_TESTS === 'true';

    let dbName = '';
    const nameMatch = dbUrl.match(/\/([^?\/]+)(\?|$)/);
    if (nameMatch) {
      dbName = nameMatch[1];
    }

    let dbHost = 'localhost';
    const hostMatch = dbUrl.match(/@([^:\/]+)(:\d+)?\//);
    if (hostMatch) {
      dbHost = hostMatch[1].toLowerCase();
    }

    const isTestDbName = dbName.endsWith('_test') && dbName !== 'norqva_dev' && !dbName.includes('prod') && !dbName.includes('staging');
    const isLocalOrTestHost = dbHost === 'localhost' || dbHost === '127.0.0.1' || dbHost === '::1' || dbHost === 'postgres' || dbHost.endsWith('.internal');

    if (!isNodeEnvTest || !isTestDbName || !isAllowDestructive || !isLocalOrTestHost) {
      throw new Error(
        `[DATABASE SAFETY VIOLATION]: Destructive database operations are strictly prohibited outside isolated local test environments. ` +
        `Required conditions: NODE_ENV=test (got '${process.env.NODE_ENV}'), ` +
        `database name ending with '_test' (got '${dbName}'), ` +
        `local/test host (got '${dbHost}'), ` +
        `and ALLOW_DESTRUCTIVE_TESTS=true (got '${process.env.ALLOW_DESTRUCTIVE_TESTS}').`
      );
    }
  } catch (err: any) {
    console.error(err.message);
    throw err;
  }
}

export async function clearDemoData(p: Pool): Promise<void> {
  // Remove 'experiment_creatives' because it does not have is_demo column and uses cascade delete.
  const tables = [
    'performance_entries',
    'capital_authorizations',
    'decisions',
    'audit_logs',
    'experiments',
    'creatives',
    'offers',
    'products',
    'evidences',
    'opportunities',
    'users'
  ];

  const client = await p.connect();
  try {
    await client.query('BEGIN');
    for (const table of tables) {
      // Check if table has is_demo column (helps protect on real DB schemas)
      const colCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = 'is_demo'
      `, [table]);
      
      if (colCheck.rows.length > 0 || isInMemory) {
        await client.query(`DELETE FROM ${table} WHERE is_demo = TRUE`);
      }
    }
    await client.query('COMMIT');
    console.log('All DEMO data cleared successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to clear DEMO data:', err);
    throw err;
  } finally {
    client.release();
  }
}

export function resetPool(): void {
  // @ts-ignore
  pool = undefined;
}
