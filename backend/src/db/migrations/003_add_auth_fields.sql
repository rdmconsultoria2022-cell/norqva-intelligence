-- Migration 003: Add Supabase auth_user_id and enable audit logs read restrictions

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Conditionally create Supabase RLS policy only if role 'authenticated' and auth.uid() function exist in this PostgreSQL instance
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AND
     EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'auth' AND p.proname = 'uid') THEN
    DROP POLICY IF EXISTS select_admin_audit_logs ON audit_logs;
    EXECUTE '
      CREATE POLICY select_admin_audit_logs ON audit_logs
        FOR SELECT TO authenticated
        USING (
          auth.uid() IN (
            SELECT auth_user_id FROM users WHERE role = ''ADMIN''
          )
        )
    ';
  END IF;
END $$;
