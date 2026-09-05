import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { AgentRegistry } from '../agentic/registry/agentRegistry';
import { PermissionEngine } from '../agentic/permissions/permissionEngine';
import { DAGEngine, DAGTaskNode } from '../agentic/dag/dagEngine';
import { MockAgentV1 } from '../agentic/agents/mockAgent';
import { AgentOrchestratorEngine } from '../agentic/orchestrator/orchestratorEngine';
import { AgentContract, PermissionLevel, validateAgentContract, validateAgentInput } from '../agentic/contracts/agentContract';

describe('NORQVA — AGENTIC FOUNDATION 1.0 SAFE IMPLEMENTATION', () => {
  let pool: Pool;
  let adminToken: string;
  let intelligenceToken: string;

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
      "INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.agentic@norqva.com', 'Admin Agentic', 'ADMIN', 'ACTIVE') ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING id, auth_user_id, email, role",
      [adminAuthId]
    );
    adminToken = signSupabaseToken({
      sub: adminRes.rows[0].auth_user_id,
      email: adminRes.rows[0].email,
      role: 'ADMIN'
    });

    const intAuthId = crypto.randomUUID();
    const intRes = await pool.query(
      "INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'intelligence.agentic@norqva.com', 'Intel Agentic', 'INTELLIGENCE', 'ACTIVE') ON CONFLICT (email) DO UPDATE SET role = 'INTELLIGENCE', status = 'ACTIVE' RETURNING id, auth_user_id, email, role",
      [intAuthId]
    );
    intelligenceToken = signSupabaseToken({
      sub: intRes.rows[0].auth_user_id,
      email: intRes.rows[0].email,
      role: 'INTELLIGENCE'
    });
  });

  describe('1. Agent Contract & Registry Unit Tests', () => {
    it('should have MOCK_AGENT_V1 registered by default in AgentRegistry', () => {
      const registry = AgentRegistry.getInstance();
      if (!registry.hasAgent('MOCK_AGENT_V1')) {
        registry.registerAgent(new MockAgentV1());
      }
      const agent = registry.getAgent('MOCK_AGENT_V1');
      expect(agent).toBeDefined();
      expect(agent.getContract().agent_id).toBe('MOCK_AGENT_V1');
      expect(agent.getContract().permission_level).toBe(PermissionLevel.LEVEL_0);
      expect(agent.getContract().allowed_tools).toContain('mock_tool_echo');
    });

    it('should validate input schema correctly against contract', () => {
      const mockAgent = new MockAgentV1();
      const contract = mockAgent.getContract();

      const validPayload = { objective: 'Analyze market trend' };
      const invalidPayload = { invalidField: 123 };

      const validResult = validateAgentInput(contract, validPayload);
      expect(validResult.valid).toBe(true);

      const invalidResult = validateAgentInput(contract, invalidPayload);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0]).toContain('Missing required input field: "objective"');
    });

    it('should reject registering invalid agent contract', () => {
      const registry = AgentRegistry.getInstance();
      const invalidAgent: any = {
        getContract: () => ({
          agent_id: '',
          agent_type: 'INVALID',
          version: '1.0.0'
        }),
        execute: async () => ({})
      };

      expect(() => {
        registry.registerAgent(invalidAgent);
      }).toThrow();
    });
  });

  describe('2. Permission Engine Unit Tests (Fail-Closed Enforcement)', () => {
    it('should permit LEVEL_0 execution', () => {
      const result = PermissionEngine.isPermissionAllowed(PermissionLevel.LEVEL_0);
      expect(result.allowed).toBe(true);
    });

    it('should BLOCK execution if requested level is LEVEL_1 (CREATE_DRAFT)', () => {
      const result = PermissionEngine.isPermissionAllowed(PermissionLevel.LEVEL_1);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds current system ceiling');
    });

    it('should BLOCK execution if requested level is LEVEL_3 (PRODUCTION_MUTATION) or LEVEL_4 (EXTERNAL_WRITE)', () => {
      const result3 = PermissionEngine.isPermissionAllowed(PermissionLevel.LEVEL_3);
      expect(result3.allowed).toBe(false);
      expect(result3.reason).toContain('LEVEL_0 (READ_ONLY)');

      const result4 = PermissionEngine.isPermissionAllowed(PermissionLevel.LEVEL_4);
      expect(result4.allowed).toBe(false);
      expect(result4.reason).toContain('LEVEL_0 (READ_ONLY)');
    });

    it('should validate tool access based on agent whitelist', () => {
      const allowed = PermissionEngine.validateToolAccess(['mock_tool_echo', 'mock_evidence'], 'mock_tool_echo');
      expect(allowed.allowed).toBe(true);

      const blocked = PermissionEngine.validateToolAccess(['mock_tool_echo'], 'unauthorized_meta_write');
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toContain('Tool execution blocked');
    });
  });

  describe('3. DAG Engine Unit Tests', () => {
    it('should correctly determine execution readiness in linear DAG', () => {
      const tasks: DAGTaskNode[] = [
        { task_id: 'task_1', agent_id: 'MOCK_AGENT_V1', depends_on: [], status: 'PENDING', input_payload: {}, retry_count: 0 },
        { task_id: 'task_2', agent_id: 'MOCK_AGENT_V1', depends_on: ['task_1'], status: 'PENDING', input_payload: {}, retry_count: 0 }
      ];

      const cycleCheck = DAGEngine.detectCycle(tasks);
      expect(cycleCheck.hasCycle).toBe(false);

      const next1 = DAGEngine.getNextExecutableTasks(tasks);
      expect(next1.length).toBe(1);
      expect(next1[0].task_id).toBe('task_1');

      tasks[0].status = 'COMPLETED';
      const next2 = DAGEngine.getNextExecutableTasks(tasks);
      expect(next2.length).toBe(1);
      expect(next2[0].task_id).toBe('task_2');
    });

    it('should detect cycles in a DAG', () => {
      const cyclicTasks: DAGTaskNode[] = [
        { task_id: 'task_a', agent_id: 'MOCK_AGENT_V1', depends_on: ['task_c'], status: 'PENDING', input_payload: {}, retry_count: 0 },
        { task_id: 'task_b', agent_id: 'MOCK_AGENT_V1', depends_on: ['task_a'], status: 'PENDING', input_payload: {}, retry_count: 0 },
        { task_id: 'task_c', agent_id: 'MOCK_AGENT_V1', depends_on: ['task_b'], status: 'PENDING', input_payload: {}, retry_count: 0 }
      ];

      const cycleCheck = DAGEngine.detectCycle(cyclicTasks);
      expect(cycleCheck.hasCycle).toBe(true);
      expect(cycleCheck.cyclePath).toBeDefined();
    });

    it('should cascade blocked status to downstream dependent tasks', () => {
      const tasks: DAGTaskNode[] = [
        { task_id: 'task_1', agent_id: 'MOCK_AGENT_V1', depends_on: [], status: 'BLOCKED', input_payload: {}, retry_count: 0 },
        { task_id: 'task_2', agent_id: 'MOCK_AGENT_V1', depends_on: ['task_1'], status: 'PENDING', input_payload: {}, retry_count: 0 }
      ];

      const updated = DAGEngine.cascadeBlockedTasks(tasks);
      expect(updated[1].status).toBe('BLOCKED');
      expect(updated[1].error_message).toContain('Cascaded block');
    });
  });

  describe('4. Mock Agent V1 Execution & AI Abstraction Telemetry', () => {
    it('should execute MockAgentV1 returning zero tokens, $0 cost, provider=MOCK', async () => {
      const mockAgent = new MockAgentV1();
      const execution = await mockAgent.execute({
        objective: 'Analyze audience saturation and creative fatigue'
      });

      expect(execution.status).toBe('COMPLETED');
      expect(execution.output_payload.summary).toContain('Analyze audience saturation');
      expect(execution.execution_details.provider).toBe('MOCK');
      expect(execution.execution_details.model).toBe('MOCK_V1');
      expect(execution.execution_details.input_tokens).toBe(0);
      expect(execution.execution_details.output_tokens).toBe(0);
      expect(execution.execution_details.estimated_cost).toBe(0);
    });
  });

  describe('5. Orchestrator Engine E2E Execution & DB Persistence', () => {
    it('should create and execute a valid multi-step DAG session and persist to DB', async () => {
      const orchestrator = new AgentOrchestratorEngine(pool);

      const created = await orchestrator.createSession({
        objective: 'E2E Multi-Step Pipeline Test',
        user_id: null,
        is_demo: false,
        tasks: [
          {
            human_id: 'TSK-001',
            agent_id: 'MOCK_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: { objective: 'Step 1 - Market Scan' },
            depends_on: []
          },
          {
            human_id: 'TSK-002',
            agent_id: 'MOCK_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: { objective: 'Step 2 - Pattern Synthesis' },
            depends_on: ['TSK-001']
          }
        ]
      });

      expect(created.session.status).toBe('PENDING');
      expect(created.tasks.length).toBe(2);

      const execution = await orchestrator.executeSession(created.session.id);
      expect(execution.session.status).toBe('COMPLETED');
      expect(execution.session.total_input_tokens).toBe(0);
      expect(execution.session.total_output_tokens).toBe(0);
      expect(Number(execution.session.total_estimated_cost)).toBe(0);
      expect(execution.tasks.every(t => t.status === 'COMPLETED')).toBe(true);

      // Verify in Database
      const dbSession = await pool.query('SELECT * FROM agent_orchestration_sessions WHERE id = $1', [created.session.id]);
      expect(dbSession.rows.length).toBe(1);
      expect(dbSession.rows[0].status).toBe('COMPLETED');

      const dbTasks = await pool.query('SELECT * FROM agent_tasks WHERE session_id = $1 ORDER BY created_at ASC', [created.session.id]);
      expect(dbTasks.rows.length).toBe(2);
      expect(dbTasks.rows[0].status).toBe('COMPLETED');
      expect(dbTasks.rows[1].status).toBe('COMPLETED');

      const dbLogs = await pool.query('SELECT * FROM agent_execution_logs WHERE session_id = $1', [created.session.id]);
      expect(dbLogs.rows.length).toBe(2);
    });

    it('should BLOCK session task when requested permission exceeds LEVEL_0', async () => {
      const orchestrator = new AgentOrchestratorEngine(pool);

      const created = await orchestrator.createSession({
        objective: 'Blocked Mutation Task Test',
        user_id: null,
        is_demo: false,
        tasks: [
          {
            human_id: 'TSK-BLOCKED-01',
            agent_id: 'MOCK_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_3,
            input_payload: { objective: 'Illegal Mutation' },
            depends_on: []
          }
        ]
      });

      const execution = await orchestrator.executeSession(created.session.id);
      expect(execution.session.status).toBe('BLOCKED');
      expect(execution.tasks[0].status).toBe('BLOCKED');
      expect(execution.tasks[0].error_message).toContain('Permission denied');

      // Verify in DB
      const dbTask = await pool.query('SELECT * FROM agent_tasks WHERE id = $1', [created.tasks[0].id]);
      expect(dbTask.rows[0].status).toBe('BLOCKED');
    });

    it('should detect DAG cycles and set session status to BLOCKED', async () => {
      const orchestrator = new AgentOrchestratorEngine(pool);

      const created = await orchestrator.createSession({
        objective: 'Cyclic DAG Execution',
        user_id: null,
        is_demo: false,
        tasks: [
          {
            human_id: 'TSK-CYC-A',
            agent_id: 'MOCK_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: { objective: 'A' },
            depends_on: ['TSK-CYC-B']
          },
          {
            human_id: 'TSK-CYC-B',
            agent_id: 'MOCK_AGENT_V1',
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: { objective: 'B' },
            depends_on: ['TSK-CYC-A']
          }
        ]
      });

      const execution = await orchestrator.executeSession(created.session.id);
      expect(execution.session.status).toBe('BLOCKED');
      expect(execution.tasks.every(t => t.status === 'BLOCKED')).toBe(true);
    });
  });

  describe('6. REST API Endpoints Verification', () => {
    it('POST /api/orchestration/sessions should execute pipeline and return 201', async () => {
      const res = await request(app)
        .post('/api/orchestration/sessions')
        .set('Authorization', 'Bearer ' + intelligenceToken)
        .send({
          objective: 'Analyze audience patterns via API',
          tasks: [
            {
              human_id: 'TSK-API-01',
              agent_id: 'MOCK_AGENT_V1',
              permission_level: 'LEVEL_0',
              input_payload: { objective: 'Analyze creative fatigue patterns' }
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.status).toBe('COMPLETED');
      expect(res.body.session.total_input_tokens).toBe(0);
      expect(Number(res.body.session.total_estimated_cost)).toBe(0);
      expect(res.body.tasks.length).toBe(1);
      expect(res.body.tasks[0].status).toBe('COMPLETED');
    });

    it('POST /api/orchestration/sessions should reject missing objective with 400', async () => {
      const res = await request(app)
        .post('/api/orchestration/sessions')
        .set('Authorization', 'Bearer ' + intelligenceToken)
        .send({
          objective: '',
          tasks: []
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('objective is required');
    });

    it('POST /api/orchestration/sessions should require authentication (401 without token)', async () => {
      const res = await request(app)
        .post('/api/orchestration/sessions')
        .send({
          objective: 'Unauthenticated Request'
        });

      expect(res.status).toBe(401);
    });

    it('GET /api/orchestration/sessions/:id should return existing session with 200', async () => {
      const createRes = await request(app)
        .post('/api/orchestration/sessions')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({
          objective: 'Session to Fetch Test'
        });

      const sessionId = createRes.body.session.id;

      const getRes = await request(app)
        .get('/api/orchestration/sessions/' + sessionId)
        .set('Authorization', 'Bearer ' + adminToken);

      expect(getRes.status).toBe(200);
      expect(getRes.body.session).toBeDefined();
      expect(getRes.body.session.id).toBe(sessionId);
      expect(getRes.body.tasks.length).toBe(1);
      expect(getRes.body.logs.length).toBeGreaterThan(0);
    });

    it('GET /api/orchestration/sessions/:id should return 404 for non-existent session', async () => {
      const fakeId = crypto.randomUUID();
      const res = await request(app)
        .get('/api/orchestration/sessions/' + fakeId)
        .set('Authorization', 'Bearer ' + adminToken);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Session not found');
    });
  });
});
