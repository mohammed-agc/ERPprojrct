-- ============================================================
-- Vehicle Financial Foundation — F3: COGS Engine
-- توسيع create_invoice_journal_entry بقيد COGS منفصل
-- ============================================================
-- يضيف قيد COGS منفصل (source_type='sales_invoice_cogs') عند إصدار الفاتورة:
--   لكل بند فاتورة له vehicle_id:
--     مدين  resolve_account('COGS_EXPENSE', product_type)        = landed_cost
--     دائن  resolve_account('COGS_INVENTORY_OUT', product_type)  = landed_cost
--   + vehicle_id مملوء لكل سطر
--   + invoices.cogs_journal_entry_id = قيد COGS
--
-- القرارات: قيد منفصل · resolve_account بالكامل (لا 511/1141 ثابتة) ·
--   التكلفة من compute_vehicle_landed_cost (F1) · لا backfill (الجديدة فقط) ·
--   F4 منفصل (qty/status تشغيلي).
-- قاعدتا حماية: status='issued' · landed_cost>0 (وإلا governance_log).
-- idempotent: فحص source_type='sales_invoice_cogs'.
-- المرجع: F3_IMPLEMENTATION_REVIEW.md.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_invoice_journal_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_entry_id UUID;
  v_ar_account_id UUID;
  v_vat_output_id UUID;
  v_sales_revenue_id UUID;
  v_entry_no TEXT;
  v_customer_name TEXT;
  v_product_type TEXT;
  v_dept_code TEXT;
  v_yr TEXT;
  v_seq INT;
