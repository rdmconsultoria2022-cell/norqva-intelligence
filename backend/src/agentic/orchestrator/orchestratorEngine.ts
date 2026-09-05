import { Pool } from 'pg';
import crypto from 'crypto';
import { AgentRegistry } from '../registry/agentRegistry';
import { PermissionEngine } from '../permissions/permissionEngine';
import { DAGEngine, DAGTaskNode } from '../dag/dagEngine';
import { TaskStatus, PermissionLevel } from '../contracts/agentContract';

export interface CreateSessionParams {
  objective: string;
  tasks?: Array<{
    human_id?: string;
    agent_id: string;
    agent_version?: string;
    depends_on?: string[];
    permission_level?: PermissionLevel;
    input_payload?: any;
    timeout_ms?: number;
    max_retries?: number;
  }>;
  user_id?: string | null;
  is_demo?: boolean;
}

export class AgentOrchestratorEngine {
  private pool: Pool;
  private registry: AgentRegistry;

  constructor(pool: Pool) {
    this.pool = pool;
    this.registry = AgentRegistry.getInstance();
  }

  public async createSession(params: CreateSessionParams): Promise<{ session: any; tasks: any[] }> {
    if (!params.objective || typeof params.objective !== 'string' || !params.objective.trim()) {
      throw new Error('objective is required and cannot be empty');
    }

    const sessionId = crypto.randomUUID();
    const sessionHumanId = `SES-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const isDemo = params.is_demo ?? false;

    // Define tasks or fallback to single default MOCK_AGENT task
    const inputTasks = params.tasks && params.tasks.length > 0
      ? params.tasks
      : [
          {
            human_id: 'TSK-001',
            agent_id: 'MOCK_AGENT_V1',
            agent_version: '1.0.0',
            depends_on: [],
            permission_level: PermissionLevel.LEVEL_0,
            input_payload: { objective: params.objective.trim() },
            timeout_ms: 5000,
            max_retries: 2
          }
        ];

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const sessionRes = await client.query(
        `INSERT INTO agent_orchestration_sessions (
           id, human_id, objective, status, user_id, is_demo, total_tasks, completed_tasks, failed_tasks, metadata
         )
         VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, 0, 0, $7)
         RETURNING *`,
        [sessionId, sessionHumanId, params.objective.trim(), params.user_id || null, isDemo, inputTasks.length, JSON.stringify({})]
      );
      const session = sessionRes.rows[0];

      const createdTasks: any[] = [];
      for (let i = 0; i < inputTasks.length; i++) {
        const t = inputTasks[i];
        const taskId = crypto.randomUUID();
        const taskHumanId = t.human_id || `TSK-${String(i + 1).padStart(3, '0')}`;
        const taskRes = await client.query(
          `INSERT INTO agent_tasks (
             id, session_id, human_id, agent_id, agent_version, depends_on, status, permission_level,
             input_payload, timeout_ms, max_retries
           )
           VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, $10)
           RETURNING *`,
          [
            taskId,
            sessionId,
            taskHumanId,
            t.agent_id,
            t.agent_version || '1.0.0',
            t.depends_on || [],
            t.permission_level || PermissionLevel.LEVEL_0,
            JSON.stringify(t.input_payload || {}),
            t.timeout_ms || 30000,
            t.max_retries ?? 0
          ]
        );
        createdTasks.push(taskRes.rows[0]);
      }

      await client.query('COMMIT');
      return { session, tasks: createdTasks };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async executeSession(sessionId: string): Promise<{ session: any; tasks: any[]; logs: any[] }> {
    const client = await this.pool.connect();
    try {
      // 1. Load Session and Tasks
      const sessRes = await client.query('SELECT * FROM agent_orchestration_sessions WHERE id = $1', [sessionId]);
      if (sessRes.rows.length === 0) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      const session = sessRes.rows[0];

      const tasksRes = await client.query('SELECT * FROM agent_tasks WHERE session_id = $1 ORDER BY created_at ASC', [sessionId]);
      let tasks: DAGTaskNode[] = tasksRes.rows.map(r => ({
        task_id: r.id,
        human_id: r.human_id,
        agent_id: r.agent_id,
        depends_on: r.depends_on || [],
        status: r.status as TaskStatus,
        input_payload: r.input_payload,
        output_payload: r.output_payload,
        error_message: r.error_message,
        retry_count: r.retry_count
      }));

      // 2. DAG Cycle Detection
      const cycleCheck = DAGEngine.detectCycle(tasks);
      if (cycleCheck.hasCycle) {
        await client.query(
          `UPDATE agent_orchestration_sessions 
           SET status = 'BLOCKED', finished_at = NOW(), metadata = jsonb_set(metadata, '{cycle_detected}', 'true')
           WHERE id = $1`,
          [sessionId]
        );
        await client.query(
          `UPDATE agent_tasks 
           SET status = 'BLOCKED', error_message = 'DAG cycle detected. Execution blocked fail-closed.'
           WHERE session_id = $1 AND status = 'PENDING'`,
          [sessionId]
        );
        return this.getSessionDetails(sessionId);
      }

      // Mark session RUNNING
      await client.query("UPDATE agent_orchestration_sessions SET status = 'RUNNING' WHERE id = $1", [sessionId]);

      // 3. Execution Loop
      let continueLoop = true;
      while (continueLoop) {
        // Cascade blocked states
        tasks = DAGEngine.cascadeBlockedTasks(tasks);

        const executable = DAGEngine.getNextExecutableTasks(tasks);
        if (executable.length === 0) {
          // No more executable tasks
          break;
        }

        // Execute batch of ready tasks
        for (const taskNode of executable) {
          const rawDbTask = tasksRes.rows.find(r => r.id === taskNode.task_id);
          const permissionLevel = (rawDbTask?.permission_level || PermissionLevel.LEVEL_0) as PermissionLevel;
          const timeoutMs = rawDbTask?.timeout_ms || 30000;
          const maxRetries = rawDbTask?.max_retries ?? 0;

          // Permission Ceiling Check (Fail-Closed)
          const permCheck = PermissionEngine.isPermissionAllowed(permissionLevel);
          if (!permCheck.allowed) {
            taskNode.status = 'BLOCKED';
            taskNode.error_message = permCheck.reason;

            await client.query(
              `UPDATE agent_tasks 
               SET status = 'BLOCKED', error_message = $1, finished_at = NOW() 
               WHERE id = $2`,
              [permCheck.reason, taskNode.task_id]
            );

            // Log blocked execution
            await this.writeExecutionLog(client, sessionId, taskNode.task_id, taskNode.agent_id, rawDbTask?.agent_version || '1.0.0', {
              startedAt: new Date(),
              finishedAt: new Date(),
              status: 'BLOCKED',
              input: taskNode.input_payload,
              output: {},
              error: permCheck.reason,
              permissionLevel,
              retryCount: 0
            });
            continue;
          }

          // Resolve Agent in Registry
          let agent: any;
          try {
            agent = this.registry.getAgent(taskNode.agent_id);
          } catch (agentErr: any) {
            taskNode.status = 'BLOCKED';
            taskNode.error_message = agentErr.message;

            await client.query(
              `UPDATE agent_tasks 
               SET status = 'BLOCKED', error_message = $1, finished_at = NOW() 
               WHERE id = $2`,
              [agentErr.message, taskNode.task_id]
            );

            await this.writeExecutionLog(client, sessionId, taskNode.task_id, taskNode.agent_id, rawDbTask?.agent_version || '1.0.0', {
              startedAt: new Date(),
              finishedAt: new Date(),
              status: 'BLOCKED',
              input: taskNode.input_payload,
              output: {},
              error: agentErr.message,
              permissionLevel,
              retryCount: 0
            });
            continue;
          }

          // Execute Agent with timeout & retry handling
          await client.query("UPDATE agent_tasks SET status = 'RUNNING', started_at = NOW() WHERE id = $1", [taskNode.task_id]);
          taskNode.status = 'RUNNING';

          let attempt = 0;
          let success = false;
          let lastResult: any = null;
          let lastError: string | null = null;
          const taskStartedAt = new Date();

          while (attempt <= maxRetries && !success) {
            const attemptStart = new Date();
            try {
              // Timeout wrapper Promise.race
              const execPromise = agent.execute(taskNode.input_payload, { sessionId, taskId: taskNode.task_id });
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Task execution timed out after ${timeoutMs}ms`)), timeoutMs)
              );

              const result: any = await Promise.race([execPromise, timeoutPromise]);
              lastResult = result;

              if (result.status === 'COMPLETED') {
                success = true;
                taskNode.status = 'COMPLETED';
                taskNode.output_payload = result.output_payload;

                await client.query(
                  `UPDATE agent_tasks 
                   SET status = 'COMPLETED', output_payload = $1, finished_at = NOW(), retry_count = $2 
                   WHERE id = $3`,
                  [JSON.stringify(result.output_payload || {}), attempt, taskNode.task_id]
                );

                await this.writeExecutionLog(client, sessionId, taskNode.task_id, taskNode.agent_id, rawDbTask?.agent_version || '1.0.0', {
                  startedAt: attemptStart,
                  finishedAt: new Date(),
                  status: 'COMPLETED',
                  input: taskNode.input_payload,
                  output: result.output_payload,
                  details: result.execution_details,
                  toolsUsed: result.tools_used || [],
                  artifactsCreated: result.artifacts_created || [],
                  permissionLevel,
                  retryCount: attempt
                });
              } else {
                // Agent returned BLOCKED or FAILED
                lastError = result.error_message || 'Agent returned non-completed status';
                attempt++;
              }
            } catch (execErr: any) {
              lastError = execErr.message || 'Execution error';
              attempt++;
            }
          }

          if (!success) {
            const finalStatus = lastResult?.status === 'BLOCKED' ? 'BLOCKED' : 'FAILED';
            taskNode.status = finalStatus;
            taskNode.error_message = lastError || 'Execution failed after maximum retries';

            await client.query(
              `UPDATE agent_tasks 
               SET status = $1, error_message = $2, finished_at = NOW(), retry_count = $3 
               WHERE id = $4`,
              [finalStatus, taskNode.error_message, Math.max(0, attempt - 1), taskNode.task_id]
            );

            await this.writeExecutionLog(client, sessionId, taskNode.task_id, taskNode.agent_id, rawDbTask?.agent_version || '1.0.0', {
              startedAt: taskStartedAt,
              finishedAt: new Date(),
              status: finalStatus,
              input: taskNode.input_payload,
              output: {},
              error: taskNode.error_message,
              permissionLevel,
              retryCount: Math.max(0, attempt - 1)
            });
          }
        }
      }

      // 4. Update Final Session Status & Telemetry Rollup
      const finalTasksRes = await client.query('SELECT * FROM agent_tasks WHERE session_id = $1', [sessionId]);
      const finalTasks = finalTasksRes.rows;

      const completedCount = finalTasks.filter(t => t.status === 'COMPLETED').length;
      const failedCount = finalTasks.filter(t => t.status === 'FAILED').length;
      const blockedCount = finalTasks.filter(t => t.status === 'BLOCKED').length;

      let finalSessionStatus: TaskStatus = 'COMPLETED';
      if (failedCount > 0) {
        finalSessionStatus = 'FAILED';
      } else if (blockedCount > 0 || completedCount < finalTasks.length) {
        finalSessionStatus = 'BLOCKED';
      }

      // Aggregate telemetry from logs
      const rollupRes = await client.query(
        `SELECT 
           COALESCE(SUM(tokens_input), 0)::int AS total_input_tokens,
           COALESCE(SUM(tokens_output), 0)::int AS total_output_tokens,
           COALESCE(SUM(estimated_cost_usd), 0.000000)::numeric(10,6) AS total_estimated_cost
         FROM agent_execution_logs
         WHERE session_id = $1`,
        [sessionId]
      );
      const totalInputTokens = rollupRes.rows[0]?.total_input_tokens || 0;
      const totalOutputTokens = rollupRes.rows[0]?.total_output_tokens || 0;
      const totalEstimatedCost = rollupRes.rows[0]?.total_estimated_cost || '0.000000';

      await client.query(
        `UPDATE agent_orchestration_sessions 
         SET status = $1, finished_at = NOW(), completed_tasks = $2, failed_tasks = $3,
             total_input_tokens = $4, total_output_tokens = $5, total_estimated_cost = $6
         WHERE id = $7`,
        [finalSessionStatus, completedCount, failedCount + blockedCount, totalInputTokens, totalOutputTokens, totalEstimatedCost, sessionId]
      );

      return this.getSessionDetails(sessionId);
    } finally {
      client.release();
    }
  }

  public async getSessionDetails(sessionId: string): Promise<{ session: any; tasks: any[]; logs: any[] }> {
    const sessRes = await this.pool.query('SELECT * FROM agent_orchestration_sessions WHERE id = $1', [sessionId]);
    if (sessRes.rows.length === 0) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const tasksRes = await this.pool.query('SELECT * FROM agent_tasks WHERE session_id = $1 ORDER BY created_at ASC', [sessionId]);
    const logsRes = await this.pool.query('SELECT * FROM agent_execution_logs WHERE session_id = $1 ORDER BY created_at ASC', [sessionId]);

    return {
      session: sessRes.rows[0],
      tasks: tasksRes.rows,
      logs: logsRes.rows
    };
  }

  private async writeExecutionLog(
    client: any,
    sessionId: string,
    taskId: string,
    agentId: string,
    agentVersion: string,
    data: {
      startedAt: Date;
      finishedAt: Date;
      status: string;
      input: any;
      output: any;
      error?: string;
      details?: any;
      toolsUsed?: string[];
      artifactsCreated?: string[];
      permissionLevel: PermissionLevel;
      retryCount: number;
    }
  ) {
    const durationMs = Math.max(0, data.finishedAt.getTime() - data.startedAt.getTime());
    await client.query(
      `INSERT INTO agent_execution_logs (
         session_id, task_id, agent_id, agent_version, started_at, finished_at, duration_ms, status,
         input_payload, output_payload, provider, model, tokens_input, tokens_output, tokens_total,
         estimated_cost_usd, tools_used, artifacts_created, errors, retry_count, permission_level, approval_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
      [
        sessionId,
        taskId,
        agentId,
        agentVersion,
        data.startedAt,
        data.finishedAt,
        durationMs,
        data.status,
        JSON.stringify(data.input || {}),
        JSON.stringify(data.output || {}),
        data.details?.provider || 'MOCK',
        data.details?.model || 'MOCK_V1',
        data.details?.input_tokens || 0,
        data.details?.output_tokens || 0,
        (data.details?.input_tokens || 0) + (data.details?.output_tokens || 0),
        data.details?.estimated_cost || 0.000000,
        data.toolsUsed || [],
        data.artifactsCreated || [],
        data.error ? [data.error] : [],
        data.retryCount || 0,
        data.permissionLevel || 'LEVEL_0',
        'NOT_REQUIRED'
      ]
    );
  }
}
