import crypto from 'crypto';
import { AIExecutionDetails } from '../../utils/ai';
import { OpenAIStructuredProvider } from './openAIStructuredProvider';

export interface StructuredGenerationParams {
  systemPrompt: string;
  userPrompt: string;
  schema?: any;
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
}

export interface StructuredGenerationResult<T> {
  data: T;
  rawText: string;
  execution: AIExecutionDetails;
}

export interface IAIStructuredProvider {
  generateStructured<T>(params: StructuredGenerationParams): Promise<StructuredGenerationResult<T>>;
}

export const MAX_DEFAULT_TOKEN_BUDGET = 4000;
export const MAX_DEFAULT_TIMEOUT_MS = 15000;

export class DeterministicEpistemicProvider implements IAIStructuredProvider {
  private customFailure: 'TIMEOUT' | 'UNAVAILABLE' | 'MALFORMED_JSON' | 'INVALID_SCHEMA' | 'INVALID_EPISTEMIC' | 'TOKEN_OVERFLOW' | null = null;

  public setFailureMode(mode: 'TIMEOUT' | 'UNAVAILABLE' | 'MALFORMED_JSON' | 'INVALID_SCHEMA' | 'INVALID_EPISTEMIC' | 'TOKEN_OVERFLOW' | null) {
    this.customFailure = mode;
  }

  public async generateStructured<T>(params: StructuredGenerationParams): Promise<StructuredGenerationResult<T>> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const timeoutMs = params.timeoutMs || MAX_DEFAULT_TIMEOUT_MS;

    if (this.customFailure === 'TIMEOUT') {
      await new Promise(resolve => setTimeout(resolve, 100));
      throw new Error("AI Provider timeout after " + timeoutMs + "ms");
    }

    if (this.customFailure === 'UNAVAILABLE') {
      throw new Error('AI Provider service unavailable (503 Service Unavailable)');
    }

    if (this.customFailure === 'TOKEN_OVERFLOW') {
      const execDetails: AIExecutionDetails = {
        provider: 'deterministic_epistemic',
        model: 'norqva-intelligence-v1',
        prompt_version: '1.1.0',
        execution_id: crypto.randomUUID(),
        http_status: 200,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        latency: Date.now() - startTime,
        input_tokens: 3500,
        output_tokens: 2500,
        total_tokens: 6000,
        token_source: 'DETERMINISTIC_ENGINE',
        estimated_cost: 0.055000,
        cost_source: 'CONFIGURED_PRICING_ESTIMATE'
      };
      throw new Error("Token budget exceeded: total tokens 6000 exceeds maximum budget " + MAX_DEFAULT_TOKEN_BUDGET);
    }

    if (this.customFailure === 'MALFORMED_JSON') {
      throw new Error('Failed to parse AI response as JSON: Unexpected token < in JSON at position 0');
    }

    if (this.customFailure === 'INVALID_SCHEMA') {
      const invalidData: any = {
        summary: 'Incomplete response missing required fields'
      };
      const execDetails: AIExecutionDetails = {
        provider: 'deterministic_epistemic',
        model: 'norqva-intelligence-v1',
        prompt_version: '1.1.0',
        execution_id: crypto.randomUUID(),
        http_status: 200,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        latency: Date.now() - startTime,
        input_tokens: 420,
        output_tokens: 180,
        total_tokens: 600,
        token_source: 'DETERMINISTIC_ENGINE',
        estimated_cost: 0.002200,
        cost_source: 'CONFIGURED_PRICING_ESTIMATE'
      };
      return {
        data: invalidData,
        rawText: JSON.stringify(invalidData),
        execution: execDetails
      };
    }

    if (this.customFailure === 'INVALID_EPISTEMIC') {
      const invalidEpistemicData: any = {
        summary: 'Diagnóstico de culinária italiana para iniciantes no mercado brasileiro.',
        target_audience: {
          description: 'Brasileiros entusiastas de gastronomia que desejam cozinhar em casa.',
          pain_points: ['Dificuldade no ponto da massa', 'Molhos ácidos ou sem textura'],
          desired_outcomes: ['Preparar massas artesanais com segurança e elegância']
        },
        opportunity_hypotheses: [
          {
            title: 'Alta demanda por receitas italianas práticas',
            description: 'Busca crescente por receitas afetivas italianas no Brasil.',
            confidence: 0.85,
            evidence_status: 'UNKNOWN_STATUS_LABEL'
          }
        ],
        product_hypotheses: [
          {
            concept: 'Guia definitivo de massas e molhos',
            value_proposition: 'Domine 12 clássicos italianos em 30 minutos',
            suggested_format: 'DIGITAL_GUIDE',
            pricing_hypothesis_brl: 29.90
          }
        ],
        risks: ['Concorrência de canais gratuitos do YouTube'],
        recommended_next_research: ['Testar criativos em vídeo com receita de Carbonara autêntico']
      };
      const execDetails: AIExecutionDetails = {
        provider: 'deterministic_epistemic',
        model: 'norqva-intelligence-v1',
        prompt_version: '1.1.0',
        execution_id: crypto.randomUUID(),
        http_status: 200,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        latency: Date.now() - startTime,
        input_tokens: 520,
        output_tokens: 380,
        total_tokens: 900,
        token_source: 'DETERMINISTIC_ENGINE',
        estimated_cost: 0.004100,
        cost_source: 'CONFIGURED_PRICING_ESTIMATE'
      };
      return {
        data: invalidEpistemicData,
        rawText: JSON.stringify(invalidEpistemicData),
        execution: execDetails
      };
    }