BEGIN
  IF NEW.status NOT IN ('issued', 'paid', 'partially_paid') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_id = NEW.id AND source_type = 'sales_invoice') THEN
    -- قيد الإيراد موجود؛ لا نُعيده. لكن نكمل لفحص COGS (قد يكون مفقوداً).
    NULL;
  END IF;

  SELECT name INTO v_customer_name FROM public.contacts WHERE id = NEW.customer_id;

  SELECT
    CASE WHEN department_code = 'PARTS' THEN 'part'
         WHEN department_code = 'SERVICE' THEN 'service'
         ELSE 'new_vehicle' END,
    department_code
  INTO v_product_type, v_dept_code
  FROM public.sales_orders WHERE id = NEW.sales_order_id;

  -- ════════════════════════════════════════════════
  -- قيد الإيراد (Revenue JE) — كما هو، مع حماية idempotency
  -- ════════════════════════════════════════════════
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE source_id = NEW.id AND source_type = 'sales_invoice') THEN
    v_ar_account_id    := public.resolve_account('SALES_AR', NULL, v_dept_code, v_product_type, NULL);
    v_vat_output_id    := public.resolve_account('SALES_VAT_OUTPUT', NULL, NULL, NULL, NULL);
    v_sales_revenue_id := public.resolve_account('SALES_REVENUE', NULL, v_dept_code, v_product_type, NULL);

    v_yr := TO_CHAR(NEW.invoice_date, 'YYYY');
    SELECT COALESCE(MAX(CAST(SUBSTRING(entry_no FROM 'JE-' || v_yr || '-(\d+)') AS INT)), 0) + 1
    INTO v_seq FROM public.journal_entries WHERE entry_no LIKE 'JE-' || v_yr || '-%';
    v_entry_no := 'JE-' || v_yr || '-' || LPAD(v_seq::TEXT, 4, '0');

    INSERT INTO public.journal_entries (
      entry_no, entry_date, reference, description, is_posted,
      source_type, source_id, total_debit, total_credit
    ) VALUES (
      v_entry_no, NEW.invoice_date, NEW.invoice_no,
      'فاتورة مبيعات ' || NEW.invoice_no || ' - ' || COALESCE(v_customer_name, ''),
      true, 'sales_invoice', NEW.id, NEW.total, NEW.total
    ) RETURNING id INTO v_entry_id;

    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, contact_id,
      partner_type, document_type, document_id, reference_number)
    VALUES (v_entry_id, v_ar_account_id, NEW.total, 0,
            'ذمم مدينة - ' || COALESCE(v_customer_name, ''), NEW.customer_id,
            'customer', 'sales_invoice', NEW.id, NEW.invoice_no);

    IF NEW.vat_amount > 0 THEN
      INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description,
        document_type, document_id, reference_number)
      VALUES (v_entry_id, v_vat_output_id, 0, NEW.vat_amount, 'VAT 15% - ' || NEW.invoice_no,
        'sales_invoice', NEW.id, NEW.invoice_no);
    END IF;

    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description,
      document_type, document_id, reference_number)
    VALUES (v_entry_id, v_sales_revenue_id, 0, NEW.subtotal, 'مبيعات - ' || NEW.invoice_no,
      'sales_invoice', NEW.id, NEW.invoice_no);
  END IF;

  -- ════════════════════════════════════════════════
  -- F3: قيد COGS منفصل (sales_invoice_cogs)
  -- ════════════════════════════════════════════════
  -- قاعدة حماية 1: فقط للفواتير المُصدرة
  IF NEW.status = 'issued' THEN
    -- idempotency
    IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE source_id = NEW.id AND source_type = 'sales_invoice_cogs') THEN
      DECLARE
        v_cogs_entry_id UUID;
        v_cogs_entry_no TEXT;
        v_cogs_seq INT;
        v_total_cogs NUMERIC := 0;
        v_line RECORD;
        v_landed NUMERIC;
        v_cogs_exp_acct UUID;
        v_cogs_inv_acct UUID;
        v_line_ptype TEXT;
        v_cogs_yr TEXT;
      BEGIN
        -- إجمالي COGS أولاً (للتحقّق)
        FOR v_line IN
          SELECT il.vehicle_id, ii.item_type
          FROM public.invoice_lines il
          JOIN public.inventory_items ii ON ii.id = il.vehicle_id
          WHERE il.invoice_id = NEW.id AND il.vehicle_id IS NOT NULL
        LOOP
          SELECT landed_cost INTO v_landed FROM public.compute_vehicle_landed_cost(v_line.vehicle_id);
          v_total_cogs := v_total_cogs + COALESCE(v_landed, 0);
        END LOOP;

        -- قاعدة حماية 2: لا قيد بتكلفة صفرية + سجل حوكمة
        IF v_total_cogs <= 0 THEN
          INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, reason, details)
          VALUES ('COGS_BLOCKED_MISSING_COST', 'accounting', 'sales_invoice', NEW.id, NEW.invoice_no,
                  'landed_cost <= 0',
                  jsonb_build_object('event','COGS_BLOCKED_MISSING_COST','invoice_id',NEW.id,'invoice_no',NEW.invoice_no,'total_cogs',v_total_cogs));
        ELSE
          -- ترقيم قيد COGS
          v_cogs_yr := TO_CHAR(NEW.invoice_date, 'YYYY');
          SELECT COALESCE(MAX(CAST(SUBSTRING(entry_no FROM 'JE-' || v_cogs_yr || '-(\d+)') AS INT)), 0) + 1
          INTO v_cogs_seq FROM public.journal_entries WHERE entry_no LIKE 'JE-' || v_cogs_yr || '-%';
          v_cogs_entry_no := 'JE-' || v_cogs_yr || '-' || LPAD(v_cogs_seq::TEXT, 4, '0');

          INSERT INTO public.journal_entries (
            entry_no, entry_date, reference, description, is_posted,
            source_type, source_id, total_debit, total_credit
          ) VALUES (
            v_cogs_entry_no, NEW.invoice_date, NEW.invoice_no,
            'تكلفة بضاعة مباعة ' || NEW.invoice_no, true,
            'sales_invoice_cogs', NEW.id, v_total_cogs, v_total_cogs
          ) RETURNING id INTO v_cogs_entry_id;

          -- سطور COGS لكل مركبة (resolve_account بالكامل، vehicle_id مملوء)
          FOR v_line IN
            SELECT il.vehicle_id, ii.item_type
            FROM public.invoice_lines il
            JOIN public.inventory_items ii ON ii.id = il.vehicle_id
            WHERE il.invoice_id = NEW.id AND il.vehicle_id IS NOT NULL
          LOOP
            SELECT landed_cost INTO v_landed FROM public.compute_vehicle_landed_cost(v_line.vehicle_id);
            IF COALESCE(v_landed,0) <= 0 THEN
              INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, reason, details)
              VALUES ('COGS_BLOCKED_MISSING_COST', 'accounting', 'sales_invoice', NEW.id, NEW.invoice_no,
                      'landed_cost <= 0 (line)',
                      jsonb_build_object('event','COGS_BLOCKED_MISSING_COST','invoice_id',NEW.id,'vehicle_id',v_line.vehicle_id,'landed_cost',COALESCE(v_landed,0)));
              CONTINUE;
            END IF;

            -- نوع المنتج من المصدر (resolve_account بالكامل — لا 511/1141 ثابتة)
            v_line_ptype := CASE WHEN v_line.item_type = 'vehicle' THEN 'new_vehicle'
                                 WHEN v_line.item_type = 'part' THEN 'part'
                                 ELSE 'new_vehicle' END;
            v_cogs_exp_acct := public.resolve_account('COGS_EXPENSE', NULL, NULL, v_line_ptype, NULL);
            v_cogs_inv_acct := public.resolve_account('COGS_INVENTORY_OUT', NULL, NULL, v_line_ptype, NULL);

            -- مدين: تكلفة البضاعة المباعة
            INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description,
              document_type, document_id, reference_number, vehicle_id)
            VALUES (v_cogs_entry_id, v_cogs_exp_acct, v_landed, 0,
              'تكلفة مركبة مباعة - ' || NEW.invoice_no, 'sales_invoice_cogs', NEW.id, NEW.invoice_no, v_line.vehicle_id);

            -- دائن: إخراج المخزون
            INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description,
              document_type, document_id, reference_number, vehicle_id)
            VALUES (v_cogs_entry_id, v_cogs_inv_acct, 0, v_landed,
              'إخراج مخزون مركبة - ' || NEW.invoice_no, 'sales_invoice_cogs', NEW.id, NEW.invoice_no, v_line.vehicle_id);
          END LOOP;

          UPDATE public.invoices SET cogs_journal_entry_id = v_cogs_entry_id WHERE id = NEW.id;
        END IF;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
