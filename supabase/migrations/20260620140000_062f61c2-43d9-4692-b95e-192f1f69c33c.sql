-- ============================================================
-- AW1: Approval Workflow Engine (تفعيل المحرّك الموجود)
-- ============================================================
-- البنية موجودة (approval_workflows/steps/requests/actions). نُفعّلها.
-- Draft Pattern: draft→submit→pending_approval→approved→post.
-- المرجع: AW1_DESIGN_FINAL.md. التعديلات الستّة معتمدة.
-- ============================================================

-- ═══════════════════ AW1.0: Schema ═══════════════════

-- توحيد أعمدة الموافقة (المستندات الثلاثة)
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approval_request_id UUID,
  ADD COLUMN IF NOT EXISTS submitted_for_approval_at TIMESTAMPTZ;
-- (approved_by/approved_at موجودان أصلاً)

ALTER TABLE public.purchase_payments
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approval_request_id UUID,
  ADD COLUMN IF NOT EXISTS submitted_for_approval_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved',  -- الافتراضي approved (الآلية)
  ADD COLUMN IF NOT EXISTS approval_request_id UUID,
  ADD COLUMN IF NOT EXISTS submitted_for_approval_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- approval_requests: +resolved_by +resolved_at (من أغلق الطلب)
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS resolved_by UUID,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
  -- توسيع قيد action ليشمل ADMIN_OVERRIDE (audit صريح)
ALTER TABLE public.approval_actions DROP CONSTRAINT IF EXISTS approval_actions_action_check;
ALTER TABLE public.approval_actions ADD CONSTRAINT approval_actions_action_check
  CHECK (action = ANY (ARRAY['approved','rejected','returned','delegated','noted','ADMIN_OVERRIDE']));

-- seed ترقيم AR-YYYY-NNNN
INSERT INTO public.document_sequences (document_type, document_name, prefix, current_number, number_length, yearly_reset, active, company_id)
SELECT 'APPROVAL_REQUEST', 'طلب اعتماد', 'AR', 0, 4, false, true, get_current_company_id()
WHERE NOT EXISTS (SELECT 1 FROM public.document_sequences WHERE document_type='APPROVAL_REQUEST' AND company_id=get_current_company_id());

-- إسناد الأدوار للمستخدم الحالي (اختبار — admin الوحيد)
INSERT INTO public.user_roles (user_id, role)
SELECT ur.user_id, r.role
FROM (SELECT DISTINCT user_id FROM public.user_roles WHERE role='admin') ur
CROSS JOIN (VALUES ('finance_manager'),('purchasing_manager'),('general_manager'),('accountant')) AS r(role)
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur2 WHERE ur2.user_id=ur.user_id AND ur2.role=r.role);

-- ═══════════════════ AW1.1: Steps (المصفوفة) ═══════════════════

-- تنظيف الـ workflows القديمة (6) + steps، إعادة بناء نظيفة لـ AW1 (PO/Payment/JE)
DELETE FROM public.approval_workflow_steps;
DELETE FROM public.approval_workflows WHERE document_type IN ('PO','payment','JE') OR module IN ('purchasing','treasury','accounting');

