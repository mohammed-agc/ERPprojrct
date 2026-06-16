-- ============================================================
-- Sequence Engine — Seed initial sequences for the 5 critical financial docs
-- ============================================================
-- سياسة الترقيم المعتمدة: تسلسل مستمر عبر السنوات (yearly_reset = false).
-- السنة تظهر في الرقم للعرض فقط (INV-2026-0001 ... INV-2027-0548) لكن
-- العدّاد لا يُصفّر — كل رقم فريد عبر عمر النظام (الأفضل للتدقيق والتوثيق).
-- يربط بالشركة الافتراضية ديناميكياً. Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO document_sequences
  (company_id, document_type, document_name, prefix, number_length, yearly_reset, include_year, active)
SELECT c.id, seq.document_type, seq.document_name, seq.prefix, 4, false, true, true
FROM companies c
CROSS JOIN (VALUES
  ('SALES_INVOICE',    'فاتورة بيع',     'INV'),
  ('PURCHASE_INVOICE', 'فاتورة شراء',    'PINV'),
  ('JOURNAL_ENTRY',    'قيد يومية',      'JE'),
  ('CUSTOMER_RECEIPT', 'سند قبض',        'CR'),
  ('VENDOR_PAYMENT',   'سند صرف',        'VP')
) AS seq(document_type, document_name, prefix)
WHERE c.code = 'DEFAULT'
ON CONFLICT (company_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), document_type)
DO NOTHING;

-- التحقّق
SELECT document_type, document_name, prefix, current_number, yearly_reset, include_year
FROM document_sequences ds
JOIN companies c ON c.id = ds.company_id
WHERE c.code = 'DEFAULT'
ORDER BY document_type;
