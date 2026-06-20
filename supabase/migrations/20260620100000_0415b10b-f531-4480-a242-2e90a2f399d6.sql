-- ============================================================
-- Fixed Assets Engine — FA0 + FA1 + FA2
-- ============================================================
-- FA0 Account Determination: مجمّعات فرعية + مفاتيح ديناميكية (لا أرقام ثابتة في الكود).
-- FA1 Asset Master: fixed_assets + acquire_fixed_asset + قيد الاقتناء.
-- FA2 Depreciation: fixed_asset_depreciation + run_monthly_depreciation + قيد شهري.
-- المرجع: FIXED_ASSETS_DESIGN.md. القرارات الثمانية + تعديلان (in_service_date, depreciable bool).
-- ============================================================

-- ═══════════════════ FA0: Account Determination ═══════════════════

-- (FA0.1) حسابات جديدة: مجمّعات فرعية للإهلاك + مكاسب/خسائر استبعاد
-- مجمّعات فرعية تحت 1219 (credit nature، مقابلة للأصول)
INSERT INTO public.accounts (code, name_ar, name_en, type, nature, parent_id, is_posting, level, is_archived)
SELECT v.code, v.name_ar, v.name_en, 'asset', 'credit',
  (SELECT id FROM public.accounts WHERE code='1219'), true,
  (SELECT level FROM public.accounts WHERE code='1219')+1, false
FROM (VALUES
  ('12191','مجمع إهلاك المباني','Accumulated Depreciation - Buildings'),
  ('12192','مجمع إهلاك المعدات','Accumulated Depreciation - Equipment'),
  ('12193','مجمع إهلاك السيارات','Accumulated Depreciation - Vehicles'),
  ('12194','مجمع إهلاك الأجهزة','Accumulated Depreciation - Computers'),
  ('12195','مجمع إهلاك الأصول غير الملموسة','Accumulated Depreciation - Intangibles')
) AS v(code, name_ar, name_en)
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.code=v.code);

-- مكاسب بيع أصول (433، جديد) + خسائر (533، جديد بجانب 532 الموجود)
INSERT INTO public.accounts (code, name_ar, name_en, type, nature, parent_id, is_posting, level, is_archived)
SELECT '433','أرباح بيع أصول ثابتة','Gain on Disposal of Fixed Assets','revenue','credit',
  (SELECT id FROM public.accounts WHERE code='42'), true,
  COALESCE((SELECT level FROM public.accounts WHERE code='42')+1, 2), false
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code='433');

INSERT INTO public.accounts (code, name_ar, name_en, type, nature, parent_id, is_posting, level, is_archived)
SELECT '533','خسائر بيع أصول ثابتة','Loss on Disposal of Fixed Assets','expense','debit',
  (SELECT parent_id FROM public.accounts WHERE code='532'), true,
  COALESCE((SELECT level FROM public.accounts WHERE code='532'), 2), false
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code='533');

-- (FA0.2) مفاتيح determination (حسب asset_class عبر product_type)
-- FIXED_ASSET_COST
INSERT INTO public.account_determinations (determination_key, account_id, product_type, is_default, active, description)
SELECT 'FIXED_ASSET_COST', (SELECT id FROM public.accounts WHERE code=v.acc), v.cls, v.def, true, v.descr
FROM (VALUES
  ('building','1212',false,'تكلفة المباني'),
  ('equipment','1213',false,'تكلفة المعدات'),
  ('vehicle','1214',false,'تكلفة السيارات'),
  ('computer','1215',false,'تكلفة الأجهزة'),
  ('land','1211',false,'تكلفة الأراضي'),
  ('intangible','1221',false,'تكلفة الأصول غير الملموسة'),
  (NULL,'1213',true,'افتراضي تكلفة الأصول')
) AS v(cls, acc, def, descr)
WHERE NOT EXISTS (SELECT 1 FROM public.account_determinations ad WHERE ad.determination_key='FIXED_ASSET_COST' AND ad.product_type IS NOT DISTINCT FROM v.cls);