-- 8 workflows بـ steps
DO $seed$
DECLARE v_wf UUID;
BEGIN
  -- PO صغير (0-50k): purchasing_manager
  INSERT INTO public.approval_workflows (name, module, document_type, amount_min, amount_max, active)
  VALUES ('اعتماد أمر شراء صغير','purchasing','PO',0,50000,true) RETURNING id INTO v_wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, step_name, approver_type, approver_role, approval_mode, active)
  VALUES (v_wf,1,'مدير المشتريات','role','purchasing_manager','all',true);

  -- PO متوسط (50k-200k): purchasing_manager → finance_manager
  INSERT INTO public.approval_workflows (name, module, document_type, amount_min, amount_max, active)
  VALUES ('اعتماد أمر شراء متوسط','purchasing','PO',50000,200000,true) RETURNING id INTO v_wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, step_name, approver_type, approver_role, approval_mode, active) VALUES
    (v_wf,1,'مدير المشتريات','role','purchasing_manager','all',true),
    (v_wf,2,'المدير المالي','role','finance_manager','all',true);

  -- PO كبير (200k+): purchasing_manager → finance_manager → general_manager
  INSERT INTO public.approval_workflows (name, module, document_type, amount_min, amount_max, active)
  VALUES ('اعتماد أمر شراء كبير','purchasing','PO',200000,NULL,true) RETURNING id INTO v_wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, step_name, approver_type, approver_role, approval_mode, active) VALUES
    (v_wf,1,'مدير المشتريات','role','purchasing_manager','all',true),
    (v_wf,2,'المدير المالي','role','finance_manager','all',true),
    (v_wf,3,'المدير التنفيذي','role','general_manager','all',true);

  -- Payment صغير (0-10k): accountant
  INSERT INTO public.approval_workflows (name, module, document_type, amount_min, amount_max, active)
  VALUES ('اعتماد صرف صغير','treasury','payment',0,10000,true) RETURNING id INTO v_wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, step_name, approver_type, approver_role, approval_mode, active)
  VALUES (v_wf,1,'المحاسب','role','accountant','all',true);

  -- Payment متوسط (10k-100k): finance_manager
  INSERT INTO public.approval_workflows (name, module, document_type, amount_min, amount_max, active)
  VALUES ('اعتماد صرف متوسط','treasury','payment',10000,100000,true) RETURNING id INTO v_wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, step_name, approver_type, approver_role, approval_mode, active)
  VALUES (v_wf,1,'المدير المالي','role','finance_manager','all',true);

  -- Payment كبير (100k+): finance_manager → general_manager
  INSERT INTO public.approval_workflows (name, module, document_type, amount_min, amount_max, active)
  VALUES ('اعتماد صرف كبير','treasury','payment',100000,NULL,true) RETURNING id INTO v_wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, step_name, approver_type, approver_role, approval_mode, active) VALUES
    (v_wf,1,'المدير المالي','role','finance_manager','all',true),
    (v_wf,2,'المدير التنفيذي','role','general_manager','all',true);

  -- JE صغير (0-50k): finance_manager
  INSERT INTO public.approval_workflows (name, module, document_type, amount_min, amount_max, active)
  VALUES ('اعتماد قيد يدوي صغير','accounting','JE',0,50000,true) RETURNING id INTO v_wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, step_name, approver_type, approver_role, approval_mode, active)
  VALUES (v_wf,1,'المدير المالي','role','finance_manager','all',true);

  -- JE كبير (50k+): finance_manager → general_manager
  INSERT INTO public.approval_workflows (name, module, document_type, amount_min, amount_max, active)
  VALUES ('اعتماد قيد يدوي كبير','accounting','JE',50000,NULL,true) RETURNING id INTO v_wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, step_name, approver_type, approver_role, approval_mode, active) VALUES
    (v_wf,1,'المدير المالي','role','finance_manager','all',true),
    (v_wf,2,'المدير التنفيذي','role','general_manager','all',true);
END $seed$;

-- ═══════════════════ AW1.2: submit_for_approval ═══════════════════
CREATE OR REPLACE FUNCTION public.submit_for_approval(
  p_document_type TEXT, p_document_id UUID, p_document_code TEXT,
  p_amount NUMERIC, p_title TEXT DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_uid UUID; v_company UUID; v_wf RECORD; v_req_id UUID; v_req_code TEXT;
BEGIN
  v_uid := auth.uid(); v_company := get_current_company_id();

  -- حلّ الـ workflow (Reject إن لا مطابق — Fail Fast)
  SELECT * INTO v_wf FROM public.approval_workflows
  WHERE document_type=p_document_type AND active=true
    AND p_amount >= amount_min AND (amount_max IS NULL OR p_amount < amount_max)
  ORDER BY amount_min DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'NO_APPROVAL_WORKFLOW_FOUND', 'document_type', p_document_type, 'amount', p_amount);
  END IF;
  -- النقطة 3: workflow بلا خطوات يفشل (لا يُعتمد تلقائياً)
  IF NOT EXISTS (SELECT 1 FROM public.approval_workflow_steps WHERE workflow_id=v_wf.id AND active=true) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'NO_APPROVAL_STEPS_DEFINED', 'workflow', v_wf.name);
  END IF;

  -- إنشاء الطلب
  v_req_code := public.get_next_document_number(v_company, 'APPROVAL_REQUEST', NULL, CURRENT_DATE, v_uid, NULL);
  INSERT INTO public.approval_requests (code, workflow_id, document_type, document_id, document_code, document_amount, title, current_step, status, submitted_by, submitted_at)
  VALUES (v_req_code, v_wf.id, p_document_type, p_document_id, p_document_code, p_amount, COALESCE(p_title, p_document_code), 1, 'pending', v_uid, now())
  RETURNING id INTO v_req_id;

  -- ربط المستند (pending_approval)
  IF p_document_type='PO' THEN
    UPDATE public.purchase_orders SET approval_request_id=v_req_id, approval_status='pending_approval', submitted_for_approval_at=now() WHERE id=p_document_id;
  ELSIF p_document_type='payment' THEN
    UPDATE public.purchase_payments SET approval_request_id=v_req_id, approval_status='pending_approval', submitted_for_approval_at=now() WHERE id=p_document_id;
  ELSIF p_document_type='JE' THEN
    UPDATE public.journal_entries SET approval_request_id=v_req_id, approval_status='pending_approval', submitted_for_approval_at=now() WHERE id=p_document_id;
  END IF;

  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, subject_name, details)
  VALUES ('APPROVAL_SUBMITTED','approval','approval_request',v_req_id,v_req_code,COALESCE(p_title,p_document_code),
    jsonb_build_object('document_type',p_document_type,'amount',p_amount,'workflow',v_wf.name));

  RETURN jsonb_build_object('success', true, 'request_id', v_req_id, 'request_code', v_req_code, 'workflow', v_wf.name, 'total_steps', (SELECT COUNT(*) FROM approval_workflow_steps WHERE workflow_id=v_wf.id));
