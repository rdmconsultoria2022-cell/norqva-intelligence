import { AgentContract, IAgent, validateAgentContract } from '../contracts/agentContract';

export class AgentRegistry {
  private static instance: AgentRegistry;
  private agents: Map<string, IAgent> = new Map();

  private constructor() {}

  public static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  public registerAgent(agent: IAgent): void {
    if (!agent || typeof agent.getContract !== 'function') {
      throw new Error('Cannot register agent: Agent does not implement IAgent interface');
    }
    const contract = agent.getContract();
    const validation = validateAgentContract(contract);
    if (!validation.valid) {
      throw new Error(`Cannot register agent "${contract?.agent_id || 'unknown'}": Invalid contract (${validation.errors.join(', ')})`);
    }
    this.agents.set(contract.agent_id, agent);
  }

  public getAgent(agentId: string): IAgent {
    if (!agentId || typeof agentId !== 'string') {
      throw new Error('agent_id is required');
    }
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: "${agentId}". Fail-Closed guard blocked execution.`);
    }
    return agent;
  }

  public hasAgent(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  public listAgents(): AgentContract[] {
    return Array.from(this.agents.values()).map(a => a.getContract());
  }

  public clear(): void {
    this.agents.clear();
  }
}
