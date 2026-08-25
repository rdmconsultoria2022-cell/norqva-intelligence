import { initializeDB } from './db';
import { runMigrations } from './migrations';

async function main() {
  console.log('[Migration Release Phase]: Initializing database connection...');
  const pool = initializeDB();

  try {
    console.log('[Migration Release Phase]: Executing versioned migrations...');
    await runMigrations(pool);
    console.log('[Migration Release Phase]: All migrations executed successfully.');
    await pool.end();
    process.exit(0);
  } catch (err: any) {
    console.error('[Migration Release Phase Error]: Migration execution failed:', err.message);
    try {
      await pool.end();
    } catch (_) {}
    process.exit(1);
  }
}

main();
