import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { AgentRegistry } from '../agentic/registry/agentRegistry';
import { PermissionEngine } from '../agentic/permissions/permissionEngine';
import { ProductIntelligenceAgentV1, ALLOWED_EPISTEMIC_STATUSES } from '../agentic/agents/productIntelligenceAgent';
import { AgentOrchestratorEngine } from '../agentic/orchestrator/orchestratorEngine';
import { AIService, DeterministicEpistemicProvider, MAX_DEFAULT_TOKEN_BUDGET } from '../agentic/ai/aiService';
import { PermissionLevel } from '../agentic/contracts/agentContract';

describe('NORQVA — AGENTIC 1.1 PRODUCT INTELLIGENCE AGENT (READ-ONLY LEVEL_0)', () => {
  let pool: Pool;
  let adminToken: string;
  let intelligenceToken: string;
  let provider: DeterministicEpistemicProvider;

  beforeEach(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);

    // Ensure telemetry columns exist in test database
    await pool.query(`
      ALTER TABLE agent_orchestration_sessions ADD COLUMN IF NOT EXISTS total_input_tokens INT NOT NULL DEFAULT 0;
      ALTER TABLE agent_orchestration_sessions ADD COLUMN IF NOT EXISTS total_output_tokens INT NOT NULL DEFAULT 0;
      ALTER TABLE agent_orchestration_sessions ADD COLUMN IF NOT EXISTS total_estimated_cost NUMERIC(10, 6) NOT NULL DEFAULT 0.000000;
    `);

    const adminAuthId = crypto.randomUUID();
    const adminRes = await pool.query(
      "INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.agentic11@norqva.com', 'Admin Agentic 1.1', 'ADMIN', 'ACTIVE') ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING id, auth_user_id, email, role",
      [adminAuthId]
    );
    adminToken = signSupabaseToken({
      sub: adminRes.rows[0].auth_user_id,
      email: adminRes.rows[0].email,
      role: 'ADMIN'
    });

    const intAuthId = crypto.randomUUID();
    const intRes = await pool.query(
      "INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'intel.agentic11@norqva.com', 'Intel Agentic 1.1', 'INTELLIGENCE', 'ACTIVE') ON CONFLICT (email) DO UPDATE SET role = 'INTELLIGENCE', status = 'ACTIVE' RETURNING id, auth_user_id, email, role",
      [intAuthId]
    );
    intelligenceToken = signSupabaseToken({
      sub: intRes.rows[0].auth_user_id,
      email: intRes.rows[0].email,
      role: 'INTELLIGENCE'
    });

    provider = new DeterministicEpistemicProvider();
    AIService.getInstance().setProvider(provider);

    const registry = AgentRegistry.getInstance();
    if (!registry.hasAgent('PRODUCT_INTELLIGENCE_AGENT_V1')) {
      registry.registerAgent(new ProductIntelligenceAgentV1());
    }
  });

  afterEach(() => {
    provider.setFailureMode(null);
  });

  describe('1. Contract, Schema & Epistemic Validation Unit Tests', () => {
    it('should verify contract metadata, permission level LEVEL_0 and allowed tools', () => {
      const agent = new ProductIntelligenceAgentV1();
      const contract = agent.getContract();

      expect(contract.agent_id).toBe('PRODUCT_INTELLIGENCE_AGENT_V1');
      expect(contract.agent_type).toBe('INTELLIGENCE');
      expect(contract.permission_level).toBe(PermissionLevel.LEVEL_0);
      expect(contract.allowed_tools).toContain('internal_context_reader');
      expect(contract.allowed_tools).toContain('opportunity_reader');
      expect(contract.allowed_writes.length).toBe(0);
      expect(contract.prohibited_actions).toContain('commercial_mutation');
      expect(contract.prohibited_actions).toContain('meta_write');
    });

    it('should validate structured output and epistemic labeling correctly', () => {
      const agent = new ProductIntelligenceAgentV1();

      const validOutput = {
        summary: 'Diagnóstico de viabilidade de produto',
        target_audience: {
          description: 'Público interessado em culinária',
          pain_points: ['Falta de tempo', 'Insegurança nas receitas'],
          desired_outcomes: ['Praticidade e sabor']
        },
        opportunity_hypotheses: [
          {
            title: 'Busca por praticidade',
            description: 'Alta demanda por guias rápidos',
            confidence: 0.85,
            evidence_status: 'INFERENCE'
          }
        ],
        product_hypotheses: [
          {
            concept: 'Guia Prático de Massas',
            value_proposition: 'Aprenda 10 receitas em 30 min',
            suggested_format: 'DIGITAL_PDF',
            pricing_hypothesis_brl: 19.90
          }
        ],
        risks: ['Concorrência de canais gratuitos'],
        recommended_next_research: ['Validar anúncios com foco em Carbonara']
      };

      const result = agent.validateOutputStructure(validOutput);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid epistemic status labels', () => {
      const agent = new ProductIntelligenceAgentV1();

      const invalidEpistemicOutput = {
        summary: 'Diagnóstico com status epistemico inválido',
        target_audience: {
          description: 'Público geral',
          pain_points: ['Ponto A'],
          desired_outcomes: ['Objetivo B']
        },
        opportunity_hypotheses: [
          {
            title: 'Hipótese não rotulada corretamente',
            description: 'Descrição qualquer',
            confidence: 0.85,
            evidence_status: 'UNVERIFIED_RUMOR'
          }
        ],
        product_hypotheses: [
          {
            concept: 'Conceito',
            value_proposition: 'Proposta',
            suggested_format: 'PDF',
            pricing_hypothesis_brl: 29.90
          }
        ],
        risks: ['Risco 1'],
        recommended_next_research: ['Pesquisa 1']
      };

      const result = agent.validateOutputStructure(invalidEpistemicOutput);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('is invalid. Must be one of:');
    });
  });

  describe('2. E2E Real / Controlled Execution & Zero-Mutation Verification', () => {
    it('should execute PRODUCT_INTELLIGENCE_AGENT_V1 generating structured diagnosis with token telemetry and zero commercial mutations', async () => {
      const initialProducts = await pool.query('SELECT count(*) FROM products');
      const initialOffers = await pool.query('SELECT count(*) FROM offers');
      const initialCustomers = await pool.query('SELECT count(*) FROM customers');
      const initialOrders = await pool.query('SELECT count(*) FROM orders');

      const orchestrator = new AgentOrchestratorEngine(pool);

      const created = await orchestrator.createSession({
        objective: 'Avaliar a hipótese de um produto digital brasileiro sobre técnicas de massas e molhos italianos para iniciantes.',
        user_id: null,
        is_demo: false,
        tasks: [
          {
            human_id: 'TSK-PI-001',
            agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: {
              objective: 'Avaliar a hipótese de um produto digital brasileiro sobre técnicas de massas e molhos italianos para iniciantes.',
              market: 'Gastronomia Digital',
              country: 'BR',
              language: 'pt-BR'
            },
            depends_on: []
          }
        ]
      });

      expect(created.session).toBeDefined();
      expect(created.tasks.length).toBe(1);

      const execution = await orchestrator.executeSession(created.session.id);
      expect(execution.session.status).toBe('COMPLETED');
      expect(execution.tasks[0].status).toBe('COMPLETED');

      const output = execution.tasks[0].output_payload;
      expect(output).toBeDefined();
      expect(output.summary).toContain('culinária italiana');
      expect(output.target_audience.pain_points.length).toBeGreaterThan(0);
      expect(output.opportunity_hypotheses.length).toBeGreaterThan(0);
      expect(ALLOWED_EPISTEMIC_STATUSES).toContain(output.opportunity_hypotheses[0].evidence_status);
      expect(output.product_hypotheses[0].pricing_hypothesis_brl).toBeGreaterThan(0);

      // Verify Telemetry
      expect(execution.session.total_input_tokens).toBeGreaterThan(0);
      expect(execution.session.total_output_tokens).toBeGreaterThan(0);
      expect(Number(execution.session.total_estimated_cost)).toBeGreaterThanOrEqual(0);

      // Verify Execution Logs in DB
      const dbLogs = await pool.query('SELECT * FROM agent_execution_logs WHERE session_id = $1', [created.session.id]);
      expect(dbLogs.rows.length).toBe(1);
      expect(['NORQVA_AI_ENGINE', 'deterministic_epistemic']).toContain(dbLogs.rows[0].provider);
      expect(dbLogs.rows[0].model).toBe('norqva-intelligence-v1');
      expect(dbLogs.rows[0].tokens_input).toBeGreaterThan(0);
      expect(dbLogs.rows[0].tokens_output).toBeGreaterThan(0);
      expect(dbLogs.rows[0].duration_ms).toBeGreaterThan(0);

      // Verify ZERO Commercial Mutations
      const finalProducts = await pool.query('SELECT count(*) FROM products');
      const finalOffers = await pool.query('SELECT count(*) FROM offers');
      const finalCustomers = await pool.query('SELECT count(*) FROM customers');
      const finalOrders = await pool.query('SELECT count(*) FROM orders');

      expect(finalProducts.rows[0].count).toBe(initialProducts.rows[0].count);
      expect(finalOffers.rows[0].count).toBe(initialOffers.rows[0].count);
      expect(finalCustomers.rows[0].count).toBe(initialCustomers.rows[0].count);
      expect(finalOrders.rows[0].count).toBe(initialOrders.rows[0].count);
    });

    it('POST /api/orchestration/sessions should execute PRODUCT_INTELLIGENCE_AGENT_V1 via REST endpoint', async () => {
      const res = await request(app)
        .post('/api/orchestration/sessions')
        .set('Authorization', 'Bearer ' + intelligenceToken)
        .send({
          objective: 'Avaliar a hipótese de um produto digital brasileiro sobre técnicas de massas e molhos italianos para iniciantes.',
          tasks: [
            {
              human_id: 'TSK-REST-PI-01',
              agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
              permission_level: 'LEVEL_0',
              input_payload: {
                objective: 'Avaliar a hipótese de um produto digital brasileiro sobre técnicas de massas e molhos italianos para iniciantes.'
              }
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.session.status).toBe('COMPLETED');
      expect(res.body.tasks[0].status).toBe('COMPLETED');
      expect(res.body.tasks[0].output_payload.summary).toBeDefined();
      expect(res.body.session.total_input_tokens).toBeGreaterThan(0);
    });
  });

  describe('3. Fail-Closed Resilience & Security Guard Tests', () => {
    it('A. AI Provider service unavailable => Fails closed (BLOCKED/FAILED)', async () => {
      provider.setFailureMode('UNAVAILABLE');

      const orchestrator = new AgentOrchestratorEngine(pool);
      const created = await orchestrator.createSession({
        objective: 'Test Provider Unavailable',
        tasks: [
          {
            agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: { objective: 'Test Provider Unavailable' }
          }
        ]
      });

      const execution = await orchestrator.executeSession(created.session.id);
      expect(execution.session.status).toBe('FAILED');
      expect(execution.tasks[0].status).toBe('FAILED');
      expect(execution.tasks[0].error_message).toContain('503 Service Unavailable');
    });

    it('B. AI Provider timeout => Fails closed (BLOCKED/FAILED)', async () => {
      provider.setFailureMode('TIMEOUT');

      const orchestrator = new AgentOrchestratorEngine(pool);
      const created = await orchestrator.createSession({
        objective: 'Test Provider Timeout',
        tasks: [
          {
            agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: { objective: 'Test Provider Timeout' },
            timeout_ms: 50
          }
        ]
      });

      const execution = await orchestrator.executeSession(created.session.id);
      expect(execution.session.status).toBe('FAILED');
      expect(execution.tasks[0].status).toBe('FAILED');
      expect(execution.tasks[0].error_message?.toLowerCase()).toContain('time');
    });

    it('C. Malformed JSON => Retries and blocks execution fail-closed', async () => {
      provider.setFailureMode('MALFORMED_JSON');

      const orchestrator = new AgentOrchestratorEngine(pool);
      const created = await orchestrator.createSession({
        objective: 'Test Malformed JSON',
        tasks: [
          {
            agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: { objective: 'Test Malformed JSON' }
          }
        ]
      });

      const execution = await orchestrator.executeSession(created.session.id);
      expect(execution.session.status).toBe('FAILED');
      expect(execution.tasks[0].status).toBe('FAILED');
      expect(execution.tasks[0].error_message).toContain('Failed to parse AI response as JSON');
    });

    it('D. Schema invalid => Retries and blocks execution fail-closed', async () => {
      provider.setFailureMode('INVALID_SCHEMA');

      const orchestrator = new AgentOrchestratorEngine(pool);
      const created = await orchestrator.createSession({
        objective: 'Test Invalid Schema',
        tasks: [
          {
            agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: { objective: 'Test Invalid Schema' }
          }
        ]
      });

      const execution = await orchestrator.executeSession(created.session.id);
      expect(execution.session.status).toBe('BLOCKED');
      expect(execution.tasks[0].status).toBe('BLOCKED');
      expect(execution.tasks[0].error_message).toContain('Output schema/epistemic violation');
    });

    it('E. Invalid epistemic status => Blocks execution fail-closed', async () => {
      provider.setFailureMode('INVALID_EPISTEMIC');

      const orchestrator = new AgentOrchestratorEngine(pool);
      const created = await orchestrator.createSession({
        objective: 'Test Invalid Epistemic Status',
        tasks: [
          {
            agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: { objective: 'Test Invalid Epistemic Status' }
          }
        ]
      });

      const execution = await orchestrator.executeSession(created.session.id);
      expect(execution.session.status).toBe('BLOCKED');
      expect(execution.tasks[0].status).toBe('BLOCKED');
      expect(execution.tasks[0].error_message).toContain('UNKNOWN_STATUS_LABEL');
    });

    it('F. Unauthorized tool execution => Blocked fail-closed by PermissionEngine', () => {
      const agent = new ProductIntelligenceAgentV1();
      const contract = agent.getContract();

      const check = PermissionEngine.validateToolAccess(contract.allowed_tools, 'unauthorized_meta_write');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Tool execution blocked');
    });

    it('G. Requesting permission level > LEVEL_0 => Blocked fail-closed by PermissionEngine', () => {
      const checkL1 = PermissionEngine.isPermissionAllowed(PermissionLevel.LEVEL_1);
      expect(checkL1.allowed).toBe(false);
      expect(checkL1.reason).toContain('exceeds current system ceiling');

      const checkL3 = PermissionEngine.isPermissionAllowed(PermissionLevel.LEVEL_3);
      expect(checkL3.allowed).toBe(false);
    });

    it('H. Token budget overflow => Blocks execution fail-closed', async () => {
      provider.setFailureMode('TOKEN_OVERFLOW');

      const orchestrator = new AgentOrchestratorEngine(pool);
      const created = await orchestrator.createSession({
        objective: 'Test Token Overflow',
        tasks: [
          {
            agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: { objective: 'Test Token Overflow' }
          }
        ]
      });

      const execution = await orchestrator.executeSession(created.session.id);
      expect(execution.session.status).toBe('BLOCKED');
      expect(execution.tasks[0].status).toBe('BLOCKED');
      expect(execution.tasks[0].error_message).toContain('Token budget exceeded');
    });
  });
});
