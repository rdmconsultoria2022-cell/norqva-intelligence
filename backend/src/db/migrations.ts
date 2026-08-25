import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { isDbInMemory } from './db';

export async function runMigrations(pool: Pool) {
  // Create schema_migrations table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // If not running in pg-mem, ensure Supabase mock roles and schemas exist on local databases
  if (!isDbInMemory() && process.env.NODE_ENV !== 'production') {
    const setupClient = await pool.connect();
    try {
      await setupLocalPostgresTestCompatibility(setupClient);
    } catch (err) {
      console.log('Local PostgreSQL test compatibility notice:', err);
    } finally {
      setupClient.release();
    }
  }

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`Migrations directory not found at ${migrationsDir}`);
    return;
  }

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  
  for (const file of files) {
    const checkQuery = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (checkQuery.rows.length === 0) {
      console.log(`Running migration: ${file}`);
      const sqlPath = path.join(migrationsDir, file);
      let sqlContent = fs.readFileSync(sqlPath, 'utf8');
      
      // pg-mem parser fallback: strip RLS / Policies statements which pg-mem cannot parse
      if (isDbInMemory()) {
        sqlContent = sqlContent
          .split(';')
          .filter(statement => {
            const clean = statement.toUpperCase().trim();
            if (!clean) return false;
            return !clean.includes('ROW LEVEL SECURITY') && 
                   !clean.includes('CREATE POLICY') &&
                   !clean.includes('DROP POLICY');
          })
          .join(';\n') + ';';
      }

      // Execute migration inside a transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Only query if not empty (since filtering might result in empty commands)
        if (sqlContent.trim() && sqlContent.trim() !== ';') {
          await client.query(sqlContent);
        }
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Migration ${file} executed successfully.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error executing migration ${file}:`, err);
        throw err;
      } finally {
        client.release();
      }
    }
  }
}

export async function setupLocalPostgresTestCompatibility(client: any): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    throw new Error('[SECURITY EXCEPTION]: Supabase compatibility bootstrap is strictly prohibited in production.');
  }

  // 1. Try creating auth schema
  try {
    await client.query('CREATE SCHEMA auth;');
    console.log('Created mock auth schema.');
  } catch (err: any) {
    console.log('Auth schema check/create bypassed (might already exist).');
  }

  // 2. Try checking if auth.uid() function works
  let hasAuthUid = false;
  try {
    await client.query('SELECT auth.uid();');
    hasAuthUid = true;
    console.log('auth.uid() function already exists. Preserving existing function.');
  } catch (err: any) {
    hasAuthUid = false;
  }

  if (!hasAuthUid) {
    console.log('Creating mock auth.uid() function...');
    if (isDbInMemory()) {
      await client.query(`
        CREATE OR REPLACE FUNCTION auth.uid() 
        RETURNS uuid LANGUAGE sql STABLE AS $$ 
          SELECT null::uuid; 
        $$;
      `);
    } else {
      await client.query(`
        CREATE OR REPLACE FUNCTION auth.uid() 
        RETURNS uuid LANGUAGE sql STABLE AS $$ 
          SELECT COALESCE(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')
          )::uuid; 
        $$;
      `);
    }
  }

  // 3. Check and create roles authenticated and anon
  try {
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN 
          CREATE ROLE authenticated; 
        END IF; 
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN 
          CREATE ROLE anon; 
        END IF; 
      END $$;
    `);
  } catch (err: any) {
    console.log('Roles creation check bypassed (might already exist or be in pg-mem).');
  }
  console.log('Local PostgreSQL test compatibility bootstrap successfully applied.');
}
