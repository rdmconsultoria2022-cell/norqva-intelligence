const https = require('https');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://ikekbotxngcgqyojtwjb.supabase.co';
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2Hj91wCQhD5efqcgWa-NSw_73DW5Pe9';
const email = process.env.SUPABASE_TEST_EMAIL || 'rdmconsultoria2022@gmail.com';
const password = process.env.SUPABASE_TEST_PASSWORD || 'RicardoAndradeLucas';

function getSupabaseUid() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${supabaseUrl}/auth/v1/token?grant_type=password`);
    const data = JSON.stringify({ email, password });
    
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.user && parsed.user.id) {
            resolve({ uid: parsed.user.id, token: parsed.access_token });
          } else {
            reject(new Error(`Failed to get user ID: ${body}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  try {
    const { uid, token } = await getSupabaseUid();
    console.log('Successfully authenticated with Supabase.');
    console.log('Sanitized Supabase UID:', uid.substring(0, 8) + '...');
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL_TEST
    });
    
    // First, run migrations and seed data if users table is empty
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(usersCount.rows[0].count, 10) === 0) {
      console.log('Database empty. Running migrations and seed...');
      const { runMigrations } = require('./src/db/migrations');
      const { seedDemoData } = require('./src/db/seed');
      await runMigrations(pool);
      await seedDemoData(pool);
    }
    
    // Now update or insert the admin user with the correct auth_user_id
    const checkAdmin = await pool.query("SELECT id, auth_user_id FROM users WHERE email = 'admin@norqva.com'");
    if (checkAdmin.rows.length > 0) {
      console.log('Updating existing Admin User profile.');
      await pool.query(
        "UPDATE users SET auth_user_id = $1, is_demo = FALSE WHERE email = 'admin@norqva.com'",
        [uid]
      );
    } else {
      console.log('Inserting new Admin User profile.');
      const id = require('crypto').randomUUID();
      await pool.query(
        "INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo) VALUES ($1, $2, 'Admin User', 'admin@norqva.com', 'ADMIN', 'ACTIVE', FALSE)",
        [id, uid]
      );
    }
    
    // Verification query
    const verify = await pool.query("SELECT name, email, auth_user_id, role, status, is_demo FROM users WHERE email = 'admin@norqva.com'");
    console.log('Verified Admin User Row:', JSON.stringify(verify.rows[0], null, 2));
    
    // Test GET /api/me locally
    console.log('Testing GET /api/me locally via requireRole middleware...');
    const app = require('./src/index').default;
    const request = require('supertest');
    
    const response = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);
      
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(response.body, null, 2));
    
    await pool.end();
  } catch (err) {
    console.error('Failure:', err);
  }
}

run();
