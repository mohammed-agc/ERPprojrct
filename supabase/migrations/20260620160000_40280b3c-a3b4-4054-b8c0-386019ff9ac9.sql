-- ============================================================
-- AW1.1: PO/Payment Posting Guard (TECH-DEBT-AW-001)
-- ============================================================
-- استكمال الحجب لـ PO/Payment (AW1 بنى JE). Draft Pattern.
-- المرجع: AW11_DESIGN.md. التحسينات الستّة معتمدة (حزام وحمّالة).
-- ============================================================

-- ═══════════════════ AW1.1.0: Schema + Backfill ═══════════════════

-- عمود الربط + idempotency
ALTER TABLE public.purchase_payments ADD COLUMN IF NOT EXISTS journal_entry_id UUID;

-- FK (journal_entry_id صار جزءاً من آلية idempotency، لا مرجع فقط)
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_purchase_payments_journal_entry') THEN
    ALTER TABLE public.purchase_payments
      ADD CONSTRAINT fk_purchase_payments_journal_entry
      FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);
  END IF;
END $fk$;

-- index
CREATE INDEX IF NOT EXISTS idx_purchase_payments_je_id ON public.purchase_payments(journal_entry_id);

-- backfill: ربط الدفعات الموجودة بقيودها (source_id)
UPDATE public.purchase_payments pp SET journal_entry_id = je.id
FROM public.journal_entries je
WHERE je.source_type='purchase_payment' AND je.source_id=pp.id AND pp.journal_entry_id IS DISTINCT FROM je.id;

-- الدفعات الموجودة (لها قيود) → approved (لا نكسرها، لا نمسّ draft الموجودة)
UPDATE public.purchase_payments SET approval_status='approved'
WHERE journal_entry_id IS NOT NULL AND approval_status='draft';

-- النقطة 5 (حرجة): أوامر الشراء الموجودة قبل نظام الموافقات (acknowledged وغيرها)
-- تُعتبر معتمدة — وإلا أوّل PINV من PO قديم يُرفض بعد تفعيل PO Guard.
-- نعتمد فقط الحالات التشغيلية القديمة (لا draft/pending/rejected الجديدة).
UPDATE public.purchase_orders SET approval_status='approved'
WHERE approval_status IS NULL OR (approval_status='draft' AND status IN ('acknowledged','sent','confirmed','received','completed','closed'));

-- ═══════════════════ AW1.1.1: Conditional Posting (trigger الدفعة) ═══════════════════

-- حذف الـ trigger القديم (AFTER INSERT بلا فحص موافقة)
DROP TRIGGER IF EXISTS trg_supplier_payment_je ON public.purchase_payments;

-- الدالة الجديدة (Conditional + Function Guard)
CREATE OR REPLACE FUNCTION public.trg_supplier_payment_je_conditional()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_entry_id UUID; v_cash_account_id UUID; v_ap_account_id UUID;
  v_entry_no TEXT; v_supplier_name TEXT; v_invoice_no TEXT; v_payment_method TEXT;
  v_yr TEXT; v_seq INT;
  v_should_post BOOLEAN := false;
