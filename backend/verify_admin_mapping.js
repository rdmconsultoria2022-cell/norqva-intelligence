const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '.env') });

const dbUrl = process.env.DATABASE_URL_TEST;

if (!dbUrl) {
  console.error("DATABASE_URL_TEST is not configured in .env");
  process.exit(1);
}

// Extract database name from connection parameters
let dbName = '';
const match = dbUrl.match(/\/([^?\/]+)(\?|$)/);
if (match) {
  dbName = match[1];
}

// 1. Safety verification
if (!dbName.endsWith('_test')) {
  console.error(`[SAFETY VIOLATION] Database name must end with '_test'. Got '${dbName}'`);
  process.exit(1);
}

if (process.env.NODE_ENV !== 'test') {
  console.error(`[SAFETY VIOLATION] NODE_ENV must be 'test'. Got '${process.env.NODE_ENV}'`);
  process.exit(1);
}

const targetUid = 'c13c7068-ca1e-4509-87a1-c27658514d4e';
const targetEmail = 'admin@norqva.com';

const pool = new Pool({
  connectionString: dbUrl
});

async function run() {
  let adminProfileRestored = 'FAIL';
  let authUserIdUnique = 'FAIL';
  let jwtSubDatabaseMapping = 'FAIL';
  let usersCount = 0;
  let jwtSubMatchCount = 0;
  let role = '';
  let status = '';

  const client = await pool.connect();
  try {
    // Start Transaction
    await client.query('BEGIN');
    
    // Clean up any other profile using our real Supabase user UID to ensure uniqueness
    const dupCheck = await client.query(
      "SELECT id, email FROM users WHERE auth_user_id = $1 AND email != $2",
      [targetUid, targetEmail]
    );
    if (dupCheck.rows.length > 0) {
      console.log(`[CLEANUP] Found other user profile using target UID: ${dupCheck.rows[0].email}. Unlinking UID...`);
      await client.query(
        "UPDATE users SET auth_user_id = NULL WHERE auth_user_id = $1 AND email != $2",
        [targetUid, targetEmail]
      );
    }
    
    // Update Admin User profile to link with real Supabase user UID
    await client.query(`
      UPDATE users
      SET auth_user_id = $1,
          name = 'Admin User',
          role = 'ADMIN',
          status = 'ACTIVE',
          is_demo = FALSE
      WHERE email = $2
    `, [targetUid, targetEmail]);
    
    // Verify database profile is correctly mapped
    const verifyUser = await client.query(
      "SELECT id, auth_user_id, name, email, role, status, is_demo FROM users WHERE email = $1",
      [targetEmail]
    );
    
    const user = verifyUser.rows[0];
    if (
      user &&
      user.name === 'Admin User' &&
      user.role === 'ADMIN' &&
      user.status === 'ACTIVE' &&
      user.is_demo === false &&
      user.auth_user_id === targetUid
    ) {
      adminProfileRestored = 'PASS';
      role = user.role;
      status = user.status;
    }
    
    // Verify uniqueness of auth_user_id
    const countUid = await client.query(
      "SELECT COUNT(*) FROM users WHERE auth_user_id = $1",
      [targetUid]
    );
    const count = parseInt(countUid.rows[0].count, 10);
    jwtSubMatchCount = count;
    if (count === 1) {
      authUserIdUnique = 'PASS';
    }
    
    // Verify mapping
    const mappingCheck = await client.query(
      "SELECT id FROM users WHERE auth_user_id = $1 AND email = $2",
      [targetUid, targetEmail]
    );
    if (mappingCheck.rows.length === 1) {
      jwtSubDatabaseMapping = 'PASS';
    }
    
    // Commit transaction
    await client.query('COMMIT');
    console.log("Profile restoration transaction committed successfully.");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Profile restoration transaction failed, rolled back:", err);
  } finally {
    client.release();
  }

  // Get users count
  try {
    const resCount = await pool.query("SELECT COUNT(*) FROM users");
    usersCount = parseInt(resCount.rows[0].count, 10);
  } catch (err) {
    console.error("Failed to query users count:", err.message);
  }

  // End database pool
  await pool.end();
  console.log("Pool ended successfully.");

  // Check if password exists in .env
  const hasEnvPassword = process.env.SUPABASE_TEST_PASSWORD ? 'YES' : 'NO';

  // Report final results
  console.log("\n=== RESULTADO ===");
  console.log(`USERS COUNT: ${usersCount}`);
  console.log(`ADMIN PROFILE: ${adminProfileRestored}`);
  console.log(`AUTH_USER_ID MAPPING: ${jwtSubDatabaseMapping}`);
  console.log(`JWT SUB MATCH COUNT: ${jwtSubMatchCount}`);
  console.log(`REAL /api/me STATUS: NOT EXECUTED`);
  console.log(`ROLE: ${role}`);
  console.log(`STATUS: ${status}`);
}

run();
