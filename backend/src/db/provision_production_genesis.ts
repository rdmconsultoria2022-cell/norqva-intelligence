import { Pool, PoolClient } from 'pg';

export interface GenesisResult {
  success: boolean;
  writes: number;
}

export interface GenesisEnvironmentConfig {
  nodeEnv?: string;
  appEnv?: string;
  allowGenesis?: string;
  allowProdPayments?: string;
  databaseUrl?: string;
  adminAuthUserId?: string;
  adminEmail?: string;
  adminName?: string;
}

export function validateGenesisPreconditions(config: GenesisEnvironmentConfig = process.env): {
  databaseUrl: string;
  adminAuthUserId: string;
  adminEmail: string;
  adminName: string;
} {
  const nodeEnv = config.nodeEnv ?? process.env.NODE_ENV;
  const appEnv = config.appEnv ?? process.env.APP_ENV;
  const allowGenesis = config.allowGenesis ?? process.env.ALLOW_PRODUCTION_GENESIS;
  const allowProdPayments = config.allowProdPayments ?? process.env.ALLOW_PRODUCTION_PAYMENTS;
  const databaseUrl = config.databaseUrl ?? process.env.DATABASE_URL;
  const adminAuthUserId = config.adminAuthUserId ?? process.env.ADMIN_AUTH_USER_ID;
  const adminEmail = config.adminEmail ?? process.env.ADMIN_EMAIL;
  const adminName = config.adminName ?? process.env.ADMIN_NAME ?? 'Admin User';

  if (nodeEnv !== 'production') {
    throw new Error(`[SAFETY VIOLATION]: Production genesis requires NODE_ENV=production (got '${nodeEnv}').`);
  }
  if (appEnv !== 'production') {
    throw new Error(`[SAFETY VIOLATION]: Production genesis requires APP_ENV=production (got '${appEnv}').`);
  }
  if (allowGenesis !== 'true') {
    throw new Error(`[SAFETY VIOLATION]: Production genesis requires explicit ALLOW_PRODUCTION_GENESIS=true (got '${allowGenesis}').`);
  }
  if (allowProdPayments === 'true') {
    throw new Error('[SAFETY VIOLATION]: Production genesis requires ALLOW_PRODUCTION_PAYMENTS=false (payments must remain locked during genesis).');
  }
  if (!databaseUrl || databaseUrl.trim() === '') {
    throw new Error('[SAFETY VIOLATION]: DATABASE_URL is required for production genesis.');
  }
  if (!adminAuthUserId || adminAuthUserId.trim() === '') {
    throw new Error('[SAFETY VIOLATION]: ADMIN_AUTH_USER_ID environment variable is required and cannot be empty.');
  }
  if (!adminEmail || adminEmail.trim() === '') {
    throw new Error('[SAFETY VIOLATION]: ADMIN_EMAIL environment variable is required and cannot be empty.');
  }

  return {
    databaseUrl,
    adminAuthUserId: adminAuthUserId.trim(),
    adminEmail: adminEmail.trim().toLowerCase(),
    adminName: adminName.trim()
  };
}

