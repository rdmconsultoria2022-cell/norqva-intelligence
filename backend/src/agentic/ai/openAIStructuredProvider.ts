import crypto from 'crypto';
import { AIExecutionDetails } from '../../utils/ai';
import { IAIStructuredProvider, StructuredGenerationParams, StructuredGenerationResult } from './aiService';

export interface OpenAIProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxTokens?: number;
}

export class OpenAIStructuredProvider implements IAIStructuredProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private defaultTimeoutMs: number;
  private defaultMaxTokens: number;

  constructor(config?: OpenAIProviderConfig) {
    this.apiKey = (config?.apiKey || process.env.OPENAI_API_KEY || '').trim();
    this.model = (config?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
    this.baseUrl = (config?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
    this.defaultTimeoutMs = Number(config?.timeoutMs || process.env.AGENTIC_AI_TIMEOUT_MS || 15000);
    this.defaultMaxTokens = Number(config?.maxTokens || process.env.AGENTIC_AI_MAX_TOKENS || 4000);
  }

  private calculateEstimatedCost(model: string, inputTokens: number, outputTokens: number): number {
    const normalizedModel = model.toLowerCase();
    let promptRate = 0.00000015; // default gpt-4o-mini: $0.15 / 1M tokens
    let completionRate = 0.00000060; // default gpt-4o-mini: $0.60 / 1M tokens

    if (normalizedModel.includes('gpt-4o-mini')) {
      promptRate = 0.00000015;
      completionRate = 0.00000060;
    } else if (normalizedModel.includes('gpt-4o')) {
      promptRate = 0.00000250;
      completionRate = 0.00001000;
    } else if (normalizedModel.includes('gpt-3.5')) {
      promptRate = 0.00000050;
      completionRate = 0.00000150;
    }

    const cost = (inputTokens * promptRate) + (outputTokens * completionRate);
    return parseFloat(cost.toFixed(6));
  }

  public async generateStructured<T>(params: StructuredGenerationParams): Promise<StructuredGenerationResult<T>> {
    // 1. Fail-closed Check for Missing API Key
    if (!this.apiKey) {
      throw new Error('OpenAI Provider execution failed: Missing OPENAI_API_KEY. Configure OPENAI_API_KEY in authorized environment.');
    }

    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const timeoutMs = params.timeoutMs || this.defaultTimeoutMs;
    const maxTokens = Math.min(params.maxTokens || this.defaultMaxTokens, this.defaultMaxTokens);

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const url = `${this.baseUrl}/chat/completions`;

    const requestBody: any = {
      model: this.model,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt }
      ],
      temperature: params.temperature !== undefined ? params.temperature : 0.1,
      max_tokens: maxTokens,
      response_format: params.schema
        ? {
            type: 'json_schema',
            json_schema: {
              name: 'product_intelligence_output',
              strict: true,
              schema: params.schema
            }
          }
        : { type: 'json_object' }
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } catch (networkErr: any) {
      clearTimeout(timeoutTimer);
      if (networkErr.name === 'AbortError' || controller.signal.aborted) {
        throw new Error(`OpenAI Provider request timed out after ${timeoutMs}ms`);
      }
      throw new Error(`OpenAI Provider network error: ${networkErr.message || 'Connection failed'}`);
    } finally {
      clearTimeout(timeoutTimer);
    }

    const completedAt = new Date().toISOString();
    const latency = Date.now() - startTime;
    const httpStatus = response.status;
    const providerRequestId = response.headers.get('x-request-id') || undefined;

    // 2. HTTP Status Validation (Fail-closed)
    if (!response.ok) {
      let errorBodyText = '';
      try {
        errorBodyText = await response.text();
      } catch {
        errorBodyText = 'Unable to read error response';
      }

      // Sanitize any accidental token disclosure
      const sanitizedMessage = errorBodyText.replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]');

      if (httpStatus === 401) {
        throw new Error(`OpenAI authentication failed (HTTP 401 Unauthorized): Invalid or expired API key. Details: ${sanitizedMessage}`);
      }
      if (httpStatus === 403) {
        throw new Error(`OpenAI access forbidden (HTTP 403 Forbidden): Details: ${sanitizedMessage}`);
      }
      if (httpStatus === 429) {
        throw new Error(`OpenAI rate limit exceeded (HTTP 429 Too Many Requests): Details: ${sanitizedMessage}`);
      }
      if (httpStatus >= 500) {
        throw new Error(`OpenAI service error (HTTP ${httpStatus}): Details: ${sanitizedMessage}`);
      }
      throw new Error(`OpenAI API returned HTTP ${httpStatus}: ${sanitizedMessage}`);
    }

    // 3. Response JSON Parsing
    let responseJson: any;
    try {
      responseJson = await response.json();
    } catch (jsonErr: any) {
      throw new Error(`Failed to parse OpenAI API HTTP response as JSON: ${jsonErr.message}`);
    }

    // 4. Content and Token Telemetry Extraction
    const choice = responseJson.choices?.[0];
    if (!choice || !choice.message || typeof choice.message.content !== 'string') {
      throw new Error('OpenAI Provider returned response with missing or empty message content');
    }

    const rawContent = choice.message.content.trim();
    if (!rawContent) {
      throw new Error('OpenAI Provider returned empty message content string');
    }

    let parsedData: T;
    try {
      parsedData = JSON.parse(rawContent);
    } catch (parseErr: any) {
      throw new Error(`Failed to parse AI structured output as JSON: ${parseErr.message}. Content snippet: ${rawContent.slice(0, 100)}`);
    }

    const promptTokens = Number(responseJson.usage?.prompt_tokens || 0);
    const completionTokens = Number(responseJson.usage?.completion_tokens || 0);
    const totalTokens = Number(responseJson.usage?.total_tokens || (promptTokens + completionTokens));

    const finalModel = responseJson.model || this.model;
    const finalRequestId = providerRequestId || responseJson.id || crypto.randomUUID();
    const systemFingerprint = responseJson.system_fingerprint || undefined;
    const estimatedCost = this.calculateEstimatedCost(finalModel, promptTokens, completionTokens);

    const execution: AIExecutionDetails = {
      provider: 'openai',
      model: finalModel,
      prompt_version: '1.2.0',
      execution_id: crypto.randomUUID(),
      provider_request_id: finalRequestId,
      http_status: httpStatus,
      started_at: startedAt,
      completed_at: completedAt,
      latency,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
      token_source: 'REAL_PROVIDER_PAYLOAD',
      estimated_cost: estimatedCost,
      cost_source: 'CONFIGURED_PRICING_ESTIMATE',
      system_fingerprint: systemFingerprint
    };

    return {
      data: parsedData,
      rawText: rawContent,
      execution
    };
  }
}
