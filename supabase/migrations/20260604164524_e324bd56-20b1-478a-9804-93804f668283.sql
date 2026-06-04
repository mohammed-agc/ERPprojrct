
-- 1. Harden approve_goods_return RPC with internal role check
CREATE OR REPLACE FUNCTION public.approve_goods_return(p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_r       RECORD;
  v_je_id   uuid;
  v_acc_cogs uuid;
  v_acc_inv  uuid;
  v_landed   numeric;
BEGIN
  IF NOT public.is_manager_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: manager or admin role required';
  END IF;

  SELECT * INTO v_r FROM public.goods_return_requests WHERE id = p_request_id FOR UPDATE;
  IF v_r.id IS NULL THEN RAISE EXCEPTION 'طلب مرتجع غير موجود'; END IF;
  IF v_r.status = 'reinstated' THEN RETURN v_r.cogs_reversal_je_id; END IF;
  IF v_r.status NOT IN ('pending','inspected','approved') THEN
    RAISE EXCEPTION 'حالة الطلب لا تسمح بالاعتماد: %', v_r.status;
  END IF;

  SELECT id INTO v_acc_cogs FROM public.accounts WHERE code='5100' LIMIT 1;
  SELECT id INTO v_acc_inv  FROM public.accounts WHERE code='1310' LIMIT 1;
  IF v_acc_cogs IS NULL OR v_acc_inv IS NULL THEN
    RAISE EXCEPTION 'دليل الحسابات ناقص (5100/1310)';
  END IF;

  SELECT landed_cost INTO v_landed FROM public.compute_vehicle_landed_cost(v_r.vehicle_id);
  IF COALESCE(v_landed,0) <= 0 THEN
    RAISE EXCEPTION 'تكلفة المركبة غير معروفة — تعذّر عكس COGS';
  END IF;

  INSERT INTO public.journal_entries (
    entry_no, entry_date, reference, description,
    source_type, source_id, is_posted, created_by
  ) VALUES (
    'RET-JE-' || v_r.request_no, CURRENT_DATE, v_r.request_no,
    'إعادة مخزون + عكس COGS — مرتجع ' || v_r.request_no,
    'goods_return', v_r.id, false, auth.uid()
  ) RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES
    (v_je_id, v_acc_inv,  v_landed, 0,        'إعادة مخزون مركبة — ' || v_r.request_no),
    (v_je_id, v_acc_cogs, 0,        v_landed, 'عكس COGS — ' || v_r.request_no);

  UPDATE public.journal_entries SET is_posted = true WHERE id = v_je_id;
  UPDATE public.vehicles SET status = 'available' WHERE id = v_r.vehicle_id;
  UPDATE public.goods_return_requests
     SET status = 'reinstated',
         approved_by = COALESCE(approved_by, auth.uid()),
         approved_at = COALESCE(approved_at, now()),
         reinstated_at = now(),
         cogs_reversal_je_id = v_je_id
   WHERE id = v_r.id;

  RETURN v_je_id;
END;
$function$;

-- 2. goods_return_requests: restrict UPDATE to managers/admins
DROP POLICY IF EXISTS "auth update goods_return_requests" ON public.goods_return_requests;
CREATE POLICY "managers_update_goods_return_requests"
  ON public.goods_return_requests FOR UPDATE TO authenticated
  USING (public.is_manager_or_admin(auth.uid()))
  WITH CHECK (public.is_manager_or_admin(auth.uid()));

-- 3. credit_notes: restrict UPDATE to accounting/managers
DROP POLICY IF EXISTS "auth update credit_notes" ON public.credit_notes;
CREATE POLICY "accounting_update_credit_notes"
  ON public.credit_notes FOR UPDATE TO authenticated
  USING (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'accounting'))
  WITH CHECK (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'accounting'));

-- 4. vehicle_costs: restrict UPDATE/DELETE to vehicles dept/managers
DROP POLICY IF EXISTS "auth update vehicle_costs" ON public.vehicle_costs;
DROP POLICY IF EXISTS "auth delete vehicle_costs" ON public.vehicle_costs;
CREATE POLICY "vehicles_update_vehicle_costs"
  ON public.vehicle_costs FOR UPDATE TO authenticated
  USING (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'vehicles'))
  WITH CHECK (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'vehicles'));
CREATE POLICY "vehicles_delete_vehicle_costs"
  ON public.vehicle_costs FOR DELETE TO authenticated
  USING (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'vehicles'));

-- 5. invoices: restrict writes to accounting/sales depts and managers
DROP POLICY IF EXISTS "auth manage invoices" ON public.invoices;
CREATE POLICY "dept_insert_invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (
      SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')
    ));
CREATE POLICY "dept_update_invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (
      SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')
    ))
  WITH CHECK (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (
      SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')
    ));
CREATE POLICY "admin_delete_invoices"
  ON public.invoices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 6. audit_log: restrict SELECT to admins/managers
DROP POLICY IF EXISTS "auth read audit_log" ON public.audit_log;
CREATE POLICY "managers_read_audit_log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_manager_or_admin(auth.uid()));

-- 7. Set search_path on functions missing it
ALTER FUNCTION public.prevent_posted_journal_edit() SET search_path = 'public';
ALTER FUNCTION public.prevent_posted_line_edit() SET search_path = 'public';
ALTER FUNCTION public.set_updated_at() SET search_path = 'public';
ALTER FUNCTION public.validate_balanced_entry() SET search_path = 'public';

-- 8. Storage policies for vehicle-media: restrict writes
DROP POLICY IF EXISTS "vehicle_media_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_media_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_media_authenticated_delete" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload vehicle media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update vehicle media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete vehicle media" ON storage.objects;

CREATE POLICY "vehicles_insert_vehicle_media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-media' AND (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'vehicles')
  ));
CREATE POLICY "vehicles_update_vehicle_media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-media' AND (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'vehicles')
  ));
CREATE POLICY "vehicles_delete_vehicle_media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vehicle-media' AND (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = 'vehicles')
  ));
