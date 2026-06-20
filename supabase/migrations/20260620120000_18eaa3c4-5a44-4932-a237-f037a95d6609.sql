-- ============================================================
-- FA3: Disposal Engine (استبعاد الأصول الثابتة)
-- ============================================================
-- RPC واحدة dispose_fixed_asset بنوع (SALE/WRITE_OFF/SCRAP).
-- عكس الأصل + عكس المجمع + المقابل + ربح/خسارة. JE موحّد (next_je_no).
-- المرجع: FA3_DISPOSAL_AUDIT.md. القرارات السبعة معتمدة.
-- ============================================================

-- seed ترقيم تشغيلي للاستبعاد (FA-DISP، منفصل عن entry_no)
INSERT INTO public.document_sequences (document_type, document_name, prefix, current_number, number_length, yearly_reset, active, company_id)
SELECT 'ASSET_DISPOSAL', 'استبعاد أصل', 'FA-DISP', 0, 4, false, true, get_current_company_id()
WHERE NOT EXISTS (SELECT 1 FROM public.document_sequences WHERE document_type='ASSET_DISPOSAL' AND company_id=get_current_company_id());

-- عمود رقم الاستبعاد التشغيلي + نوعه (للسجلّ)
ALTER TABLE public.fixed_assets ADD COLUMN IF NOT EXISTS disposal_no TEXT;
ALTER TABLE public.fixed_assets ADD COLUMN IF NOT EXISTS disposal_type TEXT;
ALTER TABLE public.fixed_assets ADD COLUMN IF NOT EXISTS disposal_proceeds NUMERIC;
ALTER TABLE public.fixed_assets ADD COLUMN IF NOT EXISTS disposal_gain_loss NUMERIC;

