import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { OpenAIStructuredProvider } from '../agentic/ai/openAIStructuredProvider';
import { AIService, DeterministicEpistemicProvider } from '../agentic/ai/aiService';
import { ProductIntelligenceAgentV1, ALLOWED_EPISTEMIC_STATUSES } from '../agentic/agents/productIntelligenceAgent';
import { AgentOrchestratorEngine } from '../agentic/orchestrator/orchestratorEngine';
import { PermissionEngine } from '../agentic/permissions/permissionEngine';
import { PermissionLevel } from '../agentic/contracts/agentContract';

describe('NORQVA — AGENTIC 1.2: OPENAI STRUCTURED PROVIDER UNIT & SECURITY TESTS (A - T)', () => {
  let pool: Pool;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const validMockResponseData = {
    summary: 'Diagnóstico aprofundado de oportunidade para produto digital no nicho de culinária italiana para iniciantes no Brasil.',
    target_audience: {
      description: 'Adultos brasileiros de 25 a 50 anos, apreciadores de gastronomia caseira.',
      pain_points: ['Insegurança sobre ponto correto de cocção', 'Falta de técnica para emulsão de queijo e pimenta'],
      desired_outcomes: ['Capacidade de cozinhar jantares marcantes em casa']
    },
    opportunity_hypotheses: [
      {
        title: 'Demanda persistente por culinária italiana prática',
        description: 'Alta procura por receitas tradicionais com execução simplificada.',
        confidence: 0.9,
        evidence_status: 'INFERENCE'
      },
      {
        title: 'Volume expressivo de buscas orgânicas por massas artesanais',
        description: 'Dados empíricos de tendências mostram interesse constante.',
        confidence: 0.95,
        evidence_status: 'FACT'
      }
    ],
    product_hypotheses: [
      {
        concept: 'Guia Visual de Massas Italianas',
        value_proposition: 'Domine 10 clássicos em 30 minutos',
        suggested_format: 'DIGITAL_GUIDE_PDF',
        pricing_hypothesis_brl: 27.9
      }
    ],
    risks: ['Dispersão com tutoriais gratuitos no YouTube'],
    recommended_next_research: ['Mapear formatos de anúncios em vídeo com retenção alta']
  };

  const createMockFetchResponse = (
    status: number,
    body: any,
    headers: Record<string, string> = {}
  ): Response => {
    const headerObj = new Headers({
      'content-type': 'application/json',
      'x-request-id': 'req_mock_openai_12345',
      ...headers
    });

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: headerObj,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
    } as unknown as Response;
  };

  // A. Valid structured provider response
  it('A. Valid structured provider response generates parsed data and full execution details', async () => {
    const mockResponseBody = {
      id: 'chatcmpl-mock-998877',
      object: 'chat.completion',
      created: 1725480000,
      model: 'gpt-4o-mini',
      system_fingerprint: 'fp_mock_123',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify(validMockResponseData)
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 520,
        completion_tokens: 410,
        total_tokens: 930
      }
    };

    globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(200, mockResponseBody));

    const provider = new OpenAIStructuredProvider({
      apiKey: 'sk-test-mock-key-1234567890',
      model: 'gpt-4o-mini'
    });

    const result = await provider.generateStructured<typeof validMockResponseData>({
      systemPrompt: 'System prompt test',
      userPrompt: 'User prompt test'
    });

    expect(result.data).toBeDefined();
    expect(result.data.summary).toBe(validMockResponseData.summary);
    expect(result.execution.provider).toBe('openai');
    expect(result.execution.model).toBe('gpt-4o-mini');
    expect(result.execution.http_status).toBe(200);
    expect(result.execution.token_source).toBe('REAL_PROVIDER_PAYLOAD');
    expect(result.execution.cost_source).toBe('CONFIGURED_PRICING_ESTIMATE');
  });

  // B. Token extraction
  it('B. Token extraction correctly extracts prompt, completion, and total tokens from provider payload', async () => {
    const mockResponseBody = {
      id: 'chatcmpl-token-test',
      model: 'gpt-4o-mini',
      choices: [{ message: { role: 'assistant', content: JSON.stringify(validMockResponseData) } }],
      usage: { prompt_tokens: 780, completion_tokens: 340, total_tokens: 1120 }
    };

    globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(200, mockResponseBody));

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-token-key' });
    const result = await provider.generateStructured({ systemPrompt: 'Sys', userPrompt: 'User' });

    expect(result.execution.input_tokens).toBe(780);
    expect(result.execution.output_tokens).toBe(340);
    expect(result.execution.total_tokens).toBe(1120);
    expect(result.execution.token_source).toBe('REAL_PROVIDER_PAYLOAD');
  });

  // C. Request-id extraction
  it('C. Request-id extraction captures provider x-request-id and system_fingerprint', async () => {
    const mockResponseBody = {
      id: 'chatcmpl-req-id-test',
      model: 'gpt-4o-mini',
      system_fingerprint: 'fp_agentic_certified_01',
      choices: [{ message: { role: 'assistant', content: JSON.stringify(validMockResponseData) } }],
      usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 }
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      createMockFetchResponse(200, mockResponseBody, { 'x-request-id': 'req_custom_header_999' })
    );

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-req-id-key' });
    const result = await provider.generateStructured({ systemPrompt: 'Sys', userPrompt: 'User' });

    expect(result.execution.provider_request_id).toBe('req_custom_header_999');
    expect(result.execution.system_fingerprint).toBe('fp_agentic_certified_01');
  });

  // D. Latency
  it('D. Latency calculation records execution duration in milliseconds > 0', async () => {
    const mockResponseBody = {
      id: 'chatcmpl-latency-test',
      choices: [{ message: { role: 'assistant', content: JSON.stringify(validMockResponseData) } }],
      usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 }
    };

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 15));
      return createMockFetchResponse(200, mockResponseBody);
    });

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-latency-key' });
    const result = await provider.generateStructured({ systemPrompt: 'Sys', userPrompt: 'User' });

    expect(result.execution.latency).toBeGreaterThanOrEqual(10);
    expect(result.execution.started_at).toBeDefined();
    expect(result.execution.completed_at).toBeDefined();
  });

  // E. Missing API key
  it('E. Missing API key fails closed immediately without making network requests', async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const provider = new OpenAIStructuredProvider({ apiKey: '' });

    await expect(
      provider.generateStructured({ systemPrompt: 'Sys', userPrompt: 'User' })
    ).rejects.toThrow(/Missing OPENAI_API_KEY/);

    expect(fetchSpy).not.toHaveBeenCalled();

    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
  });

  // F & G. Invalid API key / HTTP 401
  it('F & G. HTTP 401 Unauthorized fails closed with sanitized error message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createMockFetchResponse(401, {
        error: { message: 'Incorrect API key provided: sk-secret-12345. You can find your API key at...' }
      })
    );

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-invalid-test-key' });

    let thrownError: any;
    try {
      await provider.generateStructured({ systemPrompt: 'Sys', userPrompt: 'User' });
    } catch (err: any) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError.message).toContain('HTTP 401 Unauthorized');
    expect(thrownError.message).not.toContain('sk-secret-12345');
    expect(thrownError.message).toContain('[REDACTED_API_KEY]');
  });

  // H. HTTP 403
  it('H. HTTP 403 Forbidden fails closed with descriptive error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createMockFetchResponse(403, { error: { message: 'Country or region unsupported' } })
    );

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-key' });
    await expect(
      provider.generateStructured({ systemPrompt: 'Sys', userPrompt: 'User' })
    ).rejects.toThrow(/HTTP 403 Forbidden/);
  });

  // I. HTTP 429
  it('I. HTTP 429 Rate Limit fails closed with descriptive error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createMockFetchResponse(429, { error: { message: 'Rate limit reached for requests' } })
    );

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-key' });
    await expect(
      provider.generateStructured({ systemPrompt: 'Sys', userPrompt: 'User' })
    ).rejects.toThrow(/HTTP 429 Too Many Requests/);
  });

  // J. HTTP 500
  it('J. HTTP 500 Internal Server Error fails closed', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createMockFetchResponse(500, { error: { message: 'The server had an error while processing your request' } })
    );

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-key' });
    await expect(
      provider.generateStructured({ systemPrompt: 'Sys', userPrompt: 'User' })
    ).rejects.toThrow(/HTTP 500/);
  });

  // K. Timeout
  it('K. Timeout triggers abort and rejects fail-closed', async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          setTimeout(() => reject(err), 20);
        })
    );

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-key', timeoutMs: 10 });
    await expect(
      provider.generateStructured({ systemPrompt: 'Sys', userPrompt: 'User', timeoutMs: 10 })
    ).rejects.toThrow(/timed out after 10ms/);
  });

  // L. Malformed JSON
  it('L. Malformed JSON returned from LLM fails closed', async () => {
    const mockResponseBody = {
      id: 'chatcmpl-malformed',
      choices: [{ message: { role: 'assistant', content: '<<< Not valid JSON >>>' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
    };

    globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(200, mockResponseBody));

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-key' });
    await expect(
      provider.generateStructured({ systemPrompt: 'Sys', userPrompt: 'User' })
    ).rejects.toThrow(/Failed to parse AI structured output as JSON/);
  });

  // M. Schema violation
  it('M. Schema violation is rejected by ProductIntelligenceAgent validation', async () => {
    const invalidSchemaData = {
      summary: 'Missing required target_audience and hypotheses'
    };

    const mockResponseBody = {
      id: 'chatcmpl-schema-viol',
      choices: [{ message: { role: 'assistant', content: JSON.stringify(invalidSchemaData) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
    };

    globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(200, mockResponseBody));

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-key' });
    AIService.getInstance().setProvider(provider);

    const agent = new ProductIntelligenceAgentV1();
    const result = await agent.execute({ objective: 'Test Schema Violation' });

    expect(result.status).toBe('BLOCKED');
    expect(result.error_message).toContain('Output schema/epistemic violation');
  });

  // N. Epistemic violation
  it('N. Epistemic violation (unrecognized status tag) is rejected by ProductIntelligenceAgent', async () => {
    const invalidEpistemicData = {
      ...validMockResponseData,
      opportunity_hypotheses: [
        {
          title: 'Hipótese com status não permitido',
          description: 'Evidência sem respaldo',
          confidence: 0.8,
          evidence_status: 'UNPROVEN_GOSSIP'
        }
      ]
    };

    const mockResponseBody = {
      id: 'chatcmpl-epistemic-viol',
      choices: [{ message: { role: 'assistant', content: JSON.stringify(invalidEpistemicData) } }],
      usage: { prompt_tokens: 150, completion_tokens: 150, total_tokens: 300 }
    };

    globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(200, mockResponseBody));

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-key' });
    AIService.getInstance().setProvider(provider);

    const agent = new ProductIntelligenceAgentV1();
    const result = await agent.execute({ objective: 'Test Epistemic Violation' });

    expect(result.status).toBe('BLOCKED');
    expect(result.error_message).toContain('is invalid. Must be one of:');
  });

  // O. Zero retry
  it('O. Zero retry: Provider fails immediately without making additional network attempts on failure', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      createMockFetchResponse(500, { error: { message: 'Internal server error' } })
    );
    globalThis.fetch = fetchSpy;

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-key' });
    AIService.getInstance().setProvider(provider);

    const agent = new ProductIntelligenceAgentV1();
    const result = await agent.execute({ objective: 'Test Zero Retry' });

    expect(result.status).toBe('FAILED');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // P. Zero silent fallback
  it('P. Zero silent fallback: When OpenAI fails, execution fails and NEVER secretly uses Deterministic provider', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createMockFetchResponse(401, { error: { message: 'Invalid API Key' } })
    );

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-bad-key' });
    AIService.getInstance().setProvider(provider);

    const orchestrator = new AgentOrchestratorEngine(pool);
    const session = await orchestrator.createSession({
      objective: 'Test No Silent Fallback',
      tasks: [
        {
          agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
          permission_level: PermissionLevel.LEVEL_0,
          input_payload: { objective: 'Test No Silent Fallback' }
        }
      ]
    });

    const execution = await orchestrator.executeSession(session.session.id);
    expect(execution.session.status).toBe('FAILED');
    expect(execution.tasks[0].status).toBe('FAILED');
    expect(execution.tasks[0].output_payload).toBeNull();
  });

  // Q. Deterministic provider remains distinguishable
  it('Q. Deterministic provider remains clearly distinguishable from Real AI in telemetry', async () => {
    const detProvider = new DeterministicEpistemicProvider();
    const result = await detProvider.generateStructured({ systemPrompt: 'Sys', userPrompt: 'User' });

    expect(result.execution.provider).toBe('deterministic_epistemic');
    expect(result.execution.token_source).toBe('DETERMINISTIC_ENGINE');
    expect(result.execution.token_source).not.toBe('REAL_PROVIDER_PAYLOAD');
  });

  // R. LEVEL_1+ blocked
  it('R. LEVEL_1+ execution is strictly blocked fail-closed by PermissionEngine', () => {
    const checkL1 = PermissionEngine.isPermissionAllowed(PermissionLevel.LEVEL_1);
    expect(checkL1.allowed).toBe(false);
    expect(checkL1.reason).toContain('exceeds current system ceiling');

    const checkL2 = PermissionEngine.isPermissionAllowed(PermissionLevel.LEVEL_2);
    expect(checkL2.allowed).toBe(false);

    const checkL3 = PermissionEngine.isPermissionAllowed(PermissionLevel.LEVEL_3);
    expect(checkL3.allowed).toBe(false);
  });

  // S. Zero commercial mutation
  it('S. Zero commercial mutation: E2E execution leaves all commercial tables unchanged', async () => {
    const initialProducts = await pool.query('SELECT count(*) FROM products');
    const initialOffers = await pool.query('SELECT count(*) FROM offers');
    const initialCustomers = await pool.query('SELECT count(*) FROM customers');
    const initialOrders = await pool.query('SELECT count(*) FROM orders');

    const mockResponseBody = {
      id: 'chatcmpl-zero-mut',
      model: 'gpt-4o-mini',
      choices: [{ message: { role: 'assistant', content: JSON.stringify(validMockResponseData) } }],
      usage: { prompt_tokens: 300, completion_tokens: 200, total_tokens: 500 }
    };

    globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(200, mockResponseBody));

    const provider = new OpenAIStructuredProvider({ apiKey: 'sk-test-key' });
    AIService.getInstance().setProvider(provider);

    const orchestrator = new AgentOrchestratorEngine(pool);
    const session = await orchestrator.createSession({
      objective: 'Zero Mutation Verification',
      tasks: [
        {
          agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
          permission_level: PermissionLevel.LEVEL_0,
          input_payload: { objective: 'Zero Mutation Verification' }
        }
      ]
    });

    const execution = await orchestrator.executeSession(session.session.id);
    expect(execution.session.status).toBe('COMPLETED');

    const finalProducts = await pool.query('SELECT count(*) FROM products');
    const finalOffers = await pool.query('SELECT count(*) FROM offers');
    const finalCustomers = await pool.query('SELECT count(*) FROM customers');
    const finalOrders = await pool.query('SELECT count(*) FROM orders');

    expect(finalProducts.rows[0].count).toBe(initialProducts.rows[0].count);
    expect(finalOffers.rows[0].count).toBe(initialOffers.rows[0].count);
    expect(finalCustomers.rows[0].count).toBe(initialCustomers.rows[0].count);
    expect(finalOrders.rows[0].count).toBe(initialOrders.rows[0].count);
  });

  // T. Zero Meta Write
  it('T. Zero Meta Write: Prohibited actions strictly include meta_write and commercial_mutation', () => {
    const agent = new ProductIntelligenceAgentV1();
    const contract = agent.getContract();

    expect(contract.prohibited_actions).toContain('meta_write');
    expect(contract.prohibited_actions).toContain('commercial_mutation');
    expect(contract.allowed_writes.length).toBe(0);

    const check = PermissionEngine.validateToolAccess(contract.allowed_tools, 'meta_campaign_mutator');
    expect(check.allowed).toBe(false);
  });
});
