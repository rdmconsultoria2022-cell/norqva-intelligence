-- Migration 012: NORQVA Agentic Foundation 1.0 Core Tables

CREATE TABLE IF NOT EXISTS agent_orchestration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(50) UNIQUE NOT NULL,
  objective TEXT NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'BLOCKED')) DEFAULT 'PENDING',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  total_tasks INT NOT NULL DEFAULT 0,
  completed_tasks INT NOT NULL DEFAULT 0,
  failed_tasks INT NOT NULL DEFAULT 0,
  total_input_tokens INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  total_estimated_cost NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
  metadata JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE agent_orchestration_sessions ADD COLUMN IF NOT EXISTS total_input_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE agent_orchestration_sessions ADD COLUMN IF NOT EXISTS total_output_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE agent_orchestration_sessions ADD COLUMN IF NOT EXISTS total_estimated_cost NUMERIC(10, 6) NOT NULL DEFAULT 0.000000;

CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_orchestration_sessions(id) ON DELETE CASCADE,
  human_id VARCHAR(50) NOT NULL,
  agent_id VARCHAR(100) NOT NULL,
  agent_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
  depends_on TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'BLOCKED')) DEFAULT 'PENDING',
  permission_level VARCHAR(50) NOT NULL CHECK (permission_level IN ('LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4')) DEFAULT 'LEVEL_0',
  input_payload JSONB NOT NULL DEFAULT '{}',
  output_payload JSONB,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 0,
  timeout_ms INT NOT NULL DEFAULT 30000,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_orchestration_sessions(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  agent_id VARCHAR(100) NOT NULL,
  agent_version VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  duration_ms INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  input_payload JSONB NOT NULL DEFAULT '{}',
  output_payload JSONB NOT NULL DEFAULT '{}',
  provider VARCHAR(50) NOT NULL DEFAULT 'MOCK',
  model VARCHAR(100) NOT NULL DEFAULT 'MOCK_V1',
  tokens_input INT NOT NULL DEFAULT 0,
  tokens_output INT NOT NULL DEFAULT 0,
  tokens_total INT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
  tools_used TEXT[] NOT NULL DEFAULT '{}',
  artifacts_created TEXT[] NOT NULL DEFAULT '{}',
  errors TEXT[] NOT NULL DEFAULT '{}',
  retry_count INT NOT NULL DEFAULT 0,
  permission_level VARCHAR(50) NOT NULL DEFAULT 'LEVEL_0',
  approval_status VARCHAR(50) NOT NULL DEFAULT 'NOT_REQUIRED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_orchestration_sessions(status, is_demo);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_session ON agent_tasks(session_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_execution_logs_session_task ON agent_execution_logs(session_id, task_id);
