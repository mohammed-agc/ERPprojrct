-- ============================================================
-- F6: Goods Return Engine (إرجاع المركبات المُسلّمة)
-- ============================================================
-- خطوتان: receive_goods_return (استلام+فحص) + approve_goods_return (اعتماد+استدعاء F5).
-- F6 يستدعي F5 (cancel_sales_invoice) للعكس المالي — لا تكرار.
-- المرجع: F6_GOODS_RETURN_DESIGN.md. القرارات السبعة معتمدة.
-- ============================================================

-- ═══ (1) حالتان جديدتان في inventory_items ═══
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_status_check;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_status_check CHECK (
  status = ANY (ARRAY['on_order','in_transit','active','inactive','discontinued',
    'reserved','sold','delivered','returned_pending_inspection','inspection_failed'])
);

-- ═══ (2) جدول goods_returns (الرأس) ═══
CREATE TABLE IF NOT EXISTS public.goods_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_no TEXT NOT NULL,
  return_date DATE DEFAULT CURRENT_DATE,
  vehicle_id UUID NOT NULL REFERENCES public.inventory_items(id),
  invoice_id UUID REFERENCES public.invoices(id),
  sales_order_id UUID REFERENCES public.sales_orders(id),
  customer_id UUID REFERENCES public.contacts(id),
  delivery_id UUID REFERENCES public.deliveries(id),
  status TEXT NOT NULL DEFAULT 'pending_inspection',  -- pending_inspection/inspection_passed/inspection_failed/completed
  inspection_notes TEXT,
  inspection_result TEXT,           -- passed/failed
  inspected_by UUID, inspected_at TIMESTAMPTZ,
  -- الخصومات: schema الآن، المنطق F6.1 (إجبارياً: approved=original, damage=0, restocking=0)
  original_value NUMERIC,
  damage_amount NUMERIC DEFAULT 0,
  restocking_fee NUMERIC DEFAULT 0,
  approved_credit_amount NUMERIC,
  credit_note_id UUID REFERENCES public.credit_notes(id),
  reason TEXT, notes TEXT,
  created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gr_vehicle ON public.goods_returns(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_gr_invoice ON public.goods_returns(invoice_id);

-- ═══ (3) جدول goods_return_lines (Per-VIN) ═══
CREATE TABLE IF NOT EXISTS public.goods_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_return_id UUID NOT NULL REFERENCES public.goods_returns(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.inventory_items(id),
  vin TEXT, description TEXT,
  quantity NUMERIC DEFAULT 1,
  condition TEXT,                   -- good/damaged/incomplete
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grl_return ON public.goods_return_lines(goods_return_id);

-- ═══ (4) seed GOODS_RETURN في محرّك الترقيم ═══
INSERT INTO public.document_sequences (document_type, document_name, prefix, current_number, number_length, yearly_reset, active, company_id)
SELECT 'GOODS_RETURN', 'مرتجع بضاعة', 'GR', 0, 4, false, true, get_current_company_id()
WHERE NOT EXISTS (SELECT 1 FROM public.document_sequences WHERE document_type='GOODS_RETURN' AND company_id=get_current_company_id());

-- ═══ (5) RPC المرحلة 1: استلام + فحص ═══
CREATE OR REPLACE FUNCTION public.receive_goods_return(
  p_invoice_id UUID, p_vehicle_id UUID, p_reason TEXT DEFAULT 'customer_return'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_inv RECORD; v_veh RECORD; v_gr_id UUID; v_gr_no TEXT; v_uid UUID; v_company UUID; v_delivery_id UUID;
BEGIN
  v_uid := auth.uid();
  v_company := get_current_company_id();

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'INVOICE_NOT_FOUND'); END IF;

  SELECT * INTO v_veh FROM public.inventory_items WHERE id = p_vehicle_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'VEHICLE_NOT_FOUND'); END IF;

  -- يجب أن تكون المركبة مُسلّمة (delivered) لتُرجع
  IF v_veh.status <> 'delivered' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'VEHICLE_NOT_DELIVERED', 'current_status', v_veh.status);
  END IF;

  -- منع التكرار: لا مرتجع نشط لنفس المركبة
  IF EXISTS (SELECT 1 FROM public.goods_returns WHERE vehicle_id=p_vehicle_id AND status NOT IN ('completed','inspection_failed')) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'RETURN_ALREADY_IN_PROGRESS');
  END IF;

  -- ربط delivery (عبر vehicle_id، لا invoice_no)
  SELECT id INTO v_delivery_id FROM public.deliveries WHERE vehicle_id=p_vehicle_id ORDER BY created_at DESC LIMIT 1;

  -- ترقيم
  v_gr_no := public.get_next_document_number(v_company, 'GOODS_RETURN', NULL, CURRENT_DATE, v_uid, NULL);

  -- إنشاء المرتجع (الخصومات: approved=original إجبارياً في v1)
  INSERT INTO public.goods_returns (return_no, vehicle_id, invoice_id, sales_order_id, customer_id, delivery_id,
    status, original_value, damage_amount, restocking_fee, approved_credit_amount, reason, created_by)
  VALUES (v_gr_no, p_vehicle_id, p_invoice_id, v_inv.sales_order_id, v_inv.customer_id, v_delivery_id,
    'pending_inspection', v_inv.total, 0, 0, v_inv.total, p_reason, v_uid)
  RETURNING id INTO v_gr_id;

  INSERT INTO public.goods_return_lines (goods_return_id, vehicle_id, vin, description, quantity, condition)
  SELECT v_gr_id, ii.id, ii.vin, ii.name, 1, NULL FROM public.inventory_items ii WHERE ii.id=p_vehicle_id;

  -- المركبة: delivered → returned_pending_inspection (تعود للحيازة، تنتظر الفحص)
  UPDATE public.inventory_items SET status='returned_pending_inspection' WHERE id=p_vehicle_id;

  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, subject_id, subject_name, reason, details)
  VALUES ('GOODS_RETURN_RECEIVED', 'inventory', 'goods_return', v_gr_id, v_gr_no, p_vehicle_id, v_veh.sku, p_reason,
    jsonb_build_object('invoice_no', v_inv.invoice_no, 'gr_no', v_gr_no, 'vehicle_vin', v_veh.vin));

  RETURN jsonb_build_object('success', true, 'goods_return_id', v_gr_id, 'gr_no', v_gr_no, 'status', 'pending_inspection');