-- ACCUMULATED_DEPRECIATION
INSERT INTO public.account_determinations (determination_key, account_id, product_type, is_default, active, description)
SELECT 'ACCUMULATED_DEPRECIATION', (SELECT id FROM public.accounts WHERE code=v.acc), v.cls, v.def, true, v.descr
FROM (VALUES
  ('building','12191',false,'مجمع إهلاك المباني'),
  ('equipment','12192',false,'مجمع إهلاك المعدات'),
  ('vehicle','12193',false,'مجمع إهلاك السيارات'),
  ('computer','12194',false,'مجمع إهلاك الأجهزة'),
  ('intangible','12195',false,'مجمع إهلاك غير الملموسة'),
  (NULL,'1219',true,'افتراضي مجمع الإهلاك')
) AS v(cls, acc, def, descr)
WHERE NOT EXISTS (SELECT 1 FROM public.account_determinations ad WHERE ad.determination_key='ACCUMULATED_DEPRECIATION' AND ad.product_type IS NOT DISTINCT FROM v.cls);

-- DEPRECIATION_EXPENSE + GAIN + LOSS
INSERT INTO public.account_determinations (determination_key, account_id, product_type, is_default, active, description)
SELECT v.key, (SELECT id FROM public.accounts WHERE code=v.acc), NULL, true, true, v.descr
FROM (VALUES
  ('DEPRECIATION_EXPENSE','526','مصروف الإهلاك'),
  ('GAIN_ON_DISPOSAL','433','أرباح بيع أصول'),
  ('LOSS_ON_DISPOSAL','533','خسائر بيع أصول')
) AS v(key, acc, descr)
WHERE NOT EXISTS (SELECT 1 FROM public.account_determinations ad WHERE ad.determination_key=v.key AND ad.product_type IS NULL);

-- (FA0.3) seed الترقيم: FIXED_ASSET + DEPRECIATION
INSERT INTO public.document_sequences (document_type, document_name, prefix, current_number, number_length, yearly_reset, active, company_id)
SELECT v.dt, v.dn, v.px, 0, 4, false, true, get_current_company_id()
FROM (VALUES ('FIXED_ASSET','أصل ثابت','FA'),('DEPRECIATION','قيد إهلاك','DEP')) AS v(dt,dn,px)
WHERE NOT EXISTS (SELECT 1 FROM public.document_sequences ds WHERE ds.document_type=v.dt AND ds.company_id=get_current_company_id());

-- ═══════════════════ FA1: Asset Master ═══════════════════

CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_no TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_class TEXT NOT NULL,           -- building/equipment/vehicle/computer/land/intangible
  depreciable BOOLEAN NOT NULL DEFAULT true,  -- صريح (لا اعتماد على class=land)
  description TEXT,
  acquisition_date DATE NOT NULL,
  in_service_date DATE,                -- تاريخ دخول الخدمة (الإهلاك يبدأ الشهر التالي له)
  acquisition_cost NUMERIC NOT NULL,
  salvage_value NUMERIC DEFAULT 0,
  useful_life_months INT,
  depreciation_method TEXT DEFAULT 'straight_line',
  acquisition_source TEXT DEFAULT 'manual',  -- manual/purchase_invoice
  purchase_invoice_id UUID REFERENCES public.purchase_invoices(id),
  acquisition_journal_entry_id UUID REFERENCES public.journal_entries(id),
  accumulated_depreciation NUMERIC DEFAULT 0,
  book_value NUMERIC,
  branch_id UUID REFERENCES public.branches(id),
  cost_center TEXT,
  status TEXT DEFAULT 'active',        -- active/fully_depreciated/disposed
  disposed_at DATE, disposal_journal_entry_id UUID,
  reason TEXT, notes TEXT,
  company_id UUID DEFAULT get_current_company_id(),
  created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fa_class ON public.fixed_assets(asset_class);
