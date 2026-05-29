CREATE OR REPLACE FUNCTION public.admin_list_sessions()
RETURNS TABLE (
  session_id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  refreshed_at TIMESTAMP,
  not_after TIMESTAMPTZ,
  aal TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    u.email::text,
    COALESCE(p.full_name, u.email)::text,
    host(s.ip)::text,
    s.user_agent,
    s.created_at,
    s.updated_at,
    s.refreshed_at,
    s.not_after,
    s.aal::text
  FROM auth.sessions s
  JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_sessions() TO authenticated;