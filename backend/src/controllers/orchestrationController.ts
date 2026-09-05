import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { AgentOrchestratorEngine } from '../agentic/orchestrator/orchestratorEngine';
import { AgentRegistry } from '../agentic/registry/agentRegistry';
import { MockAgentV1 } from '../agentic/agents/mockAgent';
import { ProductIntelligenceAgentV1 } from '../agentic/agents/productIntelligenceAgent';

// Bootstrap default registry with MockAgentV1 and ProductIntelligenceAgentV1
const registry = AgentRegistry.getInstance();
if (!registry.hasAgent('MOCK_AGENT_V1')) {
  registry.registerAgent(new MockAgentV1());
}
if (!registry.hasAgent('PRODUCT_INTELLIGENCE_AGENT_V1')) {
  registry.registerAgent(new ProductIntelligenceAgentV1());
}

export async function createOrchestrationSession(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const { objective, tasks } = req.body;

    if (!objective || typeof objective !== 'string' || !objective.trim()) {
      return res.status(400).json({ error: 'objective is required and cannot be empty.' });
    }

    const engine = new AgentOrchestratorEngine(pool);
    const { session, tasks: createdTasks } = await engine.createSession({
      objective,
      tasks,
      user_id: req.user?.id || null,
      is_demo: isDemo
    });

    // Execute session deterministically
    const executionResult = await engine.executeSession(session.id);

    return res.status(201).json({
      session: executionResult.session,
      tasks: executionResult.tasks,
      logs: executionResult.logs
    });
  } catch (err: any) {
    console.error('Create orchestration session error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create orchestration session.' });
  }
}

export async function getOrchestrationSessionById(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Session id is required.' });
    }

    const engine = new AgentOrchestratorEngine(pool);
    const details = await engine.getSessionDetails(id);

    return res.status(200).json(details);
  } catch (err: any) {
    if (err.message && err.message.includes('Session not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('Get orchestration session error:', err);
    return res.status(500).json({ error: 'Failed to fetch orchestration session.' });
  }
}
