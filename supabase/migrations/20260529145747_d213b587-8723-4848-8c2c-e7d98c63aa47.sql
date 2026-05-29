-- 1. Audit log table
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text,
  action text NOT NULL,
  module text NOT NULL,
  document_type text,
  document_id text,
  document_code text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX idx_audit_log_user_id ON public.audit_log (user_id);
CREATE INDEX idx_audit_log_module ON public.audit_log (module);

-- 2. Grants
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

-- 3. RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "auth read audit_log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "auth insert audit_log"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());