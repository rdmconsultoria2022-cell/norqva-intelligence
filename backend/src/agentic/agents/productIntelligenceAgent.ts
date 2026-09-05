import crypto from 'crypto';
import { AgentContract, IAgent, PermissionLevel, AgentExecutionResult, validateAgentInput } from '../contracts/agentContract';
import { AIExecutionDetails } from '../../utils/ai';
import { AIService, MAX_DEFAULT_TOKEN_BUDGET } from '../ai/aiService';

export const ALLOWED_EPISTEMIC_STATUSES = [
  'FACT',
  'INFERENCE',
  'HYPOTHESIS',
  'INSUFFICIENT_DATA',
  'FATO',
  'INFERENCIA',
  'HIPOTESE',
  'DADO_INSUFICIENTE'
];

export interface ProductIntelligenceInput {
  objective: string;
  market?: string;
  country?: string;
  language?: string;
}

export interface ProductIntelligenceOutput {
  summary: string;
  target_audience: {
    description: string;
    pain_points: string[];
    desired_outcomes: string[];
  };
  opportunity_hypotheses: Array<{
    title: string;
    description: string;
    confidence: number;
    evidence_status: string;
  }>;
  product_hypotheses: Array<{
    concept: string;
    value_proposition: string;
    suggested_format: string;
    pricing_hypothesis_brl: number;
  }>;
  risks: string[];
  recommended_next_research: string[];
}

export const PRODUCT_INTELLIGENCE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Diagnóstico executivo conciso da hipótese de produto e mercado.'
    },
    target_audience: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Perfil demográfico e comportamental do público-alvo.' },
        pain_points: {
          type: 'array',
          items: { type: 'string' },
          description: 'Dores, frustrações e obstáculos do público.'
        },
        desired_outcomes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Resultados, transformações e benefícios desejados.'
        }
      },
      required: ['description', 'pain_points', 'desired_outcomes'],
      additionalProperties: false
    },
    opportunity_hypotheses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          confidence: { type: 'number', description: 'Nível de confiança entre 0.0 e 1.0.' },
          evidence_status: {
            type: 'string',
            enum: ['FACT', 'INFERENCE', 'HYPOTHESIS', 'INSUFFICIENT_DATA', 'FATO', 'INFERENCIA', 'HIPOTESE', 'DADO_INSUFICIENTE'],
            description: 'Classificação epistemológica estrita da hipótese.'
          }
        },
        required: ['title', 'description', 'confidence', 'evidence_status'],
        additionalProperties: false
      },
      description: 'Hipóteses de oportunidade com rotulagem epistemológica.'
    },
    product_hypotheses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          concept: { type: 'string' },
          value_proposition: { type: 'string' },
          suggested_format: { type: 'string' },
          pricing_hypothesis_brl: { type: 'number', description: 'Hipótese analítica de preço em BRL.' }
        },
        required: ['concept', 'value_proposition', 'suggested_format', 'pricing_hypothesis_brl'],
        additionalProperties: false
      },
      description: 'Hipóteses de formato, proposta de valor e precificação analítica.'
    },
    risks: {
      type: 'array',
      items: { type: 'string' },
      description: 'Riscos analíticos e de mercado identificados.'
    },
    recommended_next_research: {
      type: 'array',
      items: { type: 'string' },
      description: 'Próximos passos de pesquisa recomendados.'
    }
  },
  required: [
    'summary',
    'target_audience',
    'opportunity_hypotheses',
    'product_hypotheses',
    'risks',
    'recommended_next_research'
  ],
  additionalProperties: false
};