CREATE INDEX IF NOT EXISTS idx_fa_status ON public.fixed_assets(status);
-- Helper: ترقيم القيد الموحّد (journal_entries = SSOT)
CREATE OR REPLACE FUNCTION public.next_je_no(p_date DATE)
RETURNS TEXT LANGUAGE plpgsql AS $jn$
DECLARE v_yr TEXT; v_seq INT;
BEGIN
  v_yr := TO_CHAR(p_date, 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_no FROM 'JE-' || v_yr || '-(\d+)') AS INT)), 0) + 1
  INTO v_seq FROM public.journal_entries WHERE entry_no LIKE 'JE-' || v_yr || '-%';
  RETURN 'JE-' || v_yr || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$jn$;
-- RPC: اقتناء أصل
CREATE OR REPLACE FUNCTION public.acquire_fixed_asset(
  p_asset_name TEXT, p_asset_class TEXT, p_acquisition_cost NUMERIC,
  p_useful_life_months INT, p_salvage_value NUMERIC DEFAULT 0,
  p_acquisition_date DATE DEFAULT CURRENT_DATE, p_in_service_date DATE DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL, p_cost_center TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'manual', p_purchase_invoice_id UUID DEFAULT NULL,
  p_credit_account_code TEXT DEFAULT '1121',
  p_supplier_id UUID DEFAULT NULL
) RETURNS jsonb
DECLARE
  v_uid UUID; v_company UUID; v_fa_id UUID; v_fa_no TEXT; v_je_no TEXT; v_je_id UUID;
  v_cost_acct UUID; v_credit_acct UUID; v_depreciable BOOLEAN; v_requires_partner BOOLEAN;
BEGIN
  v_uid := auth.uid(); v_company := get_current_company_id();
  -- الأرض لا تُهلك
  v_depreciable := (p_asset_class <> 'land');
  -- حساب تكلفة الأصل (ديناميكي عبر determination)
  SELECT account_id INTO v_cost_acct FROM public.account_determinations
    WHERE determination_key='FIXED_ASSET_COST' AND (product_type=p_asset_class OR (product_type IS NULL AND is_default))
    ORDER BY (product_type=p_asset_class) DESC NULLS LAST LIMIT 1;
  IF v_cost_acct IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'COST_ACCOUNT_NOT_FOUND'); END IF;
  SELECT id, requires_partner INTO v_credit_acct, v_requires_partner FROM public.accounts WHERE code=p_credit_account_code;
  IF v_credit_acct IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'CREDIT_ACCOUNT_NOT_FOUND'); END IF;
  IF v_requires_partner AND p_supplier_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'SUPPLIER_REQUIRED_FOR_CONTROL_ACCOUNT', 'account', p_credit_account_code);
  END IF;

  v_fa_no := public.get_next_document_number(v_company, 'FIXED_ASSET', NULL, CURRENT_DATE, v_uid, NULL);

  INSERT INTO public.fixed_assets (asset_no, asset_name, asset_class, depreciable, acquisition_date, in_service_date,
    acquisition_cost, salvage_value, useful_life_months, acquisition_source, purchase_invoice_id,
    accumulated_depreciation, book_value, branch_id, cost_center, status, created_by)
  VALUES (v_fa_no, p_asset_name, p_asset_class, v_depreciable, p_acquisition_date, COALESCE(p_in_service_date, p_acquisition_date),
    p_acquisition_cost, p_salvage_value, p_useful_life_months, p_source, p_purchase_invoice_id,
    0, p_acquisition_cost, p_branch_id, p_cost_center, 'active', v_uid)
  RETURNING id INTO v_fa_id;

  -- قيد الاقتناء: مدين الأصل / دائن (دائنون أو نقد)
  v_je_no := public.next_je_no(p_acquisition_date);, NULL, p_acquisition_date, v_uid, NULL);
  INSERT INTO public.journal_entries (entry_no, entry_date, reference, description, is_posted, source_type, source_id, total_debit, total_credit)
  VALUES (v_je_no, p_acquisition_date, v_fa_no, 'اقتناء أصل ثابت - '||p_asset_name, true, 'fixed_asset_acquisition', v_fa_id, p_acquisition_cost, p_acquisition_cost)
  RETURNING id INTO v_je_id;
  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, contact_id, partner_type) VALUES
    (v_je_id, v_cost_acct, p_acquisition_cost, 0, 'اقتناء '||p_asset_name, NULL, NULL),
    (v_je_id, v_credit_acct, 0, p_acquisition_cost, 'مقابل اقتناء '||p_asset_name,
     CASE WHEN v_requires_partner THEN p_supplier_id ELSE NULL END,
     CASE WHEN v_requires_partner THEN 'supplier' ELSE NULL END);

  UPDATE public.fixed_assets SET acquisition_journal_entry_id=v_je_id WHERE id=v_fa_id;

  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, subject_name, details)
  VALUES ('FIXED_ASSET_ACQUIRED','fixed_assets','fixed_asset',v_fa_id,v_fa_no,p_asset_name,
    jsonb_build_object('cost',p_acquisition_cost,'class',p_asset_class,'je_no',v_je_no));

  RETURN jsonb_build_object('success', true, 'asset_id', v_fa_id, 'asset_no', v_fa_no, 'journal_entry_id', v_je_id);