BEGIN
  -- تحديد ما إذا كان يجب إنشاء القيد (Function Guard — الطبقة الثانية)
  -- idempotency على مصدر الحقيقة الحقيقي (journal_entries)، لا العمود فقط
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_id=NEW.id AND source_type='purchase_payment') THEN
    -- قيد موجود فعلاً → لا إنشاء ثانٍ. اربط journal_entry_id إن كان فارغاً (إصلاح UPDATE فاشل سابق).
    UPDATE public.purchase_payments SET journal_entry_id=(SELECT id FROM public.journal_entries WHERE source_id=NEW.id AND source_type='purchase_payment' LIMIT 1)
    WHERE id=NEW.id AND journal_entry_id IS NULL;
    RETURN NEW;
  END IF;

  -- تحديد ما إذا كان يجب إنشاء القيد (Function Guard — بعد التأكّد من عدم وجود قيد)
  IF TG_OP='INSERT' THEN
    v_should_post := (NEW.approval_status='approved');
  ELSIF TG_OP='UPDATE' THEN
    v_should_post := (NEW.approval_status='approved' AND COALESCE(OLD.approval_status,'') <> 'approved');
  END IF;

  IF NOT v_should_post THEN RETURN NEW; END IF;

  -- بناء القيد (نفس منطق الأصل)
  SELECT name INTO v_supplier_name FROM public.contacts WHERE id=NEW.contact_id;
  SELECT invoice_no INTO v_invoice_no FROM public.purchase_invoices WHERE id=NEW.invoice_id;
  v_payment_method := COALESCE(NEW.payment_method, 'cash');
  v_cash_account_id := public.resolve_account('SUPPLIER_PAYMENT_PAY', NULL, NULL, NULL, v_payment_method);
  v_ap_account_id := public.resolve_account('PURCHASE_AP', NULL, NULL, NULL, NULL);

  v_yr := TO_CHAR(NEW.payment_date, 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_no FROM 'JE-' || v_yr || '-(\d+)') AS INT)), 0) + 1
  INTO v_seq FROM public.journal_entries WHERE entry_no LIKE 'JE-' || v_yr || '-%';
  v_entry_no := 'JE-' || v_yr || '-' || LPAD(v_seq::TEXT, 4, '0');

  INSERT INTO public.journal_entries (entry_no, entry_date, reference, description, is_posted, source_type, source_id, total_debit, total_credit)
  VALUES (v_entry_no, NEW.payment_date, NEW.code,
    'سداد مورد ' || NEW.code || ' - ' || COALESCE(v_supplier_name,'') || CASE WHEN v_invoice_no IS NOT NULL THEN ' / ' || v_invoice_no ELSE '' END,
    true, 'purchase_payment', NEW.id, NEW.amount, NEW.amount)
  RETURNING id INTO v_entry_id;

  -- سطر تخفيض الذمم (2111، مع partner)
  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, contact_id, partner_type, document_type, document_id, reference_number)
  VALUES (v_entry_id, v_ap_account_id, NEW.amount, 0, 'تخفيض ذمم - ' || COALESCE(v_supplier_name,''), NEW.contact_id, 'vendor', 'purchase_payment', NEW.id, NEW.code);

  -- سطر النقد (بلا partner)
  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, contact_id, document_type, document_id, reference_number)
  VALUES (v_entry_id, v_cash_account_id, 0, NEW.amount, 'صرف دفعة (' || v_payment_method || ')', NEW.contact_id, 'purchase_payment', NEW.id, NEW.code);

  -- ربط journal_entry_id (UPDATE ثانوي — آمن عبر Trigger Guard WHEN + journal_entry_id IS NULL)
  UPDATE public.purchase_payments SET journal_entry_id=v_entry_id WHERE id=NEW.id;

  RETURN NEW;
END;
$fn$;

-- trigger INSERT (دفعة approved مباشرة — نادر)
CREATE TRIGGER trg_supplier_payment_je_insert
  AFTER INSERT ON public.purchase_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_payment_je_conditional();

-- trigger UPDATE مع Guard (الطبقة الأولى — WHEN approval_status تغيّر فقط)
CREATE TRIGGER trg_supplier_payment_je_update
  AFTER UPDATE ON public.purchase_payments
  FOR EACH ROW
  WHEN (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
  EXECUTE FUNCTION public.trg_supplier_payment_je_conditional();

-- ═══════════════════ AW1.1.2: PO Guard (BEFORE INSERT على purchase_invoices) ═══════════════════
CREATE OR REPLACE FUNCTION public.trg_guard_pinv_from_unapproved_po()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE v_status TEXT; v_code TEXT;
BEGIN
  IF NEW.po_id IS NOT NULL THEN
    SELECT approval_status, code INTO v_status, v_code FROM public.purchase_orders WHERE id=NEW.po_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PO_NOT_FOUND: %', NEW.po_id;
    END IF;
    IF v_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'DOCUMENT_REQUIRES_APPROVAL: PO % (status=%) not approved — PINV blocked', v_code, v_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_pinv_from_unapproved_po ON public.purchase_invoices;
CREATE TRIGGER trg_guard_pinv_from_unapproved_po
  BEFORE INSERT ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_pinv_from_unapproved_po();

-- التحقّق
SELECT 'je_id_col' AS check, (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='purchase_payments' AND column_name='journal_entry_id') AS r
UNION ALL SELECT 'fk', (SELECT COUNT(*)::text FROM pg_constraint WHERE conname='fk_purchase_payments_journal_entry')
UNION ALL SELECT 'cond_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='trg_supplier_payment_je_conditional')
UNION ALL SELECT 'insert_trg', (SELECT COUNT(*)::text FROM pg_trigger WHERE tgname='trg_supplier_payment_je_insert')
UNION ALL SELECT 'update_trg', (SELECT COUNT(*)::text FROM pg_trigger WHERE tgname='trg_supplier_payment_je_update')
UNION ALL SELECT 'po_guard_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='trg_guard_pinv_from_unapproved_po')
UNION ALL SELECT 'po_guard_trg', (SELECT COUNT(*)::text FROM pg_trigger WHERE tgname='trg_guard_pinv_from_unapproved_po')
UNION ALL SELECT 'old_trg_gone', (SELECT COUNT(*)::text FROM pg_trigger WHERE tgname='trg_supplier_payment_je')
UNION ALL SELECT 'backfilled', (SELECT COUNT(*)::text FROM purchase_payments WHERE journal_entry_id IS NOT NULL);
