import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as db from './db/db';
import { runMigrations } from './db/migrations';
import { seedDemoData } from './db/seed';
import { requireRole, requireRoleOrCheckoutToken } from './middleware/auth';
import { signSupabaseToken } from './utils/token';
import {
  getDashboard,
  getUsers,
  getOpportunities,
  createOpportunity,
  attachEvidence,
  approveOpportunity,
  getProducts,
  createProduct,
  updateProduct,
  getOffers,
  createOffer,
  updateOffer,
  getCreatives,
  createCreative,
  getExperiments,
  createExperiment,
  registerPerformance,
  authorizeCapital,
  getDecisions,
  createDecision,
  getAuditLogs,
  clearDemo,
  createResearchSession,
  createResearchTask,
  getScoreModels,
  overrideOpportunityScore,
  getOpportunityRanking,
  getOpportunityHistory,
  reviewOpportunity,
  decideOpportunity,
  analyzeOpportunity,
  getPublicOffer,
  createCustomer,
  getCustomers,
  createOrder,
  getOrders,
  getOrderById,
  checkoutPix,
  reconcilePayment,
  getPaymentById,
  webhookAsaas,
  getDeliveryTokens,
  downloadDelivery,
  createDigitalAsset,
  getDigitalAssets,
  updateDigitalAsset,
  linkOfferDigitalAsset,
  getOfferDigitalAssets,
  unlinkOfferDigitalAsset,
  getMe,
  getMetaConnectionStatus,
  validateMetaConnection,
  getMetaAdAccounts,
  getMetaCampaigns,
  getMetaAdSets,
  getMetaAds,
  getMetaInsights,
  syncMetaData,
  getExecutiveDashboard,
  migrateDestinationUrl,
  validatePaymentConnection,
  testStorageSign,
  testInsightsProbe
} from './controllers/api';

import { recordFunnelEvent, getFunnelEventsSummary } from './controllers/telemetryController';

import { securityHeaders } from './middleware/securityHeaders';
import { configureCors } from './middleware/cors';
import { requestIdMiddleware } from './middleware/requestId';
import { structuredLogger } from './middleware/logging';
import {
  generalRateLimiter,
  authRateLimiter,
  checkoutRateLimiter,
  orderStatusRateLimiter,
  deliveryRateLimiter,
  webhookRateLimiter
} from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { setupGracefulShutdown } from './utils/shutdown';
import { validateProductionEnvironment } from './utils/envValidation';

dotenv.config();

// Fail fast if essential production/staging environment variables are missing
validateProductionEnvironment();

// Abort if production is loaded with simulated auth mode
const authMode = process.env.AUTH_MODE || 'demo';
if (process.env.NODE_ENV === 'production' && authMode === 'demo') {
  console.error('[FATAL ERROR]: Cannot launch application in production with AUTH_MODE=demo. Exiting.');
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 5000;

// Trust Proxy Configuration (environment-aware for reverse proxy/load balancers)
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY;
  app.set('trust proxy', tp === 'true' ? true : tp === 'false' ? false : Number(tp) || tp);
} else {
  app.set('trust proxy', false);
}

// 1. Core Security & Observability Middlewares
app.use(securityHeaders());
app.use(configureCors());
app.use(requestIdMiddleware());
app.use(structuredLogger());
app.use(express.json({ limit: '1mb' }));

// Initialize DB Pool
const pool = db.initializeDB();
app.set('db', pool);

// 2. Liveness & Readiness Endpoints (outside rate limits)
app.get('/health', (_req, res) => {
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', async (_req, res) => {
  try {
    const currentPool = app.get('db') || pool;
    await currentPool.query('SELECT 1');
    return res.status(200).json({ status: 'ready', database: 'connected' });
  } catch (err) {
    return res.status(503).json({ status: 'unready', database: 'disconnected' });
  }
});

// 3. Apply Tiered Rate Limiters to API routes
app.use('/api/', generalRateLimiter);

