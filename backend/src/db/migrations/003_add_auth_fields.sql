-- Migration 003: Add Supabase auth_user_id and enable audit logs read restrictions

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DROP POLICY IF EXISTS select_admin_audit_logs ON audit_logs;

-- Policy to allow select only to admins mapped in the NORQVA users table
CREATE POLICY select_admin_audit_logs ON audit_logs
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (
      SELECT auth_user_id FROM users WHERE role = 'ADMIN'
    )
  );
