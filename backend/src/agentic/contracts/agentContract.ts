import { AIExecutionDetails } from '../../utils/ai';

export enum PermissionLevel {
  LEVEL_0 = 'LEVEL_0', // READ_ONLY
  LEVEL_1 = 'LEVEL_1', // CREATE_DRAFT
  LEVEL_2 = 'LEVEL_2', // MODIFY_DRAFT
  LEVEL_3 = 'LEVEL_3', // PRODUCTION_MUTATION
  LEVEL_4 = 'LEVEL_4'  // EXTERNAL_WRITE
}

export type AgentType = 'INTELLIGENCE' | 'CREATIVE' | 'PERFORMANCE' | 'QA_CERTIFICATION' | 'MOCK';

export type TaskStatus = 'PENDING' | 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'BLOCKED';

export interface AgentContract {
  agent_id: string;
  agent_type: AgentType;
  version: string;
  mission: string;
  input_schema: {
    type: string;
    required?: string[];
    properties?: Record<string, { type: string; description?: string }>;
  };
  output_schema: {
    type: string;
    required?: string[];
    properties?: Record<string, { type: string; description?: string }>;
  };
  allowed_tools: string[];
  allowed_reads: string[];
  allowed_writes: string[];
  prohibited_actions: string[];
  permission_level: PermissionLevel;
  max_execution_time_ms: number;
  max_retries: number;
  approval_required: boolean;
  evidence_required: boolean;
}

export interface AgentExecutionResult {
  status: 'COMPLETED' | 'FAILED' | 'BLOCKED';
  output_payload?: any;
  error_message?: string;
  execution_details: AIExecutionDetails;
  tools_used: string[];
  artifacts_created: string[];
}

export interface IAgent {
  getContract(): AgentContract;
  execute(input: any, context?: { sessionId: string; taskId: string }): Promise<AgentExecutionResult>;
}

export function validateAgentContract(contract: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!contract || typeof contract !== 'object') {
    return { valid: false, errors: ['Contract is null or undefined'] };
  }
  
  if (!contract.agent_id || typeof contract.agent_id !== 'string') errors.push('agent_id is required and must be a string');
  if (!contract.agent_type || typeof contract.agent_type !== 'string') errors.push('agent_type is required');
  if (!contract.version || typeof contract.version !== 'string') errors.push('version is required and must be a string');
  if (!contract.mission || typeof contract.mission !== 'string') errors.push('mission is required and must be a string');
  
  if (!contract.input_schema || typeof contract.input_schema !== 'object') errors.push('input_schema is required');
  if (!contract.output_schema || typeof contract.output_schema !== 'object') errors.push('output_schema is required');
  
  if (!Array.isArray(contract.allowed_tools)) errors.push('allowed_tools must be an array');
  if (!Array.isArray(contract.allowed_reads)) errors.push('allowed_reads must be an array');
  if (!Array.isArray(contract.allowed_writes)) errors.push('allowed_writes must be an array');
  if (!Array.isArray(contract.prohibited_actions)) errors.push('prohibited_actions must be an array');
  
  if (!contract.permission_level || !Object.values(PermissionLevel).includes(contract.permission_level)) {
    errors.push(`permission_level must be one of: ${Object.values(PermissionLevel).join(', ')}`);
  }
  
  if (typeof contract.max_execution_time_ms !== 'number' || contract.max_execution_time_ms <= 0) {
    errors.push('max_execution_time_ms must be a positive number');
  }
  if (typeof contract.max_retries !== 'number' || contract.max_retries < 0) {
    errors.push('max_retries must be a non-negative number');
  }
  if (typeof contract.approval_required !== 'boolean') errors.push('approval_required must be a boolean');
  if (typeof contract.evidence_required !== 'boolean') errors.push('evidence_required must be a boolean');
  
  return { valid: errors.length === 0, errors };
}

export function validateAgentInput(contract: AgentContract, input: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (input === null || input === undefined || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be a non-null object'] };
  }
  
  const schema = contract.input_schema;
  if (schema?.required && Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (input[field] === undefined || input[field] === null) {
        errors.push(`Missing required input field: "${field}"`);
      }
    }
  }
  
  if (schema?.properties && typeof schema.properties === 'object') {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (input[key] !== undefined && input[key] !== null) {
        const actualType = Array.isArray(input[key]) ? 'array' : typeof input[key];
        if (prop.type && actualType !== prop.type) {
          errors.push(`Field "${key}" must be of type ${prop.type}, got ${actualType}`);
        }
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}