export async function executeGenesisCore(
  client: PoolClient | any,
  params: {
    adminAuthUserId: string;
    adminEmail: string;
    adminName: string;
    allowedDatabaseName?: string;
  }
): Promise<GenesisResult> {
  const expectedDbName = params.allowedDatabaseName || 'norqva_production';
  const dbNameRes = await client.query('SELECT current_database() as db_name');
  const currentDbName = dbNameRes.rows[0]?.db_name || '';

  if (currentDbName !== expectedDbName) {
    throw new Error(`[SAFETY VIOLATION]: Database target mismatch. Expected '${expectedDbName}', but connected to '${currentDbName}'. Positive allow-list check failed.`);
  }

  console.log('[Production Genesis]: Positive database validation passed.');
  console.log('[Production Genesis]: Initiating atomic transaction...');
  await client.query('BEGIN');

  try {
    // --- PRE-GENESIS EMPTY BASELINE ASSERTIONS ---
    const prdCheck = await client.query("SELECT COUNT(*) FROM products WHERE human_id = 'PRD-000003' OR id = 'bf13ad7b-92cf-4e99-b4ea-ff3e86f0ffd7'");
    if (parseInt(prdCheck.rows[0].count, 10) > 0) {
      throw new Error('[CONFLICT]: PRD-000003 already exists in database.');
    }

    const offCheck = await client.query("SELECT COUNT(*) FROM offers WHERE human_id = 'OFF-000001' OR id = 'c127bfa3-5feb-4abb-a6f3-4d21f9ace192'");
    if (parseInt(offCheck.rows[0].count, 10) > 0) {
      throw new Error('[CONFLICT]: OFF-000001 already exists in database.');
    }

    const assetCheck = await client.query("SELECT COUNT(*) FROM digital_assets WHERE id = 'a34eb944-eb2b-41e1-bea9-b4e98f3dd425'");
    if (parseInt(assetCheck.rows[0].count, 10) > 0) {
      throw new Error('[CONFLICT]: Asset a34eb944-eb2b-41e1-bea9-b4e98f3dd425 already exists in database.');
    }

    const mapCheck = await client.query("SELECT COUNT(*) FROM offer_digital_assets WHERE offer_id = 'c127bfa3-5feb-4abb-a6f3-4d21f9ace192'");
    if (parseInt(mapCheck.rows[0].count, 10) > 0) {
      throw new Error('[CONFLICT]: Offer-to-asset mapping already exists in database.');
    }

    const ordersCheck = await client.query('SELECT COUNT(*) FROM orders');
    if (parseInt(ordersCheck.rows[0].count, 10) > 0) {
      throw new Error('[SAFETY VIOLATION]: Database contains existing orders. Cannot run Day Zero genesis on populated database.');
    }

    const paymentsCheck = await client.query('SELECT COUNT(*) FROM payments');
    if (parseInt(paymentsCheck.rows[0].count, 10) > 0) {
      throw new Error('[SAFETY VIOLATION]: Database contains existing payments. Cannot run Day Zero genesis on populated database.');
    }

    const customersCheck = await client.query('SELECT COUNT(*) FROM customers');
    if (parseInt(customersCheck.rows[0].count, 10) > 0) {
      throw new Error('[SAFETY VIOLATION]: Database contains existing customers.');
    }

    const qaCheck = await client.query("SELECT COUNT(*) FROM products WHERE data_provenance = 'STAGING_SANDBOX_QA' OR is_demo = TRUE");
    if (parseInt(qaCheck.rows[0].count, 10) > 0) {
      throw new Error('[SAFETY VIOLATION]: QA or demo records detected in production database.');
    }

    // --- RECORD 1: ADMIN RBAC MAPPING ---
    const adminInsertSql = `
      INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
      VALUES (gen_random_uuid(), $1, $2, $3, 'ADMIN', 'ACTIVE', FALSE)
      RETURNING id, role, status;
    `;
    const adminRes = await client.query(adminInsertSql, [params.adminAuthUserId, params.adminName, params.adminEmail]);
    const adminId = adminRes.rows[0].id;
    console.log('[Production Genesis]: 1/5 Admin server-side mapping created.');

    // --- RECORD 2: PRODUCT PRD-000003 ---
    const productInsertSql = `
      INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, origin_provenance, origin_responsible_id, origin_evidence)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, human_id, name, category, status;
    `;
    await client.query(productInsertSql, [
      'bf13ad7b-92cf-4e99-b4ea-ff3e86f0ffd7',
      'PRD-000003',
      'TRATTORIA EM CASA',
      'INFOPRODUTO',
      'Método comercial oficial',
      'ATIVO',
      false,
      'COMMERCIAL_PRODUCTION',
      'ORIGINAL',
      adminId,
      'Receitas Italianas Originais / Trattoria em Casa'
    ]);
    console.log('[Production Genesis]: 2/5 Product PRD-000003 created.');

    // --- RECORD 3: DIGITAL ASSET ---
    const assetInsertSql = `
      INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, storage_bucket, storage_path;
    `;
    await client.query(assetInsertSql, [
      'a34eb944-eb2b-41e1-bea9-b4e98f3dd425',
      'TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf',
      'SUPABASE',
      'digital-products',
      'digital-products/TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf',
      false
    ]);
    console.log('[Production Genesis]: 3/5 Digital asset metadata created.');

    // --- RECORD 4: OFFER OFF-000001 ---
    const offerInsertSql = `
      INSERT INTO offers (id, human_id, product_id, name, description, price, promotional_price, status, is_demo, data_provenance)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, human_id, name, price, status;
    `;
    await client.query(offerInsertSql, [
      'c127bfa3-5feb-4abb-a6f3-4d21f9ace192',
      'OFF-000001',
      'bf13ad7b-92cf-4e99-b4ea-ff3e86f0ffd7',
      'TRATTORIA EM CASA',
      'Acesso completo ao método e receitas exclusivas do Trattoria em Casa em formato digital com entrega imediata via Pix.',
      19.90,
      null,
      'ATIVA',
      false,
      'COMMERCIAL_PRODUCTION'
    ]);
    console.log('[Production Genesis]: 4/5 Offer OFF-000001 created.');

    // --- RECORD 5: OFFER-TO-ASSET MAPPING ---
    const mappingInsertSql = `
      INSERT INTO offer_digital_assets (offer_id, asset_id)
      VALUES ($1, $2)
      RETURNING offer_id, asset_id;
    `;
    await client.query(mappingInsertSql, [
      'c127bfa3-5feb-4abb-a6f3-4d21f9ace192',
      'a34eb944-eb2b-41e1-bea9-b4e98f3dd425'
    ]);
    console.log('[Production Genesis]: 5/5 Offer-to-asset mapping created.');

    // --- POST-INSPECTION ASSERTIONS ---
    const postUsers = await client.query('SELECT COUNT(*) FROM users');
    const postProducts = await client.query('SELECT COUNT(*) FROM products');
    const postOffers = await client.query('SELECT COUNT(*) FROM offers');
    const postAssets = await client.query('SELECT COUNT(*) FROM digital_assets');
    const postMappings = await client.query('SELECT COUNT(*) FROM offer_digital_assets');
    const postOrders = await client.query('SELECT COUNT(*) FROM orders');
    const postPayments = await client.query('SELECT COUNT(*) FROM payments');
    const postCustomers = await client.query('SELECT COUNT(*) FROM customers');
    const postQa = await client.query("SELECT COUNT(*) FROM products WHERE data_provenance = 'STAGING_SANDBOX_QA' OR is_demo = TRUE");

    if (
      parseInt(postUsers.rows[0].count, 10) !== 1 ||
      parseInt(postProducts.rows[0].count, 10) !== 1 ||
      parseInt(postOffers.rows[0].count, 10) !== 1 ||
      parseInt(postAssets.rows[0].count, 10) !== 1 ||
      parseInt(postMappings.rows[0].count, 10) !== 1 ||
      parseInt(postOrders.rows[0].count, 10) !== 0 ||
      parseInt(postPayments.rows[0].count, 10) !== 0 ||
      parseInt(postCustomers.rows[0].count, 10) !== 0 ||
      parseInt(postQa.rows[0].count, 10) !== 0
    ) {
      throw new Error('[ASSERTION FAILED]: Genesis post-write record count invariant violation.');
    }

    await client.query('COMMIT');
    console.log('[Production Genesis]: Transaction committed successfully (5/5 canonical records created).');
    return { success: true, writes: 5 };
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('[Production Genesis Error]:', err.message);
    throw err;
  }
}

export async function provisionProductionGenesis(): Promise<GenesisResult> {
  const env = validateGenesisPreconditions();
  const pool = new Pool({
    connectionString: env.databaseUrl,
    ssl: env.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    return await executeGenesisCore(client, {
      adminAuthUserId: env.adminAuthUserId,
      adminEmail: env.adminEmail,
      adminName: env.adminName,
      allowedDatabaseName: 'norqva_production'
    });
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  provisionProductionGenesis()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}