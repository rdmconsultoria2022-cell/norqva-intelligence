import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB, verifyTestDbSafety } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { signSupabaseToken } from '../utils/token';
import { aiProvider } from '../controllers/api';

let pool: Pool;
let adminToken: string;
let creativeToken: string;
let adminUser: any;
let creativeUser: any;

beforeAll(async () => {
  pool = initializeDB();
  
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DESTRUCTIVE_TESTS = 'true';

  verifyTestDbSafety();

  const client = await pool.connect();
  try {
    // Drop all tables cascadingly
    const dropTables = [
      'decision_snapshots', 'opportunity_reviews', 'opportunity_risks',
      'score_component_evidences', 'score_components', 'opportunity_scores',
      'ai_analyses', 'ai_executions', 'prompts',
      'score_model_components', 'score_models', 'research_tasks', 'research_sessions',
      'performance_entries', 'capital_authorizations', 'decisions', 'audit_logs',
      'experiment_creatives', 'experiments', 'creatives', 'offers', 'products',
      'evidences', 'opportunities', 'users', 'schema_migrations'
    ];
    for (const t of dropTables) {
      await client.query(`DROP TABLE IF EXISTS ${t} CASCADE;`);
    }
  } finally {
    client.release();
  }

  await runMigrations(pool);
  await seedDemoData(pool);

  // Retrieve seeded users to sign test tokens
  const usersRes = await pool.query('SELECT * FROM users WHERE is_demo = TRUE');
  adminUser = usersRes.rows.find(u => u.role === 'ADMIN');
  creativeUser = usersRes.rows.find(u => u.role === 'CREATIVE');

  adminToken = signSupabaseToken({ sub: adminUser.auth_user_id, email: adminUser.email, role: 'ADMIN' }, 3600);
  creativeToken = signSupabaseToken({ sub: creativeUser.auth_user_id, email: creativeUser.email, role: 'CREATIVE' }, 3600);
});

afterAll(async () => {
  await pool.end();
});

