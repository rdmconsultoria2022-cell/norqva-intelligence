import { describe, it, expect, beforeEach } from 'vitest';
import { Pool } from 'pg';
import app from '../../index';
import { initializeDB } from '../../db/db';
import { runMigrations } from '../../db/migrations';
import { OpenAIStructuredProvider } from '../../agentic/ai/openAIStructuredProvider';
import { AIService } from '../../agentic/ai/aiService';
import { ProductIntelligenceAgentV1, ALLOWED_EPISTEMIC_STATUSES } from '../../agentic/agents/productIntelligenceAgent';
import { AgentOrchestratorEngine } from '../../agentic/orchestrator/orchestratorEngine';
import { PermissionLevel } from '../../agentic/contracts/agentContract';

describe('NORQVA — AGENTIC 1.2: REAL AI PROVIDER OPT-IN E2E TEST', () => {
  let pool: Pool;
  const hasRealApiKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().startsWith('sk-');

  beforeEach(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
  });

  it('Opt-In Real AI Execution Certification Test (gated by OPENAI_API_KEY)', async () => {
    if (!hasRealApiKey) {
      console.log('--------------------------------------------------------------------------------');
      console.log('[AGENTIC_1.2] REAL_E2E_TEST: SKIPPED (OPENAI_API_KEY not configured in environment)');
      console.log('[AGENTIC_1.2] REAL_AI_EXECUTION: NOT_CERTIFIED (Awaiting authorized credentials)');
      console.log('--------------------------------------------------------------------------------');
      expect(true).toBe(true);
      return;
    }

    // When OPENAI_API_KEY is available:
    const initialProducts = await pool.query('SELECT count(*) FROM products');
    const initialOffers = await pool.query('SELECT count(*) FROM offers');

    const realProvider = new OpenAIStructuredProvider({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    });
    AIService.getInstance().setProvider(realProvider);

    const orchestrator = new AgentOrchestratorEngine(pool);
    const session = await orchestrator.createSession({
      objective: 'Certificação de produto digital: mini-guia de massas italianas para iniciantes',
      tasks: [
        {
          human_id: 'TSK-REAL-E2E-01',
          agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
          permission_level: PermissionLevel.LEVEL_0,
          input_payload: {
            objective: 'Avaliar demanda e formato para micro-guia digital de culinária italiana básica.',
            market: 'Gastronomia Digital',
            country: 'BR',
            language: 'pt-BR'
          }
        }
      ]
    });

    const execution = await orchestrator.executeSession(session.session.id);

    expect(execution.session.status).toBe('COMPLETED');
    expect(execution.tasks[0].status).toBe('COMPLETED');

    const output = execution.tasks[0].output_payload;
    expect(output).toBeDefined();
    expect(output.summary).toBeDefined();
    expect(output.target_audience.pain_points.length).toBeGreaterThan(0);
    expect(output.opportunity_hypotheses.length).toBeGreaterThan(0);
    expect(ALLOWED_EPISTEMIC_STATUSES).toContain(output.opportunity_hypotheses[0].evidence_status);

    // Verify Real Evidence Telemetry
    const dbLogs = await pool.query('SELECT * FROM agent_execution_logs WHERE session_id = $1', [session.session.id]);
    expect(dbLogs.rows.length).toBe(1);
    const log = dbLogs.rows[0];

    expect(log.provider).toBe('openai');
    expect(log.tokens_input).toBeGreaterThan(0);
    expect(log.tokens_output).toBeGreaterThan(0);
    expect(log.tokens_total).toBeGreaterThan(0);
    expect(log.duration_ms).toBeGreaterThan(0);

    // Verify Zero Mutations
    const finalProducts = await pool.query('SELECT count(*) FROM products');
    const finalOffers = await pool.query('SELECT count(*) FROM offers');
    expect(finalProducts.rows[0].count).toBe(initialProducts.rows[0].count);
    expect(finalOffers.rows[0].count).toBe(initialOffers.rows[0].count);

    console.log('--------------------------------------------------------------------------------');
    console.log('[AGENTIC_1.2] REAL_E2E_TEST: PASS');
    console.log('[AGENTIC_1.2] REAL_AI_EXECUTION: YES');
    console.log(`[AGENTIC_1.2] PROVIDER: ${log.provider} | MODEL: ${log.model}`);
    console.log(`[AGENTIC_1.2] TOKENS_IN: ${log.tokens_input} | TOKENS_OUT: ${log.tokens_output} | LATENCY: ${log.duration_ms}ms`);
    console.log('--------------------------------------------------------------------------------');
  }, 30000);
});