    // Default successful structured completion with valid epistemic labeling
    const inputTokens = 680;
    const outputTokens = 540;
    const totalTokens = inputTokens + outputTokens;
    const latency = Date.now() - startTime + 85;
    const estimatedCost = parseFloat(((inputTokens * 0.000005) + (outputTokens * 0.000015)).toFixed(6));

    const standardData: any = {
      summary: 'Diagnóstico aprofundado de oportunidade para produto digital no nicho de culinária italiana para iniciantes no Brasil.',
      target_audience: {
        description: 'Adultos brasileiros de 25 a 50 anos, apreciadores de gastronomia caseira que buscam replicar pratos clássicos italianos sem equipamentos profissionais.',
        pain_points: [
          'Insegurança sobre ponto correto de cocção (al dente)',
          'Erros recorrentes na emulsão de queijo e pimenta (Cacio e Pepe / Carbonara)',
          'Falta de método estruturado para harmonizar massas com tipos de molhos'
        ],
        desired_outcomes: [
          'Capacidade de cozinhar jantares marcantes com ingredientes acessíveis',
          'Eliminar o medo de errar receitas tradicionais italianas',
          'Economizar com delivery preparando refeições de alta qualidade em casa'
        ]
      },
      opportunity_hypotheses: [
        {
          title: 'Demanda persistente por culinária afetiva descomplicada',
          description: 'A culinária italiana lidera a preferência em refeições festivas e domésticas no Brasil.',
          confidence: 0.88,
          evidence_status: 'INFERENCE'
        },
        {
          title: 'Sensibilidade de preço e formato digital favorável',
          description: 'Micro-guias digitais e PDFs estruturados de execução imediata convertem com custo por aquisição reduzido.',
          confidence: 0.82,
          evidence_status: 'HYPOTHESIS'
        },
        {
          title: 'Presença de termos e termos de busca com alto volume orgânico',
          description: 'Volume relevante de buscas mensais para massas caseiras e molhos tradicionais no Brasil.',
          confidence: 0.90,
          evidence_status: 'FACT'
        }
      ],
      product_hypotheses: [
        {
          concept: 'Trattoria em Casa — Guia Prático de Massas & Molhos Clássicos',
          value_proposition: 'Método visual passo a passo para dominar as 10 maiores massas italianas na sua cozinha sem complicação.',
          suggested_format: 'DIGITAL_GUIDE_PDF',
          pricing_hypothesis_brl: 19.90
        }
      ],
      risks: [
        'Dispersão de atenção do usuário com receitas gratuitas genéricas',
        'Necessidade de forte apelo visual nos anúncios para destacar a metodologia'
      ],
      recommended_next_research: [
        'Mapear criativos de maior retenção com foco no processo de preparo do Carbonara',
        'Avaliar termos de busca relacionados a farinhas nacionais vs importadas'
      ]
    };

    const execution: AIExecutionDetails = {
      provider: 'deterministic_epistemic',
      model: 'norqva-intelligence-v1',
      prompt_version: '1.1.0',
      execution_id: crypto.randomUUID(),
      http_status: 200,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      latency,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      token_source: 'DETERMINISTIC_ENGINE',
      estimated_cost: estimatedCost,
      cost_source: 'CONFIGURED_PRICING_ESTIMATE'
    };

    return {
      data: standardData as T,
      rawText: JSON.stringify(standardData),
      execution
    };
  }
}

export class AIService {
  private static instance: AIService | null = null;
  private provider: IAIStructuredProvider;

  private constructor() {
    if (process.env.AGENTIC_AI_PROVIDER === 'openai') {
      this.provider = new OpenAIStructuredProvider();
    } else {
      this.provider = new DeterministicEpistemicProvider();
    }
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  public static resetInstance(): void {
    AIService.instance = null;
  }

  public setProvider(provider: IAIStructuredProvider) {
    this.provider = provider;
  }

  public getProvider(): IAIStructuredProvider {
    return this.provider;
  }

  public async executeStructuredGeneration<T>(params: StructuredGenerationParams): Promise<StructuredGenerationResult<T>> {
    const timeoutMs = params.timeoutMs || MAX_DEFAULT_TIMEOUT_MS;
    
    let timeoutHandle: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("AI Service execution timed out after " + timeoutMs + "ms"));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        this.provider.generateStructured<T>(params),
        timeoutPromise
      ]);

      const totalTokens = (result.execution.input_tokens || 0) + (result.execution.output_tokens || 0);
      if (totalTokens > MAX_DEFAULT_TOKEN_BUDGET) {
        throw new Error("Token budget exceeded: total tokens " + totalTokens + " exceeds maximum budget " + MAX_DEFAULT_TOKEN_BUDGET);
      }

      return result;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}
