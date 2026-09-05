import crypto from 'crypto';

export interface AIExecutionDetails {
  provider: string;
  model: string;
  prompt_version: string;
  execution_id: string;
  latency: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  provider_request_id?: string;
  http_status?: number;
  started_at?: string;
  completed_at?: string;
  total_tokens?: number;
  token_source?: string;
  cost_source?: string;
  system_fingerprint?: string;
}

export interface AIProvider {
  analyzeOpportunity(
    opportunity: any,
    evidences: any[],
    promptContent: string,
    promptVersion: string
  ): Promise<{ analysis: any; execution: AIExecutionDetails }>;
  
  criticizeOpportunity(
    opportunity: any,
    evidences: any[],
    analysis: any,
    promptContent: string,
    promptVersion: string
  ): Promise<{ findings: any[]; execution: AIExecutionDetails }>;
}

export class MockAIProvider implements AIProvider {
  private shouldTimeout = false;
  private shouldFailSchema = false;
  private invalidEvidenceReference = false;
  private shouldFailAPI = false;
  private isRateLimited = false;
  private emptyResponse = false;
  private missingRequiredFields = false;
  private specificEvidenceCitation: string | undefined = undefined;

  setMockFlags(flags: { 
    shouldTimeout?: boolean; 
    shouldFailSchema?: boolean; 
    invalidEvidenceReference?: boolean;
    shouldFailAPI?: boolean;
    isRateLimited?: boolean;
    emptyResponse?: boolean;
    missingRequiredFields?: boolean;
    specificEvidenceCitation?: string;
  }) {
    if (flags.shouldTimeout !== undefined) this.shouldTimeout = flags.shouldTimeout;
    if (flags.shouldFailSchema !== undefined) this.shouldFailSchema = flags.shouldFailSchema;
    if (flags.invalidEvidenceReference !== undefined) this.invalidEvidenceReference = flags.invalidEvidenceReference;
    if (flags.shouldFailAPI !== undefined) this.shouldFailAPI = flags.shouldFailAPI;
    if (flags.isRateLimited !== undefined) this.isRateLimited = flags.isRateLimited;
    if (flags.emptyResponse !== undefined) this.emptyResponse = flags.emptyResponse;
    if (flags.missingRequiredFields !== undefined) this.missingRequiredFields = flags.missingRequiredFields;
    if ('specificEvidenceCitation' in flags) this.specificEvidenceCitation = flags.specificEvidenceCitation;
  }

