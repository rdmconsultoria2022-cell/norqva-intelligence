-- H1 (NORQVA_DECISION_GOVERNANCE_HARDENING_PLAN): registro forense e imutável das decisões que mexem
-- (ou pedem para mexer) na Meta. Somente aditiva: nenhuma tabela existente é alterada.
--
-- Cada decisão gera uma linha REQUESTED antes da execução e uma linha de resultado
-- (EXECUTED | REJECTED | FAILED) depois, ligadas por correlation_id.
-- Sem FK para users/launch_plans de propósito: um ON DELETE SET NULL seria um UPDATE,
-- e a tabela não aceita UPDATE.
-- Nunca guarda token, cookie, Authorization, senha ou segredo (a aplicação higieniza antes).

CREATE TABLE IF NOT EXISTS decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  phase VARCHAR(20) NOT NULL CHECK (phase IN ('REQUESTED', 'EXECUTED', 'REJECTED', 'FAILED')),
  action VARCHAR(60) NOT NULL,
  decision VARCHAR(60),
  plan_id UUID,
  plan_code VARCHAR(60),
  user_id UUID,
  user_email VARCHAR(255),
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('HUMAN', 'AUTOMATION', 'SYSTEM')),
  session_id VARCHAR(128),
  ip VARCHAR(64),
  user_agent VARCHAR(512),
  meta_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  result JSONB,
  error TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pii_purged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_decision_events_correlation ON decision_events (correlation_id);
CREATE INDEX IF NOT EXISTS idx_decision_events_plan ON decision_events (plan_id, created_at);
CREATE INDEX IF NOT EXISTS idx_decision_events_created ON decision_events (created_at);

-- Imutabilidade (Postgres real. O emulador pg-mem dos testes locais não executa blocos DO).
-- UPDATE, DELETE e TRUNCATE são recusados. Única exceção: a função de retenção abaixo, que só
-- apaga ip/user_agent de eventos com mais de N dias e marca pii_purged_at. Qualquer outra coluna
-- alterada faz o UPDATE falhar, mesmo dentro da função.
DO $$
BEGIN
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION decision_events_guard() RETURNS trigger AS $body$
    BEGIN
      IF TG_OP = 'UPDATE'
         AND current_setting('norqva.decision_events_pii_purge', true) = 'on'
         AND NEW.ip IS NULL
         AND NEW.user_agent IS NULL
         AND NEW.pii_purged_at IS NOT NULL
         AND (to_jsonb(NEW) - 'ip' - 'user_agent' - 'pii_purged_at') = (to_jsonb(OLD) - 'ip' - 'user_agent' - 'pii_purged_at')
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'decision_events is append-only: % blocked', TG_OP USING ERRCODE = '42501';
    END
    $body$ LANGUAGE plpgsql
  $f$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_decision_events_immutable ON decision_events';
  EXECUTE 'CREATE TRIGGER trg_decision_events_immutable BEFORE UPDATE OR DELETE ON decision_events FOR EACH ROW EXECUTE FUNCTION decision_events_guard()';
  EXECUTE 'DROP TRIGGER IF EXISTS trg_decision_events_no_truncate ON decision_events';
  EXECUTE 'CREATE TRIGGER trg_decision_events_no_truncate BEFORE TRUNCATE ON decision_events FOR EACH STATEMENT EXECUTE FUNCTION decision_events_guard()';

  -- Retenção LGPD: IP e user-agent ficam no máximo retention_days (padrão 180) dias.
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION purge_decision_event_pii(retention_days INTEGER DEFAULT 180) RETURNS INTEGER AS $body$
    DECLARE
      n INTEGER;
    BEGIN
      IF retention_days IS NULL OR retention_days < 1 THEN
        RAISE EXCEPTION 'retention_days must be >= 1';
      END IF;
      PERFORM set_config('norqva.decision_events_pii_purge', 'on', true);
      UPDATE decision_events
         SET ip = NULL, user_agent = NULL, pii_purged_at = NOW()
       WHERE pii_purged_at IS NULL
         AND (ip IS NOT NULL OR user_agent IS NOT NULL)
         AND created_at < NOW() - make_interval(days => retention_days);
      GET DIAGNOSTICS n = ROW_COUNT;
      PERFORM set_config('norqva.decision_events_pii_purge', 'off', true);
      RETURN n;
    END
    $body$ LANGUAGE plpgsql
  $f$;
END $$;