export class ProductIntelligenceAgentV1 implements IAgent {
  private contract: AgentContract = {
    agent_id: 'PRODUCT_INTELLIGENCE_AGENT_V1',
    agent_type: 'INTELLIGENCE',
    version: '1.0.0',
    mission: 'Analisar uma hipótese de produto digital e retornar um diagnóstico estruturado de oportunidade com rotulagem epistêmica rigorosa.',
    input_schema: {
      type: 'object',
      required: ['objective'],
      properties: {
        objective: { type: 'string', description: 'Hipótese ou objetivo de produto a ser analisado' },
        market: { type: 'string', description: 'Nicho ou mercado-alvo (opcional)' },
        country: { type: 'string', description: 'País de referência (ex: BR)' },
        language: { type: 'string', description: 'Idioma de referência (ex: pt-BR)' }
      }
    },
    output_schema: PRODUCT_INTELLIGENCE_JSON_SCHEMA,
    allowed_tools: ['internal_context_reader', 'evidence_reader', 'opportunity_reader'],
    allowed_reads: [
      'opportunities',
      'evidences',
      'opportunity_risks',
      'opportunity_reviews',
      'opportunity_scores',
      'products',
      'offers',
      'experiments',
      'performance_metrics'
    ],
    allowed_writes: [],
    prohibited_actions: [
      'commercial_mutation',
      'meta_write',
      'payment_mutation',
      'external_web_scraping',
      'production_pricing_alteration'
    ],
    permission_level: PermissionLevel.LEVEL_0,
    max_execution_time_ms: 15000,
    max_retries: 0,
    approval_required: false,
    evidence_required: false
  };

  public getContract(): AgentContract {
    return { ...this.contract };
  }

  public validateOutputStructure(output: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!output || typeof output !== 'object') {
      return { valid: false, errors: ['Output must be a non-null JSON object'] };
    }

    if (!output.summary || typeof output.summary !== 'string' || !output.summary.trim()) {
      errors.push('summary is required and must be a non-empty string');
    }

    // Validate target_audience
    if (!output.target_audience || typeof output.target_audience !== 'object') {
      errors.push('target_audience is required and must be an object');
    } else {
      if (!output.target_audience.description || typeof output.target_audience.description !== 'string') {
        errors.push('target_audience.description is required and must be a string');
      }
      if (!Array.isArray(output.target_audience.pain_points) || output.target_audience.pain_points.length === 0) {
        errors.push('target_audience.pain_points must be a non-empty array of strings');
      }
      if (!Array.isArray(output.target_audience.desired_outcomes) || output.target_audience.desired_outcomes.length === 0) {
        errors.push('target_audience.desired_outcomes must be a non-empty array of strings');
      }
    }

    // Validate opportunity_hypotheses & epistemic labeling
    if (!Array.isArray(output.opportunity_hypotheses) || output.opportunity_hypotheses.length === 0) {
      errors.push('opportunity_hypotheses must be a non-empty array');
    } else {
      for (let i = 0; i < output.opportunity_hypotheses.length; i++) {
        const hyp = output.opportunity_hypotheses[i];
        if (!hyp.title || typeof hyp.title !== 'string') {
          errors.push("opportunity_hypotheses[" + i + "].title is required");
        }
        if (!hyp.description || typeof hyp.description !== 'string') {
          errors.push("opportunity_hypotheses[" + i + "].description is required");
        }
        if (typeof hyp.confidence !== 'number' || hyp.confidence < 0 || hyp.confidence > 1) {
          errors.push("opportunity_hypotheses[" + i + "].confidence must be a number between 0.0 and 1.0");
        }
        if (!hyp.evidence_status || !ALLOWED_EPISTEMIC_STATUSES.includes(hyp.evidence_status.toUpperCase())) {
          errors.push(
            "opportunity_hypotheses[" + i + "].evidence_status \"" + hyp.evidence_status + "\" is invalid. Must be one of: " + ALLOWED_EPISTEMIC_STATUSES.join(', ')
          );
        }
      }
    }