END;
$fn$;

-- ═══════════════════ AW1.3: approve_request / reject_request ═══════════════════
CREATE OR REPLACE FUNCTION public.approve_request(p_request_id UUID, p_comment TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_uid UUID; v_req RECORD; v_step RECORD; v_is_admin BOOLEAN; v_has_role BOOLEAN;
  v_action TEXT; v_total_steps INT; v_doc_approved BOOLEAN := false;
BEGIN
  v_uid := auth.uid();
  SELECT * INTO v_req FROM public.approval_requests WHERE id=p_request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'REQUEST_NOT_FOUND'); END IF;
  IF v_req.status <> 'pending' THEN RETURN jsonb_build_object('success', false, 'reason', 'REQUEST_ALREADY_RESOLVED', 'status', v_req.status); END IF;

  -- الخطوة الحالية
  SELECT * INTO v_step FROM public.approval_workflow_steps WHERE workflow_id=v_req.workflow_id AND step_order=v_req.current_step;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'STEP_NOT_FOUND'); END IF;

  -- فحص الصلاحية: admin (override) أو صاحب الدور
  v_is_admin := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin');
  v_has_role := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role=v_step.approver_role);
  IF NOT v_is_admin AND NOT v_has_role THEN
    RETURN jsonb_build_object('success', false, 'reason', 'NOT_AUTHORIZED', 'required_role', v_step.approver_role);
  END IF;
  -- فصل الواجبات: المُقدِّم لا يعتمد طلبه — إلا admin override (مع audit صريح)
  IF v_req.submitted_by = v_uid AND NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'reason', 'SUBMITTER_CANNOT_APPROVE');
  END IF;
  -- admin يتجاوز (لا يملك الدور المطلوب، أو هو المُقدِّم) → ADMIN_OVERRIDE (audit صريح)
  v_action := CASE WHEN v_has_role AND v_req.submitted_by <> v_uid THEN 'approved' ELSE 'ADMIN_OVERRIDE' END;

  -- تسجيل الإجراء
  INSERT INTO public.approval_actions (request_id, step_id, step_order, action, action_by, action_at, comments)
  VALUES (p_request_id, v_step.id, v_req.current_step, v_action, v_uid, now(), p_comment);

  -- mode=ALL: الخطوة تكتمل (موافق واحد لكل دور في AW1). الانتقال للتالية أو الإكمال.
  v_total_steps := (SELECT COUNT(*) FROM public.approval_workflow_steps WHERE workflow_id=v_req.workflow_id);
  IF v_req.current_step >= v_total_steps THEN
    -- آخر خطوة → معتمد
    UPDATE public.approval_requests SET status='approved', completed_at=now(), resolved_by=v_uid, resolved_at=now() WHERE id=p_request_id;
    v_doc_approved := true;
    -- تحديث المستند
    IF v_req.document_type='PO' THEN
      UPDATE public.purchase_orders SET approval_status='approved', approved_by=v_uid, approved_at=now() WHERE id=v_req.document_id;
    ELSIF v_req.document_type='payment' THEN
      UPDATE public.purchase_payments SET approval_status='approved', approved_by=v_uid, approved_at=now() WHERE id=v_req.document_id;
    ELSIF v_req.document_type='JE' THEN
      UPDATE public.journal_entries SET approval_status='approved', approved_by=v_uid, approved_at=now() WHERE id=v_req.document_id;
    END IF;
  ELSE
    -- الانتقال للخطوة التالية
    UPDATE public.approval_requests SET current_step=current_step+1 WHERE id=p_request_id;
  END IF;

  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, subject_name, details)
  VALUES (CASE WHEN v_action='ADMIN_OVERRIDE' THEN 'APPROVAL_ADMIN_OVERRIDE' ELSE 'APPROVAL_APPROVED' END,
    'approval','approval_request',p_request_id,v_req.code,v_req.title,
    jsonb_build_object('step',v_req.current_step,'action',v_action,'approved',v_doc_approved));

  RETURN jsonb_build_object('success', true, 'action', v_action, 'step', v_req.current_step, 'fully_approved', v_doc_approved,
    'next_step', CASE WHEN v_doc_approved THEN NULL ELSE v_req.current_step+1 END);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.reject_request(p_request_id UUID, p_comment TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE v_uid UUID; v_req RECORD; v_step RECORD; v_is_admin BOOLEAN; v_has_role BOOLEAN;
BEGIN
  v_uid := auth.uid();
  SELECT * INTO v_req FROM public.approval_requests WHERE id=p_request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'REQUEST_NOT_FOUND'); END IF;
  IF v_req.status <> 'pending' THEN RETURN jsonb_build_object('success', false, 'reason', 'REQUEST_ALREADY_RESOLVED', 'status', v_req.status); END IF;

  SELECT * INTO v_step FROM public.approval_workflow_steps WHERE workflow_id=v_req.workflow_id AND step_order=v_req.current_step;
  v_is_admin := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin');
  v_has_role := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role=v_step.approver_role);
  IF NOT v_is_admin AND NOT v_has_role THEN
    RETURN jsonb_build_object('success', false, 'reason', 'NOT_AUTHORIZED', 'required_role', v_step.approver_role);
  END IF;

  INSERT INTO public.approval_actions (request_id, step_id, step_order, action, action_by, action_at, comments)
  VALUES (p_request_id, v_step.id, v_req.current_step, 'rejected', v_uid, now(), p_comment);

  -- رفض واحد يكفي
  UPDATE public.approval_requests SET status='rejected', completed_at=now(), resolved_by=v_uid, resolved_at=now() WHERE id=p_request_id;
  IF v_req.document_type='PO' THEN
    UPDATE public.purchase_orders SET approval_status='rejected' WHERE id=v_req.document_id;
  ELSIF v_req.document_type='payment' THEN
    UPDATE public.purchase_payments SET approval_status='rejected' WHERE id=v_req.document_id;
  ELSIF v_req.document_type='JE' THEN
    UPDATE public.journal_entries SET approval_status='rejected' WHERE id=v_req.document_id;
  END IF;

  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, subject_name, details)
  VALUES ('APPROVAL_REJECTED','approval','approval_request',p_request_id,v_req.code,v_req.title,
    jsonb_build_object('step',v_req.current_step,'comment',p_comment));

  RETURN jsonb_build_object('success', true, 'status', 'rejected');
