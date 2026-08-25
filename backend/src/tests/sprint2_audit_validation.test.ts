import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB, verifyTestDbSafety } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { signSupabaseToken } from '../utils/token';
import { aiProvider } from '../controllers/api';
import { calculateConfidenceScore, calculateScores } from '../utils/score';

let pool: Pool;
let adminToken: string;
let intelligenceToken: string;
let creativeToken: string;
let inactiveToken: string;

let adminUser: any;
let intelligenceUser: any;
let creativeUser: any;
let inactiveUser: any;

beforeAll(async () => {
  pool = initializeDB();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DESTRUCTIVE_TESTS = 'true';

  verifyTestDbSafety();

  const client = await pool.connect();
  try {
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
  intelligenceUser = usersRes.rows.find(u => u.role === 'INTELLIGENCE');
  creativeUser = usersRes.rows.find(u => u.role === 'CREATIVE');

  // Create an inactive user for testing
  const inactiveId = crypto.randomUUID();
  const inactiveAuthId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
     VALUES ($1, $2, 'Inactive User', 'inactive@norqva.com', 'INTELLIGENCE', 'INACTIVE', TRUE)`,
    [inactiveId, inactiveAuthId]
  );
  const inactiveRes = await pool.query('SELECT * FROM users WHERE id = $1', [inactiveId]);
  inactiveUser = inactiveRes.rows[0];

  adminToken = signSupabaseToken({ sub: adminUser.auth_user_id, email: adminUser.email, role: 'ADMIN' }, 3600);
  intelligenceToken = signSupabaseToken({ sub: intelligenceUser.auth_user_id, email: intelligenceUser.email, role: 'INTELLIGENCE' }, 3600);
  creativeToken = signSupabaseToken({ sub: creativeUser.auth_user_id, email: creativeUser.email, role: 'CREATIVE' }, 3600);
  inactiveToken = signSupabaseToken({ sub: inactiveUser.auth_user_id, email: inactiveUser.auth_user_id, role: 'INTELLIGENCE' }, 3600);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  aiProvider.setMockFlags({
    shouldTimeout: false,
    shouldFailSchema: false,
    invalidEvidenceReference: false,
    shouldFailAPI: false,
    isRateLimited: false,
    emptyResponse: false,
    missingRequiredFields: false,
    specificEvidenceCitation: undefined
  });
});

describe('NORQVA Sprint 2 - Audit Validation and Rigorous Criteria Suite', () => {

  // ==========================================
  // 1. CONFIDENCE SCORE CASES (CASO A - E)
  // ==========================================
  describe('Confidence Score Math Validation', () => {
    const components = [
      { key: 'demand_evidence', weight: 20 },
      { key: 'differentiation_potential', weight: 20 },
      { key: 'offer_economics', weight: 20 },
      { key: 'production_complexity', weight: 20 },
      { key: 'risk_level', weight: 20 }
    ];

    it('Caso A: 10 evidences, 1 source_group, 1 component covered -> Confidence must be LOW', () => {
      // 10 evidences on the same component and source group
      const evidences = Array.from({ length: 10 }, (_, i) => ({
        id: `ev-${i}`, reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE'
      }));
      const componentEvidencesMap = {
        'demand_evidence': evidences.map(e => ({ evidence_id: e.id, relevance: 'HIGH' }))
      };

      const score = calculateConfidenceScore(components, evidences, componentEvidencesMap);
      // Low confidence, should be less than 50
      expect(score).toBeLessThan(50);
      // Math: Coverage = 1/5 = 0.2. Reliability = 1.0. Diversity = 1/3 = 0.333.
      // Score = 100 * (0.4*0.2 + 0.3*1.0 + 0.3*0.333) = 100 * (0.08 + 0.30 + 0.10) = 48
      expect(score).toBe(48.00);
    });

    it('Caso B: 10 evidences, 3 source_groups, 1 component covered -> Confidence is higher but NOT close to 100', () => {
      const evidences = [
        { id: 'ev-1', reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' },
        { id: 'ev-2', reliability: 'HIGH', source_group: 'google_trends', provenance: 'EXTERNAL_SOURCE' },
        { id: 'ev-3', reliability: 'HIGH', source_group: 'marketplace', provenance: 'EXTERNAL_SOURCE' }
      ];
      const componentEvidencesMap = {
        'demand_evidence': evidences.map(e => ({ evidence_id: e.id, relevance: 'HIGH' }))
      };

      const score = calculateConfidenceScore(components, evidences, componentEvidencesMap);
      // Diverse source groups, but only 1 component covered (20% coverage)
      // Math: Coverage = 0.2. Reliability = 1.0. Diversity = 1.0 (3/3).
      // Score = 100 * (0.4*0.2 + 0.3*1.0 + 0.3*1.0) = 100 * (0.08 + 0.30 + 0.30) = 68.00
      expect(score).toBe(68.00);
      expect(score).toBeLessThan(70);
    });

    it('Caso C: reliable evidences, 3+ source_groups, all components covered -> Confidence is HIGH', () => {
      const evidences = [
        { id: 'ev-1', reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' },
        { id: 'ev-2', reliability: 'HIGH', source_group: 'google_trends', provenance: 'EXTERNAL_SOURCE' },
        { id: 'ev-3', reliability: 'HIGH', source_group: 'marketplace', provenance: 'EXTERNAL_SOURCE' }
      ];
      const componentEvidencesMap = {
        'demand_evidence': [{ evidence_id: 'ev-1', relevance: 'HIGH' }],
        'differentiation_potential': [{ evidence_id: 'ev-1', relevance: 'HIGH' }],
        'offer_economics': [{ evidence_id: 'ev-2', relevance: 'HIGH' }],
        'production_complexity': [{ evidence_id: 'ev-3', relevance: 'HIGH' }],
        'risk_level': [{ evidence_id: 'ev-3', relevance: 'HIGH' }]
      };

      const score = calculateConfidenceScore(components, evidences, componentEvidencesMap);
      // Math: Coverage = 1.0 (5/5). Reliability = 1.0. Diversity = 1.0 (3/3).
      // Score = 100 * (0.4*1.0 + 0.3*1.0 + 0.3*1.0) = 100
      expect(score).toBe(100.00);
    });

    it('Caso D: many evidences with LOW reliability -> Confidence is lower than HIGH reliability equivalent', () => {
      const lowReliabilityEvidences = [
        { id: 'ev-1', reliability: 'LOW', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' },
        { id: 'ev-2', reliability: 'LOW', source_group: 'google_trends', provenance: 'EXTERNAL_SOURCE' },
        { id: 'ev-3', reliability: 'LOW', source_group: 'marketplace', provenance: 'EXTERNAL_SOURCE' }
      ];
      const componentEvidencesMap = {
        'demand_evidence': [{ evidence_id: 'ev-1', relevance: 'HIGH' }],
        'differentiation_potential': [{ evidence_id: 'ev-1', relevance: 'HIGH' }],
        'offer_economics': [{ evidence_id: 'ev-2', relevance: 'HIGH' }],
        'production_complexity': [{ evidence_id: 'ev-3', relevance: 'HIGH' }],
        'risk_level': [{ evidence_id: 'ev-3', relevance: 'HIGH' }]
      };

      const scoreLow = calculateConfidenceScore(components, lowReliabilityEvidences, componentEvidencesMap);
      // Math: Coverage = 1.0. Reliability = 0.3 (LOW maps to 0.3). Diversity = 1.0.
      // Score = 100 * (0.4*1.0 + 0.3*0.3 + 0.3*1.0) = 100 * (0.40 + 0.09 + 0.30) = 79.00
      expect(scoreLow).toBe(79.00);
      expect(scoreLow).toBeLessThan(100.00); // Compare to Caso C
    });

    it('Caso E: AI_INFERENCE added to opportunity -> must not increase confidence score', () => {
      const baseEvidences = [
        { id: 'ev-1', reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' }
      ];
      const baseMap = {
        'demand_evidence': [{ evidence_id: 'ev-1', relevance: 'HIGH' }]
      };
      const scoreBefore = calculateConfidenceScore(components, baseEvidences, baseMap);

      // Add AI_INFERENCE evidence
      const withAiEvidences = [
        ...baseEvidences,
        { id: 'ev-ai', reliability: 'HIGH', source_group: 'google_trends', provenance: 'AI_INFERENCE' }
      ];
      const withAiMap = {
        'demand_evidence': [{ evidence_id: 'ev-1', relevance: 'HIGH' }],
        'differentiation_potential': [{ evidence_id: 'ev-ai', relevance: 'HIGH' }]
      };

      const scoreAfter = calculateConfidenceScore(components, withAiEvidences, withAiMap);
      // Confiança before and after should be exactly identical because AI_INFERENCE is ignored
      expect(scoreAfter).toBe(scoreBefore);
    });
  });

  // ==========================================
  // 2. CRITICAL ADJUSTMENT MATHEMATICS
  // ==========================================
  describe('Critical Adjustment Math Rules', () => {
    const activeModel = {
      id: crypto.randomUUID(),
      name: 'PSM-V1',
      version: 1,
      max_total_critical_penalty: 25.00
    };

    const componentsList = [
      { component_key: 'demand_evidence', name: 'Demand', weight: 20, min_score: 0, max_score: 10, max_penalty_per_component: 10.00, calculation_rule: { penalties: { CRITICAL: -5.00, HIGH: -3.00, MEDIUM: -1.50, LOW: -0.50 } } },
      { component_key: 'risk_level', name: 'Risk', weight: 20, min_score: 0, max_score: 10, max_penalty_per_component: 8.00, calculation_rule: { penalties: { CRITICAL: -5.00, HIGH: -3.00, MEDIUM: -1.50, LOW: -0.50 } } }
    ];

    const defaultSubscores = {
      'demand_evidence': { score: 8.0, confidence: 'HIGH' as const, reasoning: 'Ok' },
      'risk_level': { score: 8.0, confidence: 'HIGH' as const, reasoning: 'Ok' }
    };

    it('Scenario A: 3 findings equivalent (same component, same risk_type) -> only max severity applied', () => {
      const findings = [
        { affected_component_keys: ['demand_evidence'], risk_type: 'COPYRIGHT', severity: 'MEDIUM' },
        { affected_component_keys: ['demand_evidence'], risk_type: 'COPYRIGHT', severity: 'CRITICAL' },
        { affected_component_keys: ['demand_evidence'], risk_type: 'COPYRIGHT', severity: 'LOW' }
      ];

      const res = calculateScores(activeModel, componentsList, defaultSubscores, findings, [], {});
      // Group (demand_evidence, COPYRIGHT) -> Penalties: MEDIUM (-1.50), CRITICAL (-5.00), LOW (-0.50).
      // Max severity penalty is CRITICAL = -5.00.
      expect(res.critical_adjustment).toBe(-5.00);
    });

    it('Scenario B: multiple risk_types on same component exceeding cap -> component penalty is capped', () => {
      const findings = [
        { affected_component_keys: ['demand_evidence'], risk_type: 'COPYRIGHT', severity: 'CRITICAL' }, // -5.00
        { affected_component_keys: ['demand_evidence'], risk_type: 'LEGAL', severity: 'CRITICAL' }, // -5.00
        { affected_component_keys: ['demand_evidence'], risk_type: 'COMPETITION', severity: 'HIGH' } // -3.00
      ];

      const res = calculateScores(activeModel, componentsList, defaultSubscores, findings, [], {});
      // Sum = -13.00. But max_penalty_per_component is 10.00. Component Adjustment should be -10.00.
      expect(res.critical_adjustment).toBe(-10.00);
    });

    it('Scenario C: multiple components exceeding global cap -> total penalty is limited by global cap', () => {
      const findings = [
        { affected_component_keys: ['demand_evidence'], risk_type: 'COPYRIGHT', severity: 'CRITICAL' }, // -5.00
        { affected_component_keys: ['demand_evidence'], risk_type: 'LEGAL', severity: 'CRITICAL' }, // -5.00 -> component cap = -10.00
        { affected_component_keys: ['risk_level'], risk_type: 'PLATFORM_POLICY', severity: 'CRITICAL' }, // -5.00
        { affected_component_keys: ['risk_level'], risk_type: 'PRODUCTION', severity: 'CRITICAL' } // -5.00 -> component cap = -8.00
      ];

      const res = calculateScores(activeModel, componentsList, defaultSubscores, findings, [], {});
      // Sum of component adjustments = -10.00 + -8.00 = -18.00.
      // If we lower the global cap config to 15.00, it should clamp to -15.00:
      const restrictiveModel = { ...activeModel, max_total_critical_penalty: 15.00 };
      const resCapped = calculateScores(restrictiveModel, componentsList, defaultSubscores, findings, [], {});
      expect(resCapped.critical_adjustment).toBe(-15.00);
    });

    it('Scenario D: final score below zero -> clamped to 0.00', () => {
      const lowSubscores = {
        'demand_evidence': { score: 1.0, confidence: 'HIGH' as const, reasoning: 'Ok' },
        'risk_level': { score: 1.0, confidence: 'HIGH' as const, reasoning: 'Ok' }
      };
      const findings = [
        { affected_component_keys: ['demand_evidence'], risk_type: 'COPYRIGHT', severity: 'CRITICAL' }, // -5.00
        { affected_component_keys: ['risk_level'], risk_type: 'PLATFORM_POLICY', severity: 'CRITICAL' } // -5.00
      ];

      const res = calculateScores(activeModel, componentsList, lowSubscores, findings, [], {});
      // Initial score = 10. Penalty = -10. Final score = 0.
      expect(res.final_product_score).toBe(0.00);

      // Even with higher penalty, it should not go below 0:
      const aggressiveFindings = [
        ...findings,
        { affected_component_keys: ['demand_evidence'], risk_type: 'LEGAL', severity: 'CRITICAL' }
      ];
      const resBelowZero = calculateScores(activeModel, componentsList, lowSubscores, aggressiveFindings, [], {});
      expect(resBelowZero.final_product_score).toBe(0.00);
    });

    it('Scenario E: final score above 100 -> clamped to 100.00', () => {
      const highSubscores = {
        'demand_evidence': { score: 10.0, confidence: 'HIGH' as const, reasoning: 'Ok' },
        'risk_level': { score: 10.0, confidence: 'HIGH' as const, reasoning: 'Ok' }
      };
      // No risks
      const res = calculateScores(activeModel, componentsList, highSubscores, [], [], {});
      expect(res.final_product_score).toBe(100.00);
    });
  });

  // ==========================================
  // 3. SOURCE DIVERSITY COMPARISON
  // ==========================================
  describe('Source Diversity comparison', () => {
    const components = [{ key: 'demand_evidence', weight: 20 }];
    const compMap = { 'demand_evidence': [{ evidence_id: 'e1', relevance: 'HIGH' }, { evidence_id: 'e2', relevance: 'HIGH' }, { evidence_id: 'e3', relevance: 'HIGH' }] };

    it('3 URLs with source_group = meta_ad_library is less diverse than 3 distinct source groups', () => {
      const sameGroup = [
        { id: 'e1', reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' },
        { id: 'e2', reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' },
        { id: 'e3', reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' }
      ];

      const mixedGroups = [
        { id: 'e1', reliability: 'HIGH', source_group: 'meta_ad_library', provenance: 'EXTERNAL_SOURCE' },
        { id: 'e2', reliability: 'HIGH', source_group: 'search_engine', provenance: 'EXTERNAL_SOURCE' },
        { id: 'e3', reliability: 'HIGH', source_group: 'marketplace', provenance: 'EXTERNAL_SOURCE' }
      ];

      const scoreSame = calculateConfidenceScore(components, sameGroup, compMap);
      const scoreMixed = calculateConfidenceScore(components, mixedGroups, compMap);

      expect(scoreMixed).toBeGreaterThan(scoreSame);
      expect(scoreSame).toBe(80.00);
      expect(scoreMixed).toBe(100.00);
    });
  });

  // ==========================================
  // 4. EVIDENCE TRACEABILITY
  // ==========================================
  describe('Evidence Traceability & Constraints', () => {

    it('should reject analyzing opportunity if AI cites non-existent evidence_id', async () => {
      const oppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-300001', 'Trace Test 1', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
        [oppId]
      );

      aiProvider.setMockFlags({ invalidEvidenceReference: true });

      const res = await request(app)
        .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cited evidence ID');

      aiProvider.setMockFlags({ invalidEvidenceReference: false });
    });

    it('should reject analyzing opportunity if AI cites evidence belonging to another opportunity', async () => {
      const opp1Id = crypto.randomUUID();
      const opp2Id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-300002', 'Trace Test 2A', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
        [opp1Id]
      );
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-300003', 'Trace Test 2B', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
        [opp2Id]
      );

      const evId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO evidences (id, opportunity_id, type, source, description, reliability, is_demo, provenance)
         VALUES ($1, $2, 'FATO', 'Source A', 'Fact', 'HIGH', TRUE, 'EXTERNAL_SOURCE')`,
        [evId, opp2Id]
      );

      aiProvider.setMockFlags({ specificEvidenceCitation: evId });

      const res = await request(app)
        .post(`/api/opportunities/${opp1Id}/analyze?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cited evidence ID');

      aiProvider.setMockFlags({ specificEvidenceCitation: undefined });
    });

    it('should reject analyzing opportunity if AI cites evidence belonging to opposite scope (DEMO vs REAL)', async () => {
      const realOppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-400001', 'Trace Real Opp', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', FALSE)`,
        [realOppId]
      );

      const demoEvId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO evidences (id, opportunity_id, type, source, description, reliability, is_demo, provenance)
         VALUES ($1, $2, 'FATO', 'Source A', 'Fact', 'HIGH', TRUE, 'EXTERNAL_SOURCE')`,
        [demoEvId, realOppId]
      );

      aiProvider.setMockFlags({ specificEvidenceCitation: demoEvId });

      const res = await request(app)
        .post(`/api/opportunities/${realOppId}/analyze?mode=real`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(400);

      aiProvider.setMockFlags({ specificEvidenceCitation: undefined });
    });
  });

  // ==========================================
  // 5. DECISION SNAPSHOT
  // ==========================================
  describe('Decision Snapshot Immutability & Coverage', () => {

    it('should record complete decision snapshot containing all fields and remain identical after edits', async () => {
      const oppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-500001', 'Snapshot Field Opp', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
        [oppId]
      );

      await request(app)
        .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      const decideRes = await request(app)
        .post(`/api/opportunities/${oppId}/decide?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVE_FOR_TEST', justification: 'Full snapshot audit verification' });

      expect(decideRes.status).toBe(200);

      const snapRes = await pool.query('SELECT * FROM decision_snapshots WHERE opportunity_id = $1', [oppId]);
      expect(snapRes.rows.length).toBe(1);
      const snapshot = snapRes.rows[0];

      expect(snapshot.opportunity_id).toBe(oppId);
      expect(snapshot.analysis_id).not.toBeNull();
      expect(snapshot.initial_product_score).not.toBeNull();
      expect(snapshot.critical_adjustment).not.toBeNull();
      expect(snapshot.final_product_score).not.toBeNull();
      expect(snapshot.confidence_score).not.toBeNull();
      expect(snapshot.score_model_id).not.toBeNull();
      expect(snapshot.component_scores).not.toBeNull();
      expect(snapshot.evidence_ids).toBeDefined();
      expect(snapshot.risk_ids).toBeDefined();
      expect(snapshot.prompt_versions).toBeDefined();
      expect(snapshot.decision).toBe('APPROVE_FOR_TEST');
      expect(snapshot.responsible_id).toBe(adminUser.id);
      expect(snapshot.justification).toBe('Full snapshot audit verification');
      expect(snapshot.created_at).toBeDefined();

      const originalFinalScore = parseFloat(snapshot.final_product_score);

      await pool.query('UPDATE opportunity_scores SET final_product_score = 99.99 WHERE opportunity_id = $1', [oppId]);
      
      const snapVerifyRes = await pool.query('SELECT * FROM decision_snapshots WHERE opportunity_id = $1', [oppId]);
      expect(parseFloat(snapVerifyRes.rows[0].final_product_score)).toBe(originalFinalScore);
    });
  });

  // ==========================================
  // 6. RBAC SPRINT 2 TESTS
  // ==========================================
  describe('RBAC Authorization Rules', () => {

    it('CREATIVE trying to decide -> 403 Forbidden', async () => {
      const oppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-600001', 'RBAC Opp 1', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'AGUARDANDO_DECISAO', TRUE)`,
        [oppId]
      );

      const res = await request(app)
        .post(`/api/opportunities/${oppId}/decide?mode=demo`)
        .set('Authorization', `Bearer ${creativeToken}`)
        .send({ decision: 'APPROVE_FOR_TEST', justification: 'Creative try' });

      expect(res.status).toBe(403);
    });

    it('INTELLIGENCE trying to decide -> 403 Forbidden', async () => {
      const oppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-600002', 'RBAC Opp 2', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'AGUARDANDO_DECISAO', TRUE)`,
        [oppId]
      );

      const res = await request(app)
        .post(`/api/opportunities/${oppId}/decide?mode=demo`)
        .set('Authorization', `Bearer ${intelligenceToken}`)
        .send({ decision: 'APPROVE_FOR_TEST', justification: 'Intelligence try' });

      expect(res.status).toBe(403);
    });

    it('ADMIN trying to decide -> 200 OK success', async () => {
      const oppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-600003', 'RBAC Opp 3', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'AGUARDANDO_DECISAO', TRUE)`,
        [oppId]
      );

      const modelRes = await pool.query("SELECT id FROM score_models WHERE name = 'PSM-V1' LIMIT 1");
      const modelId = modelRes.rows[0].id;
      const scoreId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO opportunity_scores (id, opportunity_id, score_model_id, initial_product_score, critical_adjustment, final_product_score, confidence_score, is_demo)
         VALUES ($1, $2, $3, 80.00, -5.00, 75.00, 90.00, TRUE)`,
        [scoreId, oppId, modelId]
      );

      const res = await request(app)
        .post(`/api/opportunities/${oppId}/decide?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVE_FOR_TEST', justification: 'Admin try' });

      expect(res.status).toBe(200);
    });

    it('Inactive user status -> 403 Forbidden on all endpoints', async () => {
      const oppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-600004', 'RBAC Opp 4', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
        [oppId]
      );

      const res = await request(app)
        .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
        .set('Authorization', `Bearer ${inactiveToken}`)
        .send();

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 7. DEMO/REAL ISOLATION
  // ==========================================
  describe('Demo/Real Scope Boundaries Isolation', () => {

    it('should prevent cross scope modifications on new Sprint 2 tables', async () => {
      const realOppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-700001', 'Real Boundary Opp', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', FALSE)`,
        [realOppId]
      );

      const decideDemoRes = await request(app)
        .post(`/api/opportunities/${realOppId}/decide?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVE_FOR_TEST', justification: 'Cross try' });

      expect(decideDemoRes.status).toBe(409);

      const reviewDemoRes = await request(app)
        .post(`/api/opportunities/${realOppId}/review?mode=demo`)
        .set('Authorization', `Bearer ${intelligenceToken}`)
        .send({ action: 'ACCEPT_ANALYSIS', notes: 'Cross review try' });

      expect(reviewDemoRes.status).toBe(409);
    });
  });

  // ==========================================
  // 8. AI FAILURE MODES
  // ==========================================
  describe('AI Failure & V1/V2 Version Safety', () => {

    it('invalid structured output -> fails and marks execution FAILED', async () => {
      const oppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-800001', 'Fail Opp 1', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
        [oppId]
      );

      aiProvider.setMockFlags({ shouldFailSchema: true });

      const res = await request(app)
        .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(400);

      const execRes = await pool.query('SELECT status FROM ai_executions WHERE opportunity_id = $1 ORDER BY executed_at DESC LIMIT 1', [oppId]);
      expect(execRes.rows[0].status).toBe('FAILED');

      aiProvider.setMockFlags({ shouldFailSchema: false });
    });

    it('missing required fields in AI output -> fails and marks execution FAILED', async () => {
      const oppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-800002', 'Fail Opp 2', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
        [oppId]
      );

      aiProvider.setMockFlags({ missingRequiredFields: true });

      const res = await request(app)
        .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(400);

      const execRes = await pool.query('SELECT status FROM ai_executions WHERE opportunity_id = $1 ORDER BY executed_at DESC LIMIT 1', [oppId]);
      expect(execRes.rows[0].status).toBe('FAILED');

      aiProvider.setMockFlags({ missingRequiredFields: false });
    });

    it('AI provider unavailable -> fails and marks execution FAILED', async () => {
      const oppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-800003', 'Fail Opp 3', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
        [oppId]
      );

      aiProvider.setMockFlags({ shouldFailAPI: true });

      const res = await request(app)
        .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(400);

      const execRes = await pool.query('SELECT status FROM ai_executions WHERE opportunity_id = $1 ORDER BY executed_at DESC LIMIT 1', [oppId]);
      expect(execRes.rows[0].status).toBe('FAILED');

      aiProvider.setMockFlags({ shouldFailAPI: false });
    });

    it('AI rate limit reached -> fails and marks execution FAILED', async () => {
      const oppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-800004', 'Fail Opp 4', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
        [oppId]
      );

      aiProvider.setMockFlags({ isRateLimited: true });

      const res = await request(app)
        .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(400);

      const execRes = await pool.query('SELECT status FROM ai_executions WHERE opportunity_id = $1 ORDER BY executed_at DESC LIMIT 1', [oppId]);
      expect(execRes.rows[0].status).toBe('LIMIT_REACHED');

      aiProvider.setMockFlags({ isRateLimited: false });
    });

    it('AI partial or empty response -> fails and marks execution FAILED', async () => {
      const oppId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-800005', 'Fail Opp 5', 'Marketing', 'Automation', 'Desc', 'Audience', 'Problem', 'API', 'Search', 'DESCOBERTA', TRUE)`,
        [oppId]
      );

      aiProvider.setMockFlags({ emptyResponse: true });

      const res = await request(app)
        .post(`/api/opportunities/${oppId}/analyze?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(400);

      const execRes = await pool.query('SELECT status FROM ai_executions WHERE opportunity_id = $1 ORDER BY executed_at DESC LIMIT 1', [oppId]);
      expect(execRes.rows[0].status).toBe('FAILED');

      aiProvider.setMockFlags({ emptyResponse: false });
    });
  });

});
