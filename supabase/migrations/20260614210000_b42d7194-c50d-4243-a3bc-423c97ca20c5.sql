-- ============================================================
-- Centralized Document Numbering Engine — Phase 2
-- document_sequences + document_sequence_logs + get_next_document_number()
-- ============================================================
-- SAP-style, company-aware, atomic, concurrency-safe.
-- Single source of truth for all document numbers. No hardcoded prefixes.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1) جدول التسلسلات (التكوين المركزي)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS document_sequences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,  -- nullable (company-level default)
  document_type   text NOT NULL,            -- 'SALES_INVOICE', 'PURCHASE_INVOICE', 'JOURNAL_ENTRY'...
  document_name   text NOT NULL,            -- اسم وصفي للعرض
  prefix          text NOT NULL,            -- 'INV', 'PINV', 'JE'...
  suffix          text NOT NULL DEFAULT '',
  current_number  integer NOT NULL DEFAULT 0,
  number_length   integer NOT NULL DEFAULT 4,   -- padding (0001)
  yearly_reset    boolean NOT NULL DEFAULT true,
  monthly_reset   boolean NOT NULL DEFAULT false,
  last_reset_year  integer,                 -- آخر سنة صُفّر فيها
  last_reset_month integer,                 -- آخر شهر صُفّر فيه
  include_year    boolean NOT NULL DEFAULT true,  -- INV-2026-0001 vs INV-0001
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- تسلسل واحد فقط لكل (شركة + فرع + نوع مستند)
CREATE UNIQUE INDEX IF NOT EXISTS document_sequences_unique_idx
  ON document_sequences (company_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), document_type);

-- ════════════════════════════════════════════════════════════
-- 2) سجلّ الترقيم (تتبّع كامل لكل رقم مُولّد)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS document_sequence_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id       uuid NOT NULL REFERENCES document_sequences(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id         uuid REFERENCES branches(id) ON DELETE SET NULL,
  document_type     text NOT NULL,
  generated_number  text NOT NULL,
  document_id       uuid,                   -- ربط بالمستند الفعلي (إن وُجد)
  generated_by      uuid,                   -- المستخدم
  generated_at      timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'issued'  -- issued | voided
);

-- منع التكرار المطلق: رقم واحد لكل (شركة + نوع + رقم مُولّد)
CREATE UNIQUE INDEX IF NOT EXISTS document_sequence_logs_unique_idx
  ON document_sequence_logs (company_id, document_type, generated_number);

CREATE INDEX IF NOT EXISTS document_sequence_logs_seq_idx ON document_sequence_logs(sequence_id);

-- ════════════════════════════════════════════════════════════
-- 3) الدالة atomic — get_next_document_number()
-- ════════════════════════════════════════════════════════════
-- آمنة من التزامن عبر UPDATE...RETURNING (يقفل الصف ذرّياً).
-- تتعامل مع التصفير السنوي/الشهري. تسجّل في السجلّ. لا تكرار.
CREATE OR REPLACE FUNCTION get_next_document_number(
  p_company_id    uuid,
  p_document_type text,
  p_branch_id     uuid DEFAULT NULL,
  p_document_date date DEFAULT CURRENT_DATE,
  p_generated_by  uuid DEFAULT NULL,
  p_document_id   uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq            document_sequences%ROWTYPE;
  v_year           integer := EXTRACT(YEAR FROM p_document_date)::integer;
  v_month          integer := EXTRACT(MONTH FROM p_document_date)::integer;
  v_next           integer;
  v_needs_reset    boolean := false;
  v_number_text    text;
  v_result         text;
BEGIN
  -- قفل صف التسلسل ذرّياً (FOR UPDATE) — يمنع سباق التزامن
  SELECT * INTO v_seq
  FROM document_sequences
  WHERE company_id = p_company_id
    AND document_type = p_document_type
    AND (
      (p_branch_id IS NULL AND branch_id IS NULL) OR
      (branch_id = p_branch_id)
    )
    AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا يوجد تسلسل مُعرّف للنوع % في هذه الشركة', p_document_type;
  END IF;

  -- تحديد الحاجة للتصفير
  IF v_seq.yearly_reset AND (v_seq.last_reset_year IS DISTINCT FROM v_year) THEN
    v_needs_reset := true;
  ELSIF v_seq.monthly_reset AND (v_seq.last_reset_month IS DISTINCT FROM v_month OR v_seq.last_reset_year IS DISTINCT FROM v_year) THEN
    v_needs_reset := true;
  END IF;

  IF v_needs_reset THEN
    v_next := 1;
  ELSE
    v_next := v_seq.current_number + 1;
  END IF;

  -- تحديث العدّاد ذرّياً
  UPDATE document_sequences
  SET current_number = v_next,
      last_reset_year = v_year,
      last_reset_month = v_month,
      updated_at = now()
  WHERE id = v_seq.id;

  -- بناء الرقم: PREFIX[-YEAR]-NNNN[SUFFIX]
  v_number_text := LPAD(v_next::text, v_seq.number_length, '0');
  IF v_seq.include_year THEN
    v_result := v_seq.prefix || '-' || v_year::text || '-' || v_number_text || v_seq.suffix;
  ELSE
    v_result := v_seq.prefix || '-' || v_number_text || v_seq.suffix;
  END IF;

  -- تسجيل في السجلّ (يفرض عدم التكرار عبر الفهرس الفريد)
  INSERT INTO document_sequence_logs (
    sequence_id, company_id, branch_id, document_type,
    generated_number, document_id, generated_by
  ) VALUES (
    v_seq.id, p_company_id, p_branch_id, p_document_type,
    v_result, p_document_id, p_generated_by
  );

  RETURN v_result;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 4) RLS مؤقّتة (نفس نمط النظام — إتاحة وصول، ليست أمان tenant)
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS auth_all_document_sequences ON document_sequences;
CREATE POLICY auth_all_document_sequences ON document_sequences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_all_document_sequence_logs ON document_sequence_logs;
CREATE POLICY auth_all_document_sequence_logs ON document_sequence_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sequence_logs ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════
-- 5) التحقّق
-- ════════════════════════════════════════════════════════════
SELECT 'document_sequences' AS object, COUNT(*) AS rows FROM document_sequences
UNION ALL
SELECT 'document_sequence_logs', COUNT(*) FROM document_sequence_logs;