END;
$fn$;

-- ═══════════════════ AW1.4: create_manual_journal_entry ═══════════════════
CREATE OR REPLACE FUNCTION public.create_manual_journal_entry(
  p_entry_date DATE, p_description TEXT, p_lines jsonb  -- [{account_code, debit, credit, description}]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_uid UUID; v_company UUID; v_je_no TEXT; v_je_id UUID; v_line jsonb;
  v_total_debit NUMERIC := 0; v_total_credit NUMERIC := 0; v_acct UUID;
BEGIN
  v_uid := auth.uid(); v_company := get_current_company_id();
  -- التحقّق من التوازن
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_total_debit := v_total_debit + COALESCE((v_line->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + COALESCE((v_line->>'credit')::numeric, 0);
  END LOOP;
  IF v_total_debit <> v_total_credit THEN
    RETURN jsonb_build_object('success', false, 'reason', 'UNBALANCED', 'debit', v_total_debit, 'credit', v_total_credit);
  END IF;
  IF v_total_debit = 0 THEN RETURN jsonb_build_object('success', false, 'reason', 'ZERO_AMOUNT'); END IF;

  -- إنشاء القيد (يدوي: source_type='manual'، is_posted=false، approval_status='draft')
  v_je_no := public.next_je_no(p_entry_date);
  INSERT INTO public.journal_entries (entry_no, entry_date, description, is_posted, source_type, total_debit, total_credit, approval_status, created_by)
  VALUES (v_je_no, p_entry_date, p_description, false, 'manual', v_total_debit, v_total_credit, 'draft', v_uid)
  RETURNING id INTO v_je_id;

  -- السطور
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT id INTO v_acct FROM public.accounts WHERE code=(v_line->>'account_code');
    IF v_acct IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: %', (v_line->>'account_code'); END IF;
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_je_id, v_acct, COALESCE((v_line->>'debit')::numeric,0), COALESCE((v_line->>'credit')::numeric,0), v_line->>'description');
  END LOOP;

  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, subject_name, details)
  VALUES ('MANUAL_JE_CREATED','accounting','journal_entry',v_je_id,v_je_no,p_description,
    jsonb_build_object('amount',v_total_debit,'status','draft'));

  RETURN jsonb_build_object('success', true, 'journal_entry_id', v_je_id, 'entry_no', v_je_no, 'amount', v_total_debit, 'approval_status', 'draft');
END;
$fn$;

-- ═══════════════════ AW1.5: الحجب — post_journal_entry ═══════════════════
-- ترحيل القيد اليدوي (يفحص الموافقة)
CREATE OR REPLACE FUNCTION public.post_journal_entry(p_je_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE v_je RECORD;
BEGIN
  SELECT * INTO v_je FROM public.journal_entries WHERE id=p_je_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'JE_NOT_FOUND'); END IF;
  IF v_je.is_posted THEN RETURN jsonb_build_object('success', false, 'reason', 'ALREADY_POSTED'); END IF;
  -- الحجب: لا ترحيل بلا موافقة
  IF v_je.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'DOCUMENT_REQUIRES_APPROVAL: JE % status=%', v_je.entry_no, v_je.approval_status;
  END IF;
  UPDATE public.journal_entries SET is_posted=true WHERE id=p_je_id;
  RETURN jsonb_build_object('success', true, 'entry_no', v_je.entry_no, 'posted', true);
END;
$fn$;

-- ═══════════════════ AW1.6: JE Whitelist (الآلي معتمد، اليدوي يحتاج موافقة) ═══════════════════
-- ثابت صريح: أنواع القيود الآلية المعتمدة تلقائياً. أي نوع جديد غير مُدرج → يحتاج موافقة (آمن).
CREATE OR REPLACE FUNCTION public.set_je_approval_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $tg$
DECLARE
  v_auto_approved_sources TEXT[] := ARRAY[
    'sales_invoice','sales_invoice_cogs','purchase_invoice',
    'credit_note','credit_note_cogs','depreciation',
    'fixed_asset_acquisition','fixed_asset_disposal',
    'purchase_payment','sales_payment','settlement','payment'
  ];
BEGIN
  -- يُطبّق فقط عند الإدراج، وإن لم يُحدّد approval_status صراحةً
  IF NEW.source_type = ANY(v_auto_approved_sources) THEN
    NEW.approval_status := 'approved';
  ELSIF NEW.source_type = 'manual' OR NEW.source_type IS NULL THEN
    -- يدوي: يبقى كما حُدّد (draft من create_manual_journal_entry)
    NEW.approval_status := COALESCE(NEW.approval_status, 'draft');
  END IF;
  RETURN NEW;
END;
$tg$;

DROP TRIGGER IF EXISTS trg_je_approval_status ON public.journal_entries;
CREATE TRIGGER trg_je_approval_status
  BEFORE INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_je_approval_status();

-- التحقّق
SELECT 'submit_fn' AS check, (SELECT COUNT(*)::text FROM pg_proc WHERE proname='submit_for_approval') AS r
UNION ALL SELECT 'approve_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='approve_request')
UNION ALL SELECT 'reject_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='reject_request')
UNION ALL SELECT 'manual_je_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='create_manual_journal_entry')
UNION ALL SELECT 'post_je_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='post_journal_entry')
UNION ALL SELECT 'workflows', (SELECT COUNT(*)::text FROM approval_workflows WHERE document_type IN ('PO','payment','JE'))
UNION ALL SELECT 'steps', (SELECT COUNT(*)::text FROM approval_workflow_steps)
UNION ALL SELECT 'roles_assigned', (SELECT COUNT(*)::text FROM user_roles)
UNION ALL SELECT 'ar_seq', (SELECT COUNT(*)::text FROM document_sequences WHERE document_type='APPROVAL_REQUEST')
UNION ALL SELECT 'resolved_cols', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='approval_requests' AND column_name IN ('resolved_by','resolved_at'))
UNION ALL SELECT 'je_whitelist_trigger', (SELECT COUNT(*)::text FROM pg_trigger WHERE tgname='trg_je_approval_status');