END;
$fn$;

-- ═══════════════════ FA2: Depreciation Engine ═══════════════════

CREATE TABLE IF NOT EXISTS public.fixed_asset_depreciation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.fixed_assets(id),
  period TEXT NOT NULL,                -- 'YYYY-MM'
  depreciation_amount NUMERIC NOT NULL,
  accumulated_after NUMERIC,
  book_value_after NUMERIC,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  posted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(asset_id, period)
);

-- RPC: تشغيل الإهلاك الشهري لكل الأصول
CREATE OR REPLACE FUNCTION public.run_monthly_depreciation(p_period TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_uid UUID; v_company UUID; v_asset RECORD;
  v_monthly NUMERIC; v_dep_acct UUID; v_accum_acct UUID; v_je_no TEXT; v_je_id UUID;
v_period_date DATE; v_processed INT := 0; v_skipped INT := 0; v_dep_base NUMERIC; v_dep_batch_no TEXT;  
BEGIN
  v_uid := auth.uid(); v_company := get_current_company_id();
  v_period_date := to_date(p_period||'-01','YYYY-MM-DD');

  -- حساب مصروف الإهلاك (موحّد)
  SELECT account_id INTO v_dep_acct FROM public.account_determinations
    WHERE determination_key='DEPRECIATION_EXPENSE' AND product_type IS NULL LIMIT 1;
    IF v_dep_acct IS NULL THEN
    RAISE EXCEPTION 'DEPRECIATION_EXPENSE account determination not found';
  END IF;
  v_dep_batch_no := public.get_next_document_number(v_company, 'DEPRECIATION', NULL, v_period_date, v_uid, NULL);

  FOR v_asset IN
    SELECT * FROM public.fixed_assets
    WHERE status='active' AND depreciable=true
      AND COALESCE(in_service_date, acquisition_date) < v_period_date  -- بدأت الخدمة قبل الفترة
      AND useful_life_months > 0
  LOOP
    -- تخطّي إن أُهلك لهذه الفترة (idempotent)
    IF EXISTS (SELECT 1 FROM public.fixed_asset_depreciation WHERE asset_id=v_asset.id AND period=p_period) THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    v_dep_base := v_asset.acquisition_cost - COALESCE(v_asset.salvage_value,0);
    v_monthly := ROUND(v_dep_base / v_asset.useful_life_months, 2);
    -- القسط الأخير يستوعب فرق التقريب: لا ننزل تحت salvage
    IF (v_asset.book_value - v_monthly) < COALESCE(v_asset.salvage_value,0) THEN
      v_monthly := v_asset.book_value - COALESCE(v_asset.salvage_value,0);
    END IF;
    IF v_monthly <= 0 THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    -- مجمع الإهلاك حسب الفئة (ديناميكي)
    SELECT account_id INTO v_accum_acct FROM public.account_determinations
      WHERE determination_key='ACCUMULATED_DEPRECIATION' AND (product_type=v_asset.asset_class OR (product_type IS NULL AND is_default))
      ORDER BY (product_type=v_asset.asset_class) DESC NULLS LAST LIMIT 1;
      IF v_accum_acct IS NULL THEN
      RAISE EXCEPTION 'ACCUMULATED_DEPRECIATION account determination not found for class %', v_asset.asset_class;
    END IF;

    -- قيد الإهلاك: مدين 526 / دائن المجمع
    v_je_no := public.next_je_no((date_trunc('month',v_period_date)+interval '1 month -1 day')::date);
    INSERT INTO public.journal_entries (entry_no, entry_date, reference, description, is_posted, source_type, source_id, total_debit, total_credit)
    VALUES (v_je_no, (date_trunc('month',v_period_date)+interval '1 month -1 day')::date, v_dep_batch_no,
      'إهلاك '||v_asset.asset_name||' - '||p_period, true, 'depreciation', v_asset.id, v_monthly, v_monthly)
    RETURNING id INTO v_je_id;
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES
      (v_je_id, v_dep_acct, v_monthly, 0, 'مصروف إهلاك '||v_asset.asset_name),
      (v_je_id, v_accum_acct, 0, v_monthly, 'مجمع إهلاك '||v_asset.asset_name);

    -- تحديث الأصل
    UPDATE public.fixed_assets
    SET accumulated_depreciation = accumulated_depreciation + v_monthly,
        book_value = acquisition_cost - (accumulated_depreciation + v_monthly),
        status = CASE WHEN (acquisition_cost - (accumulated_depreciation + v_monthly)) <= COALESCE(salvage_value,0) THEN 'fully_depreciated' ELSE 'active' END
    WHERE id = v_asset.id;

    -- سجلّ الإهلاك
    INSERT INTO public.fixed_asset_depreciation (asset_id, period, depreciation_amount, accumulated_after, book_value_after, journal_entry_id)
    VALUES (v_asset.id, p_period, v_monthly,
      v_asset.accumulated_depreciation + v_monthly,
      v_asset.acquisition_cost - (v_asset.accumulated_depreciation + v_monthly), v_je_id);

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'period', p_period, 'processed', v_processed, 'skipped', v_skipped);
END;
$fn$;

-- التحقّق
SELECT 'fa_table' AS check, (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='fixed_assets') AS r
UNION ALL SELECT 'fad_table', (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='fixed_asset_depreciation')
UNION ALL SELECT 'acquire_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='acquire_fixed_asset')
UNION ALL SELECT 'depreciation_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='run_monthly_depreciation')
UNION ALL SELECT 'accum_subaccounts', (SELECT COUNT(*)::text FROM accounts WHERE code IN ('12191','12192','12193','12194','12195'))
UNION ALL SELECT 'gain_loss_accts', (SELECT COUNT(*)::text FROM accounts WHERE code IN ('433','533'))
UNION ALL SELECT 'fa_cost_keys', (SELECT COUNT(*)::text FROM account_determinations WHERE determination_key='FIXED_ASSET_COST')
UNION ALL SELECT 'accum_keys', (SELECT COUNT(*)::text FROM account_determinations WHERE determination_key='ACCUMULATED_DEPRECIATION')
UNION ALL SELECT 'fa_seq', (SELECT COUNT(*)::text FROM document_sequences WHERE document_type IN ('FIXED_ASSET','DEPRECIATION'));
