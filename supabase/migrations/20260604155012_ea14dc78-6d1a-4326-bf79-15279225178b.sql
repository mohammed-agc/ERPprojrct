
-- Restrict customers writes to accounting/sales/managers
DROP POLICY IF EXISTS "auth insert customers" ON public.customers;
DROP POLICY IF EXISTS "auth update customers" ON public.customers;

CREATE POLICY "sales_accounting_insert_customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'accounting')
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'vehicles')
  );

CREATE POLICY "sales_accounting_update_customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'accounting')
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'vehicles')
  )
  WITH CHECK (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'accounting')
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'vehicles')
  );

-- Lock down user_roles writes to admins only
CREATE POLICY "admin_insert_user_roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_update_user_roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_delete_user_roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