  async analyzeOpportunity(
    opportunity: any,
    evidences: any[],
    promptContent: string,
    promptVersion: string
  ): Promise<{ analysis: any; execution: AIExecutionDetails }> {
    if (this.shouldTimeout) {
      await new Promise((_, reject) => setTimeout(() => reject(new Error('Provider request timeout')), 100));
    }
    if (this.shouldFailAPI) {
      throw new Error('AI Provider connection failed');
    }
    if (this.isRateLimited) {
      throw new Error('Rate limit exceeded');
    }

    const latency = Math.floor(Math.random() * 300) + 100;
    const inputTokens = 850;
    const outputTokens = 1200;
    const estimatedCost = parseFloat((inputTokens * 0.00001 + outputTokens * 0.00003).toFixed(4));

    const execution: AIExecutionDetails = {
      provider: 'Gemini',
      model: 'gemini-1.5-pro',
      prompt_version: promptVersion,
      execution_id: crypto.randomUUID(),
      latency,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: estimatedCost
    };

    if (this.emptyResponse) {
      return { analysis: {}, execution };
    }

    if (this.shouldFailSchema) {
      // Missing required subscores field entirely to trigger schema failure
      return {
        analysis: {
          executive_summary: 'Partial analysis due to system error.'
        },
        execution
      };
    }

    // Default mock subscores
    const subscores: Record<string, { score: number; confidence: 'LOW' | 'MEDIUM' | 'HIGH'; reasoning: string; evidence_ids: string[] }> = {};
    const componentsKeys = [
      'demand_evidence', 'commercial_persistence', 'visual_demonstrability', 'benefit_clarity',
      'differentiation_potential', 'unit_economics_potential', 'upsell_ltv_potential', 'production_ease',
      'scalability', 'risk'
    ];

    const evidenceIds = evidences.map(e => e.id);
    
    for (const key of componentsKeys) {
      let scoreVal = 7.5;
      let conf: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
      let reasoning = `Analysis of component ${key} shows strong potential.`;
      let compEvIds: string[] = [];

      if (key === 'demand_evidence' && evidenceIds.length > 0) {
        compEvIds = [evidenceIds[0]];
        scoreVal = 8.5;
        conf = 'HIGH';
        reasoning = `Backed by evidence: ${evidences[0].description}`;
      } else if (key === 'commercial_persistence' && evidenceIds.length > 1) {
        compEvIds = [evidenceIds[1]];
        scoreVal = 7.0;
        reasoning = `Backed by evidence: ${evidences[1].description}`;
      } else if (key === 'risk') {
        scoreVal = 6.0;
        conf = 'LOW';
      }

      if (this.invalidEvidenceReference) {
        compEvIds.push(crypto.randomUUID());
      }
      if (this.specificEvidenceCitation) {
        compEvIds.push(this.specificEvidenceCitation);
      }

      subscores[key] = {
        score: scoreVal,
        confidence: conf,
        reasoning,
        evidence_ids: compEvIds
      };
    }

    if (this.missingRequiredFields) {
      // Omit subscores to fail verification checks in api.ts
      return {
        analysis: {
          executive_summary: `Opportunity target: ${opportunity.title}`
        },
        execution
      };
    }

    const analysis = {
      executive_summary: `Opportunity target: ${opportunity.title}. Shows promising feasibility overall.`,
      market_signal: 'High activity index registered in premium zones.',
      target_audience_analysis: { core: opportunity.target_audience, size: 'Medium Segment' },
      problem_analysis: { problem: opportunity.problem_desire },
      offer_analysis: { recommended_format: opportunity.product_format || 'API' },
      price_analysis: { suggested_price: 990.00 },
      competition_analysis: { level: 'Medium' },
      differentiation_analysis: { strategy: 'Localized targeting algorithm optimization' },
      production_analysis: { complexity: 'Low-Medium' },
      creative_potential: { visual_concepts: 4 },
      upsell_potential: { upsells: ['Enterprise Suite'] },
      risks: { legal: 'Low', policy: 'None' },
      missing_information: ['Need additional public traffic survey data.'],
      recommended_next_steps: ['Validate meta campaign hook ideas.'],
      subscores
    };

    return { analysis, execution };
  }

  async criticizeOpportunity(
    opportunity: any,
    evidences: any[],
    analysis: any,
    promptContent: string,
    promptVersion: string
  ): Promise<{ findings: any[]; execution: AIExecutionDetails }> {
    if (this.shouldTimeout) {
      await new Promise((_, reject) => setTimeout(() => reject(new Error('Provider request timeout')), 100));
    }
    if (this.shouldFailAPI) {
      throw new Error('AI Provider connection failed');
    }
    if (this.isRateLimited) {
      throw new Error('Rate limit exceeded');
    }

    const latency = Math.floor(Math.random() * 200) + 80;
    const inputTokens = 1200;
    const outputTokens = 600;
    const estimatedCost = parseFloat((inputTokens * 0.00001 + outputTokens * 0.00003).toFixed(4));

    const execution: AIExecutionDetails = {
      provider: 'Gemini',
      model: 'gemini-1.5-pro',
      prompt_version: promptVersion,
      execution_id: crypto.randomUUID(),
      latency,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: estimatedCost
    };

    const evidenceIds = evidences.map(e => e.id);

    // Simulated critical findings
    const findings = [
      {
        finding: 'High dependency on Facebook Ad network stability.',
        risk_type: 'PLATFORM_POLICY',
        severity: 'MEDIUM',
        probability: 'HIGH',
        affected_component_keys: ['risk'],
        evidence_ids: evidenceIds.slice(0, 1)
      },
      {
        finding: 'Potential copycat saturation within 6 months.',
        risk_type: 'COMPETITION',
        severity: 'HIGH',
        probability: 'MEDIUM',
        affected_component_keys: ['differentiation_potential'],
        evidence_ids: []
      }
    ];

    if (this.invalidEvidenceReference) {
      findings[0].evidence_ids.push(crypto.randomUUID());
    }

    return { findings, execution };
  }
}
