-- Migration: add RLS policy for branches (parity with warehouses/departments/system_settings)
-- branches has RLS enabled but no policy. Apply same pattern as sibling tables.

DROP POLICY IF EXISTS auth_all_branches ON branches;

CREATE POLICY auth_all_branches ON branches
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);