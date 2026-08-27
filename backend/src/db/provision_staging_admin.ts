import { Pool } from 'pg';

async function main() {
  const isTest = process.env.NODE_ENV === 'test';
  if (isTest) {
    console.error('[SAFETY VIOLATION]: Cannot run staging admin provisioning in NODE_ENV=test.');
    process.exit(1);
  }

  const allowProvision = process.env.ALLOW_STAGING_ADMIN_PROVISION === 'true';
  if (!allowProvision) {
    console.error('[SAFETY VIOLATION]: Staging admin provisioning requires explicit ALLOW_STAGING_ADMIN_PROVISION=true.');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[SAFETY VIOLATION]: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    const dbNameRes = await client.query('SELECT current_database() as db_name');
    const currentDbName = dbNameRes.rows[0]?.db_name || '';

    console.log(`[Staging Admin Provisioning]: Target database identified as: '${currentDbName}'`);

    if (currentDbName.endsWith('_test') || currentDbName === 'norqva_dev') {
      throw new Error(`[SAFETY VIOLATION]: Refusing to execute staging admin provisioner against '${currentDbName}'. Target must be a dedicated staging database.`);
    }

    console.log('[Staging Admin Provisioning]: Initiating transaction...');
    await client.query('BEGIN');

    const adminAuthUserId = process.env.ADMIN_AUTH_USER_ID || '486d6688-3c33-41f1-8f86-8cee0311c733';
    const adminEmail = process.env.ADMIN_EMAIL || 'rdmconsultoria2022@gmail.com';
    const adminName = process.env.ADMIN_NAME || 'Admin User';
    const adminRole = 'ADMIN';
    const adminStatus = 'ACTIVE';

    // 1. Remove obsolete or conflicting records with same auth_user_id or email
    await client.query(
      'DELETE FROM users WHERE (auth_user_id = $1 AND email != $2) OR (email = $2 AND auth_user_id != $1)',
      [adminAuthUserId, adminEmail]
    );

    // 2. Safe idempotent UPSERT on email
    const upsertSql = `
      INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
      VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        $5,
        FALSE
      )
      ON CONFLICT (email) DO UPDATE 
        SET auth_user_id = EXCLUDED.auth_user_id,
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            is_demo = FALSE
      RETURNING id, auth_user_id, name, email, role, status, is_demo;
    `;

    const upsertRes = await client.query(upsertSql, [
      adminAuthUserId,
      adminName,
      adminEmail,
      adminRole,
      adminStatus
    ]);

    await client.query('COMMIT');
    console.log('[Staging Admin Provisioning]: Transaction committed successfully.');

    // Verification queries
    const totalCountRes = await client.query('SELECT COUNT(*) FROM users');
    const emailMatchRes = await client.query('SELECT COUNT(*) FROM users WHERE email = $1', [adminEmail]);
    const authMatchRes = await client.query('SELECT COUNT(*) FROM users WHERE auth_user_id = $1', [adminAuthUserId]);
    const record = upsertRes.rows[0];

    console.log('[Verification Summary]:');
    console.log(`- Users Total: ${totalCountRes.rows[0].count}`);
    console.log(`- Email Match Count: ${emailMatchRes.rows[0].count}`);
    console.log(`- Auth User ID Match Count: ${authMatchRes.rows[0].count}`);
    console.log(`- Profile Name: ${record.name}`);
    console.log(`- Role: ${record.role}`);
    console.log(`- Status: ${record.status}`);
    console.log(`- Is Demo: ${record.is_demo}`);

    process.exit(0);
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('[Staging Admin Provisioning Error]:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
