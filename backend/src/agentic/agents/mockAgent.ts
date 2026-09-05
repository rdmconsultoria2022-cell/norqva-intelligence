import { AgentContract, IAgent, PermissionLevel, AgentExecutionResult, validateAgentInput } from '../contracts/agentContract';
import { AIExecutionDetails } from '../../utils/ai';
import crypto from 'crypto';

export class MockAgentV1 implements IAgent {
  private contract: AgentContract = {
    agent_id: 'MOCK_AGENT_V1',
    agent_type: 'MOCK',
    version: '1.0.0',
    mission: 'Deterministic Mock Agent for Orchestration Certification',
    input_schema: {
      type: 'object',
      required: ['objective'],
      properties: {
        objective: { type: 'string', description: 'Objective statement for the mock execution' }
      }
    },
    output_schema: {
      type: 'object',
      required: ['status', 'summary', 'evidence'],
      properties: {
        status: { type: 'string' },
        summary: { type: 'string' },
        evidence: { type: 'array' }
      }
    },
    allowed_tools: ['mock_tool_echo', 'mock_evidence_collector'],
    allowed_reads: ['/api/public/offers'],
    allowed_writes: [],
    prohibited_actions: ['meta_mutate', 'payment_execute', 'llm_external_call'],
    permission_level: PermissionLevel.LEVEL_0,
    max_execution_time_ms: 5000,
    max_retries: 2,
    approval_required: false,
    evidence_required: false
  };

  public getContract(): AgentContract {
    return { ...this.contract };
  }

  public async execute(input: any, context?: { sessionId: string; taskId: string }): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const validation = validateAgentInput(this.contract, input);
    if (!validation.valid) {
      const details: AIExecutionDetails = {
        provider: 'MOCK',
        model: 'MOCK_V1',
        prompt_version: '1.0.0',
        execution_id: crypto.randomUUID(),
        latency: Date.now() - startTime,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost: 0
      };
      return {
        status: 'BLOCKED',
        error_message: `Input schema violation: ${validation.errors.join(', ')}`,
        execution_details: details,
        tools_used: [],
        artifacts_created: []
      };
    }

    const latency = Math.max(1, Date.now() - startTime);
    const details: AIExecutionDetails = {
      provider: 'MOCK',
      model: 'MOCK_V1',
      prompt_version: '1.0.0',
      execution_id: crypto.randomUUID(),
      latency,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost: 0
    };

    return {
      status: 'COMPLETED',
      output_payload: {
        status: 'COMPLETED',
        summary: `Mock execution completed for: ${input.objective}`,
        evidence: []
      },
      execution_details: details,
      tools_used: ['mock_tool_echo'],
      artifacts_created: []
    };
  }
}