-- RPC: استبعاد أصل
CREATE OR REPLACE FUNCTION public.dispose_fixed_asset(
  p_asset_id UUID,
  p_disposal_type TEXT,                  -- SALE / WRITE_OFF / SCRAP
  p_disposal_date DATE DEFAULT CURRENT_DATE,
  p_proceeds_amount NUMERIC DEFAULT 0,
  p_proceeds_account_code TEXT DEFAULT '1121',  -- بنك افتراضياً (1111 نقد / 1131 ذمم)
  p_contact_id UUID DEFAULT NULL,
  p_remarks TEXT DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_uid UUID; v_company UUID; v_asset RECORD;
  v_book_value NUMERIC; v_gain_loss NUMERIC; v_gain NUMERIC; v_loss NUMERIC;
  v_cost_acct UUID; v_accum_acct UUID; v_proceeds_acct UUID; v_gain_acct UUID; v_loss_acct UUID;
  v_proceeds_requires_partner BOOLEAN;
  v_je_no TEXT; v_je_id UUID; v_disp_no TEXT;
  v_total_debit NUMERIC; v_total_credit NUMERIC;
BEGIN
  v_uid := auth.uid(); v_company := get_current_company_id();

  -- (1) الأصل موجود + غير مُستبعد
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'ASSET_NOT_FOUND'); END IF;
  IF v_asset.status = 'disposed' OR v_asset.disposal_journal_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'ASSET_ALREADY_DISPOSED');
  END IF;

  -- (2) نوع الاستبعاد صالح
  IF p_disposal_type NOT IN ('SALE','WRITE_OFF','SCRAP') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'INVALID_DISPOSAL_TYPE');
  END IF;

  -- (3) القيمة الدفترية الحالية (FA3 v1: book_value المخزّن — الإهلاك الجزئي TECH-DEBT-FA3-001)
  v_book_value := v_asset.acquisition_cost - COALESCE(v_asset.accumulated_depreciation, 0);
  -- الربح/الخسارة = المقابل − القيمة الدفترية
  v_gain_loss := COALESCE(p_proceeds_amount, 0) - v_book_value;
  v_gain := GREATEST(v_gain_loss, 0);   -- ربح (موجب فقط)
  v_loss := GREATEST(-v_gain_loss, 0);  -- خسارة (موجب فقط)

  -- (4) حسابات (ديناميكي عبر determination: specific→default→exception)
  -- حساب الأصل (التكلفة) حسب الفئة
  SELECT account_id INTO v_cost_acct FROM public.account_determinations
    WHERE determination_key='FIXED_ASSET_COST' AND (product_type=v_asset.asset_class OR (product_type IS NULL AND is_default))
    ORDER BY (product_type=v_asset.asset_class) DESC NULLS LAST LIMIT 1;
  IF v_cost_acct IS NULL THEN RAISE EXCEPTION 'FIXED_ASSET_COST not found for class %', v_asset.asset_class; END IF;
  -- مجمع الإهلاك حسب الفئة
  SELECT account_id INTO v_accum_acct FROM public.account_determinations
    WHERE determination_key='ACCUMULATED_DEPRECIATION' AND (product_type=v_asset.asset_class OR (product_type IS NULL AND is_default))
    ORDER BY (product_type=v_asset.asset_class) DESC NULLS LAST LIMIT 1;
  IF v_accum_acct IS NULL THEN RAISE EXCEPTION 'ACCUMULATED_DEPRECIATION not found for class %', v_asset.asset_class; END IF;
  -- حساب المقابل + فحص الطرف
  SELECT id, requires_partner INTO v_proceeds_acct, v_proceeds_requires_partner FROM public.accounts WHERE code=p_proceeds_account_code;
  IF v_proceeds_acct IS NULL THEN RAISE EXCEPTION 'PROCEEDS_ACCOUNT_NOT_FOUND: %', p_proceeds_account_code; END IF;
  IF v_proceeds_requires_partner AND p_contact_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'PARTNER_REQUIRED_FOR_PROCEEDS_ACCOUNT', 'account', p_proceeds_account_code);
  END IF;
  -- ربح/خسارة
  SELECT account_id INTO v_gain_acct FROM public.account_determinations WHERE determination_key='GAIN_ON_DISPOSAL' AND product_type IS NULL LIMIT 1;
  SELECT account_id INTO v_loss_acct FROM public.account_determinations WHERE determination_key='LOSS_ON_DISPOSAL' AND product_type IS NULL LIMIT 1;
  IF v_gain_acct IS NULL OR v_loss_acct IS NULL THEN RAISE EXCEPTION 'GAIN/LOSS_ON_DISPOSAL determination not found'; END IF;

  -- (5) القيد الموحّد
  v_disp_no := public.get_next_document_number(v_company, 'ASSET_DISPOSAL', NULL, p_disposal_date, v_uid, NULL);
  v_je_no := public.next_je_no(p_disposal_date);

  -- إجماليات القيد للتحقّق
  -- مدين: المجمع + المقابل + (الخسارة إن وُجدت)
  -- دائن: الأصل (التكلفة) + (الربح إن وُجد)
  v_total_debit := COALESCE(v_asset.accumulated_depreciation,0) + COALESCE(p_proceeds_amount,0) + v_loss;
  v_total_credit := v_asset.acquisition_cost + v_gain;

  INSERT INTO public.journal_entries (entry_no, entry_date, reference, description, is_posted, source_type, source_id, total_debit, total_credit)
  VALUES (v_je_no, p_disposal_date, v_disp_no, 'استبعاد أصل ('||p_disposal_type||') - '||v_asset.asset_name, true, 'fixed_asset_disposal', p_asset_id, v_total_debit, v_total_credit)
  RETURNING id INTO v_je_id;

  -- سطر 1: عكس المجمع (مدين) — إن وُجد إهلاك متراكم
  IF COALESCE(v_asset.accumulated_depreciation,0) > 0 THEN
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, vehicle_id)
    VALUES (v_je_id, v_accum_acct, v_asset.accumulated_depreciation, 0, 'عكس مجمع إهلاك - '||v_asset.asset_no, NULL);
  END IF;

  -- سطر 2: المقابل (مدين) — إن وُجد بيع
  IF COALESCE(p_proceeds_amount,0) > 0 THEN
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, contact_id, partner_type)
    VALUES (v_je_id, v_proceeds_acct, p_proceeds_amount, 0, 'مقابل بيع أصل - '||v_asset.asset_no,
      CASE WHEN v_proceeds_requires_partner THEN p_contact_id ELSE NULL END,
      CASE WHEN v_proceeds_requires_partner THEN 'customer' ELSE NULL END);
  END IF;

  -- سطر 3: عكس الأصل (دائن) — التكلفة الكاملة
  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, vehicle_id)
  VALUES (v_je_id, v_cost_acct, 0, v_asset.acquisition_cost, 'عكس تكلفة أصل - '||v_asset.asset_no, NULL);

  -- سطر 4: ربح (دائن 433) — فقط إن v_gain>0
  IF v_gain > 0 THEN
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_je_id, v_gain_acct, 0, v_gain, 'ربح بيع أصل - '||v_asset.asset_no);
  END IF;
  -- خسارة (مدين 533) — فقط إن v_loss>0
  IF v_loss > 0 THEN
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_je_id, v_loss_acct, v_loss, 0, 'خسارة استبعاد أصل - '||v_asset.asset_no);
  END IF;

  -- (6) تحديث الأصل
  UPDATE public.fixed_assets
  SET status='disposed', disposed_at=p_disposal_date, disposal_journal_entry_id=v_je_id,
      disposal_no=v_disp_no, disposal_type=p_disposal_type, disposal_proceeds=p_proceeds_amount,
      disposal_gain_loss=v_gain_loss, book_value=0, reason=COALESCE(p_remarks, reason)
  WHERE id=p_asset_id;

  -- (7) الحوكمة
  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, subject_name, details)
  VALUES ('FIXED_ASSET_DISPOSED','fixed_assets','asset_disposal',p_asset_id,v_disp_no,v_asset.asset_name,
    jsonb_build_object('asset_no',v_asset.asset_no,'type',p_disposal_type,'proceeds',p_proceeds_amount,'book_value',v_book_value,'gain_loss',v_gain_loss,'je_no',v_je_no));

  RETURN jsonb_build_object('success', true, 'asset_id', p_asset_id, 'disposal_no', v_disp_no, 'journal_entry_id', v_je_id,
    'book_value', v_book_value, 'proceeds', p_proceeds_amount, 'gain_loss', v_gain_loss,
    'result', CASE WHEN v_gain_loss > 0 THEN 'GAIN' WHEN v_gain_loss < 0 THEN 'LOSS' ELSE 'BREAK_EVEN' END);
END;
$fn$;

-- التحقّق
SELECT 'dispose_fn' AS check, (SELECT COUNT(*)::text FROM pg_proc WHERE proname='dispose_fixed_asset') AS r
UNION ALL SELECT 'disposal_seq', (SELECT COUNT(*)::text FROM document_sequences WHERE document_type='ASSET_DISPOSAL')
UNION ALL SELECT 'disposal_cols', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='fixed_assets' AND column_name IN ('disposal_no','disposal_type','disposal_proceeds','disposal_gain_loss'));