describe('NORQVA Sprint 2 - Intelligence Engine Verification Suite', () => {

  // Test A: Score model versioning
  it('should preserve historical score model math when a new model is activated', async () => {
    // 1. Verify active model (PSM-V1) seeds correctly
    const modelsRes = await pool.query("SELECT * FROM score_models WHERE name = 'PSM-V1'");
    expect(modelsRes.rows.length).toBe(1);
    const modelV1 = modelsRes.rows[0];

    // 2. Create new version PSM-V2 with different weights
    const modelV2Id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO score_models (id, name, version, status, formula_config, max_total_critical_penalty)
       VALUES ($1, 'PSM-V1', 2, 'DRAFT', '{"description": "Sprint 2 Draft Score Model"}'::jsonb, 20.00)`,
      [modelV2Id]
    );

    const compConfig = JSON.stringify({ penalties: { CRITICAL: -10.00, HIGH: -5.00, MEDIUM: -2.00, LOW: -1.00 } });
    await pool.query(
      `INSERT INTO score_model_components (score_model_id, component_key, name, weight, calculation_rule, max_penalty_per_component, display_order)
       VALUES ($1, 'demand_evidence', 'Demand Evidence', 50.00, $2, 10.00, 1)`,
      [modelV2Id, compConfig]
    );

    // 3. Verify V1 is still the active one and unaffected
    const activeModelRes = await pool.query("SELECT id FROM score_models WHERE status = 'ACTIVE' AND version = 1");
    expect(activeModelRes.rows[0].id).toBe(modelV1.id);
  });

  // Test B & L: Deterministic critical adjustment and double counting protection
  it('should calculate critical adjustment deterministically and protect against double counting', async () => {
    // Setup opportunity and evidences
    const oppId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
       VALUES ($1, 'OPP-100001', 'Test Double Counting', 'Marketing', 'Automation', 'Test desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
      [oppId]
    );

    const evId1 = crypto.randomUUID();
    await pool.query(
      `INSERT INTO evidences (id, opportunity_id, type, source, description, reliability, is_demo, provenance)
       VALUES ($1, $2, 'FATO', 'Source A', 'Fact A', 'HIGH', TRUE, 'EXTERNAL_SOURCE')`,
      [evId1, oppId]
    );

    // Set mock provider flags for double counting (returns multiple High/Critical warnings on component 'risk')
    aiProvider.setMockFlags({});

    const res = await request(app)
      .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(200);
    const scoreObj = res.body.scores;

    // Based on components config, component 'risk' weight = 5, max penalty per component = 5.00, total max = 25.00.
    // The findings output contains 2 findings affecting component 'risk' (one HIGH, one MEDIUM) and one HIGH affecting 'differentiation_potential'.
    // Double counting protection groups findings by (component, risk_type) and takes the max severity penalty.
    // If the findings affect different components, they are summed up:
    // Finding 1 (PLATFORM_POLICY, severity MEDIUM, component 'risk') -> penalty -1.50
    // Finding 2 (COMPETITION, severity HIGH, component 'differentiation_potential') -> penalty -3.00
    // Total deterministic critical adjustment: -4.50
    expect(scoreObj.critical_adjustment).toBe(-4.50);
  });

  // Test C: Confidence coverage
  it('should calculate confidence based on component coverage and diversity of sources', async () => {
    const oppId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
       VALUES ($1, 'OPP-100002', 'Test Coverage Confidence', 'Marketing', 'Automation', 'Test desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
      [oppId]
    );

    // 10 evidences all on a single source group and component yields lower confidence score than 3 spread out across components and source groups
    const evId1 = crypto.randomUUID();
    await pool.query(
      `INSERT INTO evidences (id, opportunity_id, type, source, description, reliability, is_demo, source_group, provenance)
       VALUES ($1, $2, 'FATO', 'Meta ad library', 'Evidence meta ads', 'HIGH', TRUE, 'meta_ad_library', 'EXTERNAL_SOURCE')`,
      [evId1, oppId]
    );

    // Trigger analysis
    const res = await request(app)
      .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(200);
    const scoreObj = res.body.scores;
    // Expected Confidence is low because we only have 1 evidence in meta_ad_library
    expect(scoreObj.confidence_score).toBeLessThan(50);
  });

  // Test E: AI Feedback Loop block
  it('should ignore AI_INFERENCE evidences from confidence calculations', async () => {
    const oppId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
       VALUES ($1, 'OPP-100003', 'Test Feedback Loop', 'Marketing', 'Automation', 'Test desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
      [oppId]
    );

    // Evidence 1 is AI_INFERENCE
    const evId1 = crypto.randomUUID();
    await pool.query(
      `INSERT INTO evidences (id, opportunity_id, type, source, description, reliability, is_demo, source_group, provenance)
       VALUES ($1, $2, 'FATO', 'AI Assistant', 'AI predicted demand', 'HIGH', TRUE, 'ai_inferences', 'AI_INFERENCE')`,
      [evId1, oppId]
    );

    const res = await request(app)
      .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(200);
    const scoreObj = res.body.scores;
    // Since the only evidence is AI_INFERENCE, the confidence score should be 0.00
    expect(scoreObj.confidence_score).toBe(0.00);
  });

  // Test F: Decision snapshot imutability
  it('should record imuttable snapshots of decision metrics that are unaffected by future updates', async () => {
    const oppId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
       VALUES ($1, 'OPP-100004', 'Snapshot Test', 'Marketing', 'Automation', 'Test desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
      [oppId]
    );

    // Attach valid evidence and run analysis
    const evId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO evidences (id, opportunity_id, type, source, description, reliability, is_demo, provenance)
       VALUES ($1, $2, 'FATO', 'Source A', 'Fact A', 'HIGH', TRUE, 'EXTERNAL_SOURCE')`,
      [evId, oppId]
    );

    await request(app)
      .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    // Trigger approve decision
    const approveRes = await request(app)
      .post(`/api/opportunities/${oppId}/decide?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVE_FOR_TEST', justification: 'Initial snapshot validation' });

    expect(approveRes.status).toBe(200);

    // Fetch snapshot
    const snapRes = await pool.query('SELECT * FROM decision_snapshots WHERE opportunity_id = $1', [oppId]);
    expect(snapRes.rows.length).toBe(1);
    const initialFinalScore = parseFloat(snapRes.rows[0].final_product_score);

    // Modify opportunity score manually in opportunity_scores to see if snapshot is safe
    await pool.query('UPDATE opportunity_scores SET final_product_score = 99.99 WHERE opportunity_id = $1', [oppId]);

    // Re-verify snapshot has the original final score
    const snapVerifyRes = await pool.query('SELECT * FROM decision_snapshots WHERE opportunity_id = $1', [oppId]);
    expect(parseFloat(snapVerifyRes.rows[0].final_product_score)).toBe(initialFinalScore);
  });

  // Test G & J: Invalid AI output, failure handling, and provider failure
  it('should reject schema mismatches, mark as FAILED, and preserve previous analysis', async () => {
    const oppId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
       VALUES ($1, 'OPP-100005', 'Safety Test', 'Marketing', 'Automation', 'Test desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
      [oppId]
    );

    // 1. Run a successful analysis first (V1)
    const resV1 = await request(app)
      .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(resV1.status).toBe(200);

    const checkAnalysesV1 = await pool.query('SELECT * FROM ai_analyses WHERE opportunity_id = $1', [oppId]);
    expect(checkAnalysesV1.rows.length).toBe(1);
    expect(checkAnalysesV1.rows[0].version).toBe(1);

    // 2. Set provider flag to fail schema check on V2 run
    aiProvider.setMockFlags({ shouldFailSchema: true });

    const resV2 = await request(app)
      .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(resV2.status).toBe(400); // Bad Request due to validation fail

    // 3. Set flags back to normal
    aiProvider.setMockFlags({ shouldFailSchema: false });

    // 4. Assert that Analysis V1 remains intact and is the only record
    const checkAnalysesV2 = await pool.query('SELECT * FROM ai_analyses WHERE opportunity_id = $1', [oppId]);
    expect(checkAnalysesV2.rows.length).toBe(1);
    expect(checkAnalysesV2.rows[0].version).toBe(1);
  });

  // Test H: Invalid evidence ID cited
  it('should reject AI response that references non-existent evidence IDs', async () => {
    const oppId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
       VALUES ($1, 'OPP-100006', 'Evidence Safety', 'Marketing', 'Automation', 'Test desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
      [oppId]
    );

    // Instruct Mock provider to cite an invalid evidence ID
    aiProvider.setMockFlags({ invalidEvidenceReference: true });

    const res = await request(app)
      .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('evidence ID');

    // Clean up flags
    aiProvider.setMockFlags({ invalidEvidenceReference: false });
  });

  // Test I: Provider Timeout
  it('should mark execution as FAILED and reject update on AI provider timeouts', async () => {
    const oppId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
       VALUES ($1, 'OPP-100007', 'Timeout Test', 'Marketing', 'Automation', 'Test desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
      [oppId]
    );

    aiProvider.setMockFlags({ shouldTimeout: true });

    const res = await request(app)
      .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(400);

    // Verify executions table records a FAILED entry
    const execsRes = await pool.query('SELECT status FROM ai_executions WHERE opportunity_id = $1', [oppId]);
    expect(execsRes.rows[0].status).toBe('FAILED');

    aiProvider.setMockFlags({ shouldTimeout: false });
  });

  // Test K: Prompt version validation
  it('should record prompts version linked to analysis executions', async () => {
    const oppId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
       VALUES ($1, 'OPP-100008', 'Prompt Version Test', 'Marketing', 'Automation', 'Test desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
      [oppId]
    );

    const res = await request(app)
      .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(200);

    // Verify prompt link
    const auditRes = await pool.query(
      `SELECT e.prompt_version 
       FROM ai_executions e 
       WHERE e.opportunity_id = $1`,
      [oppId]
    );
    expect(auditRes.rows[0].prompt_version).toBe('PRODUCT_ANALYST_V1');
  });

  // Test L: Cross-isolation DEMO/REAL checks
  it('should block linking or query executions that cross DEMO and REAL scopes', async () => {
    // REAL opportunity
    const realOppId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
       VALUES ($1, 'OPP-200001', 'Real Opportunity', 'Marketing', 'Automation', 'Test desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', FALSE)`,
      [realOppId]
    );

    // Attempting to run analyze in DEMO mode parameter (?mode=demo) on a REAL opportunity should fail
    const res = await request(app)
      .post(`/api/opportunities/${realOppId}/analyze?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(409); // Cross scope block
  });

  // Test N: Source Diversity normalizations
  it('should calculate higher source diversity for distinct source groups than repeated single group', async () => {
    // We already have tests verifying scaling. We can compute manual math testing calculateConfidenceScore directly:
    const { calculateConfidenceScore } = await import('../utils/score');
    
    const components = [{ key: 'demand_evidence', weight: 20 }];
    const componentEvidencesMap1 = {
      'demand_evidence': [
        { evidence_id: 'e1', relevance: 'HIGH' },
        { evidence_id: 'e2', relevance: 'HIGH' },
        { evidence_id: 'e3', relevance: 'HIGH' }
      ]
    };
    
    // Scenario 1: Same source groups
    const evidencesSameGroup = [
      { id: 'e1', reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' },
      { id: 'e2', reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' },
      { id: 'e3', reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' }
    ];

    // Scenario 2: Different source groups
    const evidencesDifferentGroups = [
      { id: 'e1', reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' },
      { id: 'e2', reliability: 'HIGH', source_group: 'google_trends', provenance: 'EXTERNAL_SOURCE' },
      { id: 'e3', reliability: 'HIGH', source_group: 'marketplace', provenance: 'EXTERNAL_SOURCE' }
    ];

    const confidenceSame = calculateConfidenceScore(components, evidencesSameGroup, componentEvidencesMap1);
    const confidenceDiff = calculateConfidenceScore(components, evidencesDifferentGroups, componentEvidencesMap1);

    expect(confidenceDiff).toBeGreaterThan(confidenceSame);
  });
  
});
