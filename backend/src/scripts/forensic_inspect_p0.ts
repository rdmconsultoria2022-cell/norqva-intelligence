import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function run() {
  try {
    console.log('=== 1. OFFERS ===');
    const offers = await pool.query('SELECT * FROM offers ORDER BY created_at ASC');
    console.log(JSON.stringify(offers.rows, null, 2));

    console.log('=== 2. DIGITAL ASSETS ===');
    const assets = await pool.query('SELECT * FROM digital_assets');
    console.log(JSON.stringify(assets.rows, null, 2));

    console.log('=== 3. OFFER DIGITAL ASSETS ===');
    const offerAssets = await pool.query(`
      SELECT oda.*, o.human_id as offer_human_id, o.name as offer_name, 
             da.name as asset_name, da.storage_bucket, da.storage_path
      FROM offer_digital_assets oda
      LEFT JOIN offers o ON o.id = oda.offer_id
      LEFT JOIN digital_assets da ON da.id = oda.asset_id
    `);
    console.log(JSON.stringify(offerAssets.rows, null, 2));

    console.log('=== 4. ORDER DELIVERIES ===');
    const deliveries = await pool.query(`
      SELECT od.*,
             da.name as asset_name, da.storage_bucket, da.storage_path,
             o.human_id as order_human_id, o.status as order_status, o.customer_email, o.gross_amount
      FROM order_deliveries od
      LEFT JOIN digital_assets da ON da.id = od.asset_id
      LEFT JOIN orders o ON o.id = od.order_id
      ORDER BY od.created_at DESC
    `);
    console.log(JSON.stringify(deliveries.rows, null, 2));

    console.log('=== 5. RECENT ORDERS & ORDER ITEMS ===');
    const orders = await pool.query(`
      SELECT o.*,
             oi.offer_id, off.human_id as offer_human_id, off.name as offer_name
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN offers off ON off.id = oi.offer_id
      ORDER BY o.created_at DESC LIMIT 10
    `);
    console.log(JSON.stringify(orders.rows, null, 2));

  } catch (err) {
    console.error('Error during forensic query:', err);
  } finally {
    await pool.end();
  }
}

run();
