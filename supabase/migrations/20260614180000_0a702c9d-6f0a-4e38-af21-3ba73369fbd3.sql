-- Migration: create branches table + main branch + multi_branch toggle
-- Context: SaaS readiness — every tenant has a mandatory "Main Branch".
-- Companies without branches operate transparently on the main branch;
-- companies with branches enable multi_branch and manage additional ones.
-- branch_id columns already exist (empty) on: account_determinations,
-- employees, journal_entry_lines, open_item_allocations. No FK added yet
-- (deferred to unification phase) to avoid coupling during testing.

-- ── 1) جدول الفروع ──
CREATE TABLE IF NOT EXISTS branches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name_ar     text NOT NULL,
  name_en     text,
  is_main     boolean NOT NULL DEFAULT false,
  -- العنوان الوطني (نفس بنية الشركة — كل فرع قد يكون له عنوانه)
  building_no text,
  street      text,
  district    text,
  city        text,
  postal_code text,
  -- التواصل والإدارة
  phone       text,
  manager_name text,
  -- ترقيم الفواتير الخاص بالفرع (للأنظمة متعددة الفروع)
  invoice_prefix text,
  -- الحالة
  is_active   boolean NOT NULL DEFAULT true,
  opened_at   date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2) قيد: فرع رئيسي واحد فقط ──
-- (partial unique index: لا يُسمح بأكثر من فرع is_main = true)
CREATE UNIQUE INDEX IF NOT EXISTS branches_single_main_idx
  ON branches (is_main) WHERE is_main = true;

-- ── 3) إنشاء الفرع الرئيسي تلقائياً (إن لم يوجد) ──
INSERT INTO branches (code, name_ar, name_en, is_main, city, is_active)
SELECT 'MAIN', 'الفرع الرئيسي', 'Main Branch', true, 'جدة', true
WHERE NOT EXISTS (SELECT 1 FROM branches WHERE is_main = true);

-- ── 4) مفتاح تفعيل تعدّد الفروع في الإعدادات ──
INSERT INTO system_settings (key, value, category, label, data_type, is_sensitive)
VALUES ('company.multi_branch_enabled', 'false', 'company', 'تفعيل تعدّد الفروع', 'boolean', false)
ON CONFLICT (key) DO NOTHING;

-- ── التحقّق ──
SELECT 'branches' AS info, COUNT(*) AS rows, COUNT(*) FILTER (WHERE is_main) AS main_count FROM branches;