    // Validate product_hypotheses
    if (!Array.isArray(output.product_hypotheses) || output.product_hypotheses.length === 0) {
      errors.push('product_hypotheses must be a non-empty array');
    } else {
      for (let i = 0; i < output.product_hypotheses.length; i++) {
        const prod = output.product_hypotheses[i];
        if (!prod.concept || typeof prod.concept !== 'string') {
          errors.push("product_hypotheses[" + i + "].concept is required");
        }
        if (!prod.value_proposition || typeof prod.value_proposition !== 'string') {
          errors.push("product_hypotheses[" + i + "].value_proposition is required");
        }
        if (!prod.suggested_format || typeof prod.suggested_format !== 'string') {
          errors.push("product_hypotheses[" + i + "].suggested_format is required");
        }
        if (typeof prod.pricing_hypothesis_brl !== 'number' || prod.pricing_hypothesis_brl < 0) {
          errors.push("product_hypotheses[" + i + "].pricing_hypothesis_brl must be a non-negative number");
        }
      }
    }

    // Validate risks
    if (!Array.isArray(output.risks) || output.risks.length === 0) {
      errors.push('risks must be a non-empty array of strings');
    }

    // Validate recommended_next_research
    if (!Array.isArray(output.recommended_next_research) || output.recommended_next_research.length === 0) {
      errors.push('recommended_next_research must be a non-empty array of strings');
    }