END;
$fn$;

-- ═══ (6) RPC المرحلة 2: اعتماد الفحص + العكس المالي (يستدعي F5) ═══
CREATE OR REPLACE FUNCTION public.approve_goods_return(
  p_goods_return_id UUID, p_inspection_result TEXT, p_inspection_notes TEXT DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_gr RECORD; v_uid UUID; v_cancel jsonb;
BEGIN
  v_uid := auth.uid();
  SELECT * INTO v_gr FROM public.goods_returns WHERE id = p_goods_return_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'RETURN_NOT_FOUND'); END IF;
  IF v_gr.status <> 'pending_inspection' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'RETURN_NOT_PENDING', 'current_status', v_gr.status);
  END IF;

  -- تسجيل الفحص
  UPDATE public.goods_returns
  SET inspection_result=p_inspection_result, inspection_notes=p_inspection_notes, inspected_by=v_uid, inspected_at=now()
  WHERE id=p_goods_return_id;

  -- فشل الفحص: المركبة inspection_failed، لا عكس مالي
  IF p_inspection_result <> 'passed' THEN
    UPDATE public.goods_returns SET status='inspection_failed' WHERE id=p_goods_return_id;
    UPDATE public.inventory_items SET status='inspection_failed' WHERE id=v_gr.vehicle_id;
    INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, subject_id, reason, details)
    VALUES ('GOODS_RETURN_INSPECTION_FAILED', 'inventory', 'goods_return', p_goods_return_id, v_gr.return_no, v_gr.vehicle_id, p_inspection_notes,
      jsonb_build_object('gr_no', v_gr.return_no, 'result', p_inspection_result));
    RETURN jsonb_build_object('success', true, 'status', 'inspection_failed', 'message', 'الفحص لم يُجتَز — المركبة تحتاج قراراً يدوياً');
  END IF;

  -- نجح الفحص: المركبة returned_pending_inspection → active + qty=1
  UPDATE public.inventory_items SET status='active', qty_on_hand=1, qty_reserved=0, sold_at=NULL WHERE id=v_gr.vehicle_id;

  -- استدعاء F5 للعكس المالي (المصدر الوحيد — المركبة الآن active فيقبلها F5)
  v_cancel := public.cancel_sales_invoice(v_gr.invoice_id, 'goods_return');
  IF (v_cancel->>'success')::boolean IS DISTINCT FROM true THEN
    -- F5 رفض → نرجع المركبة لحالة الانتظار (لا نترك حالة متضاربة) ونُبلغ
    UPDATE public.inventory_items SET status='returned_pending_inspection' WHERE id=v_gr.vehicle_id;
    RETURN jsonb_build_object('success', false, 'reason', 'FINANCIAL_REVERSAL_FAILED', 'f5_result', v_cancel);
  END IF;

  -- ربط الإشعار الدائن + إكمال المرتجع
  UPDATE public.goods_returns
  SET status='completed', credit_note_id=(v_cancel->>'credit_note_id')::uuid
  WHERE id=p_goods_return_id;

  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, subject_id, reason, details)
  VALUES ('GOODS_RETURN_COMPLETED', 'inventory', 'goods_return', p_goods_return_id, v_gr.return_no, v_gr.vehicle_id, 'goods_return',
    jsonb_build_object('gr_no', v_gr.return_no, 'credit_note_id', v_cancel->>'credit_note_id', 'cn_no', v_cancel->>'cn_no'));

  RETURN jsonb_build_object('success', true, 'status', 'completed', 'goods_return_id', p_goods_return_id,
    'credit_note_id', v_cancel->>'credit_note_id', 'cn_no', v_cancel->>'cn_no');
END;
$fn$;

-- التحقّق
SELECT 'gr_table' AS check, (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='goods_returns') AS r
UNION ALL SELECT 'grl_table', (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='goods_return_lines')
UNION ALL SELECT 'receive_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='receive_goods_return')
UNION ALL SELECT 'approve_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='approve_goods_return')
UNION ALL SELECT 'status_returned', (SELECT (pg_get_constraintdef(oid) LIKE '%returned_pending_inspection%')::text FROM pg_constraint WHERE conname='inventory_items_status_check')
UNION ALL SELECT 'status_failed', (SELECT (pg_get_constraintdef(oid) LIKE '%inspection_failed%')::text FROM pg_constraint WHERE conname='inventory_items_status_check')
UNION ALL SELECT 'gr_seq_seeded', (SELECT COUNT(*)::text FROM document_sequences WHERE document_type='GOODS_RETURN');