// 4. Auth REST Endpoints (Supabase Auth emulation)
app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  // Emulation: accept password 'norqva123' for seeded active profiles
  if (password !== 'norqva123') {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  try {
    const userQuery = await pool.query(
      'SELECT id, auth_user_id, name, email, role, status FROM users WHERE email = $1',
      [email]
    );

    if (userQuery.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    const user = userQuery.rows[0];

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Usuário inativo no sistema.' });
    }

    // Sign JWT Token
    const token = signSupabaseToken({
      sub: user.auth_user_id,
      email: user.email,
      role: user.role
    });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login routing error:', err);
    return res.status(500).json({ error: 'Erro interno no servidor ao autenticar.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  // Stateless token logout
  return res.status(200).json({ message: 'Sessão encerrada com sucesso.' });
});

// 2. Register REST Routes (Sync mounting, so tests can see them immediately)
app.get('/api/dashboard', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getDashboard);
app.get('/api/executive/dashboard', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getExecutiveDashboard);
app.get('/api/users', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getUsers);
app.get('/api/me', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getMe);

app.get('/api/opportunities', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getOpportunities);
app.post('/api/opportunities', requireRole(['INTELLIGENCE', 'ADMIN']), createOpportunity);
app.post('/api/opportunities/:id/evidence', requireRole(['INTELLIGENCE', 'ADMIN']), attachEvidence);
app.post('/api/opportunities/:id/approve', requireRole(['INTELLIGENCE', 'ADMIN']), approveOpportunity);

// Sprint 2 Intelligence Engine Endpoints
app.post('/api/research-sessions', requireRole(['INTELLIGENCE', 'ADMIN']), createResearchSession);
app.post('/api/research-tasks', requireRole(['INTELLIGENCE', 'ADMIN']), createResearchTask);
app.get('/api/score-models', requireRole(['ADMIN']), getScoreModels);
app.post('/api/opportunities/:id/override', requireRole(['ADMIN']), overrideOpportunityScore);
app.get('/api/opportunities/ranking', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getOpportunityRanking);
app.get('/api/opportunities/:id/history', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getOpportunityHistory);
app.post('/api/opportunities/:id/review', requireRole(['INTELLIGENCE', 'ADMIN']), reviewOpportunity);
app.post('/api/opportunities/:id/decide', requireRole(['ADMIN']), decideOpportunity);
app.post('/api/opportunities/:id/analyze', requireRole(['INTELLIGENCE', 'ADMIN']), analyzeOpportunity);

app.get('/api/products', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getProducts);
app.post('/api/products', requireRole(['PRODUCT', 'ADMIN']), createProduct);
app.put('/api/products/:id', requireRole(['PRODUCT', 'ADMIN']), updateProduct);

app.get('/api/offers', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getOffers);
app.post('/api/offers', requireRole(['PRODUCT', 'ADMIN']), createOffer);
app.put('/api/offers/:id', requireRole(['PRODUCT', 'ADMIN']), updateOffer);

app.get('/api/creatives', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getCreatives);
app.post('/api/creatives', requireRole(['CREATIVE', 'ADMIN']), createCreative);

app.get('/api/experiments', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getExperiments);
app.post('/api/experiments', requireRole(['PERFORMANCE', 'ADMIN']), createExperiment);
app.post('/api/experiments/:id/performance', requireRole(['PERFORMANCE', 'ADMIN']), registerPerformance);

app.post('/api/experiments/:id/capital', requireRole(['ADMIN']), authorizeCapital);

app.get('/api/decisions', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getDecisions);
app.post('/api/decisions', requireRole(['ADMIN']), createDecision);

app.get('/api/audit', requireRole(['ADMIN']), getAuditLogs);
app.post('/api/config/clear-demo', requireRole(['ADMIN']), clearDemo);

// Customers and Checkout endpoints (Sprint 2.5B & Public Commerce V1)
app.get('/api/public/offers/:humanId', orderStatusRateLimiter, getPublicOffer);
app.post('/api/public/telemetry/events', generalRateLimiter, recordFunnelEvent);
app.get('/api/admin/telemetry/funnel-summary', requireRole(['ADMIN', 'INTELLIGENCE', 'PERFORMANCE', 'OPERATIONS']), getFunnelEventsSummary);
app.post('/api/customers', checkoutRateLimiter, createCustomer);
app.get('/api/customers', requireRole(['ADMIN', 'OPERATIONS', 'PERFORMANCE', 'INTELLIGENCE']), getCustomers);
app.post('/api/checkout', checkoutRateLimiter, createOrder);
app.get('/api/orders', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getOrders);
app.get('/api/orders/:id', orderStatusRateLimiter, requireRoleOrCheckoutToken(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getOrderById);

// Sprint 2.5C Payment & Pix endpoints
app.post('/api/checkout/orders/:orderId/pix', checkoutRateLimiter, checkoutPix);
app.post('/api/payments/:id/reconcile', requireRole(['ADMIN', 'OPERATIONS']), reconcilePayment);
app.get('/api/payments/:id', requireRole(['ADMIN', 'OPERATIONS']), getPaymentById);

// Sprint 2.5D Webhook & Digital Deliveries endpoints
app.post('/api/webhooks/asaas', webhookRateLimiter, webhookAsaas);
app.get('/api/checkout/orders/:orderId/delivery-tokens', deliveryRateLimiter, getDeliveryTokens);
app.get('/api/delivery/:token', deliveryRateLimiter, downloadDelivery);

// Digital Assets Administration endpoints
app.post('/api/digital-assets', requireRole(['ADMIN']), createDigitalAsset);
app.get('/api/digital-assets', requireRole(['ADMIN', 'OPERATIONS']), getDigitalAssets);
app.put('/api/digital-assets/:id', requireRole(['ADMIN']), updateDigitalAsset);
app.post('/api/offers/:id/digital-assets', requireRole(['ADMIN']), linkOfferDigitalAsset);
app.get('/api/offers/:id/digital-assets', requireRole(['ADMIN', 'OPERATIONS', 'PRODUCT', 'INTELLIGENCE']), getOfferDigitalAssets);
app.delete('/api/offers/:id/digital-assets/:assetId', requireRole(['ADMIN']), unlinkOfferDigitalAsset);

// Payment Core Diagnostics (Admin Read-Only)
app.get('/api/admin/payments/validate-connection', requireRole(['ADMIN']), validatePaymentConnection);
app.get('/api/admin/storage/test-sign', requireRole(['ADMIN']), testStorageSign);
app.get('/api/admin/meta/test-insights-probe', requireRole(['ADMIN']), testInsightsProbe);

// Meta Acquisition Core (Phase A - Read-Only Ingestion)
app.get('/api/meta/connection/status', requireRole(['ADMIN']), getMetaConnectionStatus);
app.post('/api/meta/connection/validate', requireRole(['ADMIN']), validateMetaConnection);
app.get('/api/meta/ad-accounts', requireRole(['ADMIN']), getMetaAdAccounts);
app.get('/api/meta/campaigns', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getMetaCampaigns);
app.get('/api/meta/adsets', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getMetaAdSets);
app.get('/api/meta/ads', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getMetaAds);
app.get('/api/meta/insights', requireRole(['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS']), getMetaInsights);
app.post('/api/meta/sync', requireRole(['ADMIN']), syncMetaData);
app.post('/api/meta/migrate-destination-url', requireRole(['ADMIN']), migrateDestinationUrl);

// 5. Centralized Error Handler (Must be registered last)
app.use(errorHandler());

async function startServer() {
  try {
    console.log('Running versioned migrations...');
    await runMigrations(pool);

    if (process.env.SEED_DEMO_DATA === 'true') {
      console.log('Seeding demo data (SEED_DEMO_DATA=true)...');
      await seedDemoData(pool);
    } else {
      console.log('Skipping demo data seeding (SEED_DEMO_DATA is not enabled).');
    }

    const server = app.listen(port, () => {
      console.log(`[Server] NORQVA Hardened Core V1 running on port ${port}`);
    });

    setupGracefulShutdown(server, pool);
  } catch (err) {
    console.error('[Server] Initialization failed:', err);
    process.exit(1);
  }
}

const isTestEnv = process.env.NODE_ENV === 'test';
const runTestServer = process.env.RUN_TEST_SERVER === 'true';

// RUN_TEST_SERVER is only effective when NODE_ENV === 'test'
const shouldStart = (!isTestEnv) || (isTestEnv && runTestServer);

if (shouldStart) {
  startServer();
}

export default app;