    return { valid: errors.length === 0, errors };
  }

  public async execute(input: ProductIntelligenceInput, context?: { sessionId: string; taskId: string }): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    // 1. Validate Input
    const inputValidation = validateAgentInput(this.contract, input);
    if (!inputValidation.valid) {
      const details: AIExecutionDetails = {
        provider: 'NORQVA_AGENT_V1',
        model: 'product-intelligence-v1',
        prompt_version: '1.0.0',
        execution_id: crypto.randomUUID(),
        latency: Date.now() - startTime,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost: 0
      };
      return {
        status: 'BLOCKED',
        error_message: "Input schema violation: " + inputValidation.errors.join(', '),
        execution_details: details,
        tools_used: [],
        artifacts_created: []
      };
    }

    // 2. Prepare Prompts with Epistemic Discipline
    const systemPrompt = "Você é o PRODUCT_INTELLIGENCE_AGENT_V1 da plataforma NORQVA Intelligence.\n" +
      "Sua missão é estritamente analítica e diagnóstica (LEVEL_0: READ_ONLY).\n" +
      "Você avalia hipóteses de produtos digitais no mercado e emite parecer técnico estruturado em JSON com disciplina epistêmica rigorosa.\n\n" +
      "DIRETRIZES EPISTÊMICAS OBRIGATÓRIAS:\n" +
      "- Toda hipótese de oportunidade deve ser classificada com um dos seguintes status de evidência:\n" +
      "  * FACT: Fato comprovado por dados empíricos observáveis.\n" +
      "  * INFERENCE: Conclusão lógica derivada de fatos e padrões consolidados.\n" +
      "  * HYPOTHESIS: Hipótese razoável sujeita a validação experimental.\n" +
      "  * INSUFFICIENT_DATA: Dados insuficientes para afirmar com confiança.\n" +
      "- NUNCA declare uma hipótese como fato.\n" +
      "- Pricing sugerido (pricing_hypothesis_brl) é APENAS uma hipótese de precificação analítica, JAMAIS uma criação de oferta ou preço autoritativo.\n\n" +
      "ESTRUTURA JSON OBRIGATÓRIA (todas as chaves são estritamente obrigatórias):\n" +
      "{\n" +
      "  \"summary\": \"string\",\n" +
      "  \"target_audience\": {\n" +
      "    \"description\": \"string\",\n" +
      "    \"pain_points\": [\"string\"],\n" +
      "    \"desired_outcomes\": [\"string\"]\n" +
      "  },\n" +
      "  \"opportunity_hypotheses\": [\n" +
      "    {\n" +
      "      \"title\": \"string\",\n" +
      "      \"description\": \"string\",\n" +
      "      \"confidence\": 0.85,\n" +
      "      \"evidence_status\": \"FACT | INFERENCE | HYPOTHESIS | INSUFFICIENT_DATA\"\n" +
      "    }\n" +
      "  ],\n" +
      "  \"product_hypotheses\": [\n" +
      "    {\n" +
      "      \"concept\": \"string\",\n" +
      "      \"value_proposition\": \"string\",\n" +
      "      \"suggested_format\": \"string\",\n" +
      "      \"pricing_hypothesis_brl\": 29.90\n" +
      "    }\n" +
      "  ],\n" +
      "  \"risks\": [\"string\"],\n" +
      "  \"recommended_next_research\": [\"string\"]\n" +
      "}\n" +
      "Responda exclusivamente no formato JSON solicitado sem nenhum texto adicional.";

    const userPrompt = "Analise o seguinte objetivo de produto digital:\n" +
      "Objetivo: \"" + input.objective + "\"\n" +
      "Mercado: \"" + (input.market || 'Produtos Digitais') + "\"\n" +
      "País: \"" + (input.country || 'BR') + "\"\n" +
      "Idioma: \"" + (input.language || 'pt-BR') + "\"\n\n" +
      "Retorne o diagnóstico completo em JSON.";

    const aiService = AIService.getInstance();

    let attempts = 0;
    const maxAttempts = this.contract.max_retries + 1;
    let lastError: string = '';

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const genResult = await aiService.executeStructuredGeneration<ProductIntelligenceOutput>({
          systemPrompt,
          userPrompt,
          schema: this.contract.output_schema,
          timeoutMs: this.contract.max_execution_time_ms
        });

        // Validate Epistemic and Output Structure
        const structureCheck = this.validateOutputStructure(genResult.data);
        if (!structureCheck.valid) {
          lastError = "Output schema/epistemic violation: " + structureCheck.errors.join(', ');
          if (attempts < maxAttempts) continue; // Retry
          
          return {
            status: 'BLOCKED',
            error_message: lastError,
            execution_details: genResult.execution,
            tools_used: ['internal_context_reader'],
            artifacts_created: []
          };
        }

        return {
          status: 'COMPLETED',
          output_payload: genResult.data,
          execution_details: genResult.execution,
          tools_used: ['internal_context_reader', 'opportunity_reader'],
          artifacts_created: []
        };
      } catch (err: any) {
        lastError = err.message || 'AI execution failed';
        if (attempts < maxAttempts && !lastError.includes('Token budget exceeded')) {
          continue;
        }

        const failExecution: AIExecutionDetails = {
          provider: 'NORQVA_AI_ENGINE',
          model: 'norqva-intelligence-v1',
          prompt_version: '1.1.0',
          execution_id: crypto.randomUUID(),
          latency: Date.now() - startTime,
          input_tokens: 0,
          output_tokens: 0,
          estimated_cost: 0
        };

        return {
          status: lastError.includes('Token budget exceeded') ? 'BLOCKED' : 'FAILED',
          error_message: lastError,
          execution_details: failExecution,
          tools_used: [],
          artifacts_created: []
        };
      }
    }

    const fallbackDetails: AIExecutionDetails = {
      provider: 'NORQVA_AI_ENGINE',
      model: 'norqva-intelligence-v1',
      prompt_version: '1.1.0',
      execution_id: crypto.randomUUID(),
      latency: Date.now() - startTime,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost: 0
    };

    const isSecurityOrSchemaViolation = 
      lastError.includes('schema') || 
      lastError.includes('epistemic') || 
      lastError.includes('Token budget') || 
      lastError.includes('violation');

    return {
      status: isSecurityOrSchemaViolation ? 'BLOCKED' : 'FAILED',
      error_message: "Execution failed after " + this.contract.max_retries + " retries. Last error: " + lastError,
      execution_details: fallbackDetails,
      tools_used: [],
      artifacts_created: []
    };
  }
}
