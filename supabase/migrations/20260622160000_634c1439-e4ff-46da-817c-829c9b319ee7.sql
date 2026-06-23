-- ============================================================
-- ZATCA6.0: Clearance & Reporting — Error Codes Reference Table
-- ============================================================
-- بيانات مرجعية فقط (مثل account_determinations). لا RPC، لا trigger،
-- لا ربط تلقائي، لا State Machine. التصنيف/التحليل/الربط في Service Layer.
-- المرجع: ZATCA6_AUDIT.md. القرار: 🅑 محدود (جدول مرجعي + عقد Service).
-- ============================================================

-- ═══════════════════ Z6.0: zatca_error_codes (جدول مرجعي) ═══════════════════
CREATE TABLE IF NOT EXISTS public.zatca_error_codes (
  code TEXT PRIMARY KEY,
  category TEXT NOT NULL,            -- validation/network/server/business/signature/hashing/authentication
  severity TEXT NOT NULL,            -- error/warning/info
  retryable BOOLEAN NOT NULL,
  arabic_message TEXT NOT NULL,      -- رسالة عربية للدعم/المحاسبة
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zec_category_check CHECK (category IN ('validation','network','server','business','signature','hashing','authentication','unknown')),
  CONSTRAINT zec_severity_check CHECK (severity IN ('error','warning','info'))
);
CREATE INDEX IF NOT EXISTS idx_zec_category ON public.zatca_error_codes(category);
CREATE INDEX IF NOT EXISTS idx_zec_retryable ON public.zatca_error_codes(retryable);
COMMENT ON TABLE public.zatca_error_codes IS 'Reference data: ZATCA/Fatoora error code classification. Updated as ZATCA changes codes (no Service redeploy). Service Layer reads for retry/messaging; no business logic here.';

-- ═══════════════════ Z6.1: Seed (الرموز الشائعة) ═══════════════════
INSERT INTO public.zatca_error_codes (code, category, severity, retryable, arabic_message, description) VALUES
-- validation (لا إعادة — إصلاح + إعادة إصدار)
('invalid-invoice-hash','hashing','error',false,'هاش الفاتورة لا يطابق المحسوب من ملف XML','Invoice hash mismatch'),
('invalid-uuid','validation','error',false,'معرّف UUID غير صالح أو مكرّر','Invalid or duplicate UUID'),
('invalid-vat-number','validation','error',false,'الرقم الضريبي غير صالح','Invalid VAT registration number'),
('invalid-qr','validation','error',false,'رمز QR غير صالح أو غير متطابق','Invalid QR code'),
('XSD_INVALID','validation','error',false,'ملف XML لا يطابق مواصفات UBL 2.1 / ZATCA','XML does not comply with UBL 2.1 schema'),
('invalid-certificate','signature','error',false,'الشهادة غير صالحة أو منتهية','Invalid or expired certificate'),
('invalid-signature','signature','error',false,'التوقيع الرقمي غير صالح','Invalid digital signature'),
('duplicate-invoice','business','error',false,'الفاتورة مُرسلة مسبقاً (مكرّرة)','Invoice already submitted'),
('invalid-pih','hashing','error',false,'هاش الفاتورة السابقة (PIH) غير صحيح','Previous invoice hash mismatch'),
('invalid-icv','validation','error',false,'عدّاد الفاتورة (ICV) غير صحيح أو غير متسلسل','Invalid invoice counter value'),
-- network/server (إعادة — مؤقّت)
('request-timeout','network','error',true,'انتهت مهلة الطلب — أعد المحاولة','Request timeout'),
('gateway-timeout','network','error',true,'انتهت مهلة البوّابة — أعد المحاولة','Gateway timeout (504)'),
('internal-server-error','server','error',true,'خطأ في خادم ZATCA — أعد المحاولة لاحقاً','ZATCA internal server error (500)'),
('service-unavailable','server','error',true,'خدمة ZATCA غير متاحة مؤقتاً','Service unavailable (503)'),
('connection-error','network','error',true,'تعذّر الاتصال بـ ZATCA — أعd المحاولة','Connection error'),
-- warning (نجاح مع تحذير)
('warning-rules','validation','warning',false,'الفاتورة مقبولة مع تحذيرات — راجعها','Accepted with warnings'),
-- authentication (المصادقة — مشكلة مختلفة عن validation/server)
('unauthorized','authentication','error',true,'فشل المصادقة — تحقّق من رمز الوصول','Authentication failed (401)'),
('invalid-security-token','authentication','error',false,'رمز الأمان (binary security token) غير صالح','Invalid binary security token'),
('certificate-expired','signature','error',false,'الشهادة منتهية الصلاحية — جدّدها','Certificate expired'),
('expired-csid','authentication','error',false,'شهادة CSID منتهية — أعد الإصدار','CSID expired')
ON CONFLICT (code) DO NOTHING;

-- التحقّق
SELECT 'error_codes_table' AS check, (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='zatca_error_codes') AS r
UNION ALL SELECT 'seed_count', (SELECT COUNT(*)::text FROM public.zatca_error_codes)
UNION ALL SELECT 'retryable_count', (SELECT COUNT(*)::text FROM public.zatca_error_codes WHERE retryable=true)
UNION ALL SELECT 'no_retry_count', (SELECT COUNT(*)::text FROM public.zatca_error_codes WHERE retryable=false)
UNION ALL SELECT 'categories', (SELECT COUNT(DISTINCT category)::text FROM public.zatca_error_codes)
UNION ALL SELECT 'indexes', (SELECT COUNT(*)::text FROM pg_indexes WHERE indexname IN ('idx_zec_category','idx_zec_retryable'))
UNION ALL SELECT 'comment', (SELECT CASE WHEN obj_description('public.zatca_error_codes'::regclass) IS NOT NULL THEN '1' ELSE '0' END);
