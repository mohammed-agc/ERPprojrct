-- Migration: seed company / tax / zatca settings into system_settings
-- Context: migrating company profile from localStorage to DB for SaaS readiness.
-- Adds ZATCA-compliant company fields (National Address, CRN, MOMRAH/MHRSD),
-- tax defaults, and ZATCA e-invoicing config (phases 1 & 2).
-- Applied manually on 2026-06-14 via Supabase SQL Editor; documented here for parity.
-- Idempotent: ON CONFLICT (key) DO NOTHING preserves any existing real values.

INSERT INTO system_settings (key, value, category, label, data_type, is_sensitive) VALUES
  -- هوية المنشأة
  ('company.name_ar',        'أرض المبارك',     'company', 'الاسم بالعربية',          'text', false),
  ('company.name_en',        'Ard Al-Mubarak',  'company', 'الاسم بالإنجليزية',       'text', false),
  ('company.logo_url',       '',                'company', 'رابط الشعار',             'text', false),
  -- التسجيل الضريبي والتجاري
  ('company.vat_number',     '300000000000003', 'company', 'الرقم الضريبي',           'text', false),
  ('company.cr_number',      '',                'company', 'السجل التجاري (CRN)',     'text', false),
  ('company.momrah_license', '',                'company', 'ترخيص الشؤون البلدية',    'text', false),
  ('company.mhrsd_license',  '',                'company', 'ترخيص الموارد البشرية',   'text', false),
  -- العنوان الوطني السعودي
  ('company.building_no',    '',                'company', 'رقم المبنى',              'text', false),
  ('company.street',         '',                'company', 'اسم الشارع',              'text', false),
  ('company.secondary_no',   '',                'company', 'الرقم الإضافي',           'text', false),
  ('company.district',       '',                'company', 'الحي',                    'text', false),
  ('company.city',           'جدة',             'company', 'المدينة',                 'text', false),
  ('company.postal_code',    '',                'company', 'الرمز البريدي',           'text', false),
  ('company.country_code',   'SA',              'company', 'رمز الدولة',              'text', false),
  -- التواصل
  ('company.phone',          '',                'company', 'الهاتف',                  'text', false),
  ('company.email',          '',                'company', 'البريد الإلكتروني',       'text', false),
  ('company.website',        '',                'company', 'الموقع الإلكتروني',       'text', false),
  -- المصرفية
  ('company.bank_name',      '',                'company', 'اسم البنك',               'text', false),
  ('company.iban',           '',                'company', 'رقم الآيبان (IBAN)',      'text', false),
  -- الضريبة
  ('tax.default_vat_pct',    '15',              'tax', 'نسبة ضريبة القيمة المضافة الافتراضية', 'number', false),
  ('tax.inclusive_default',  'false',           'tax', 'احتساب الضريبة شاملة افتراضياً', 'boolean', false),
  -- ZATCA: عام
  ('zatca.enabled',          'false',           'zatca', 'تفعيل الفوترة الإلكترونية',  'boolean', false),
  ('zatca.phase',            '1',               'zatca', 'مرحلة التطبيق (1=الإصدار، 2=التكامل)', 'number', false),
  ('zatca.environment',      'sandbox',         'zatca', 'البيئة (sandbox/simulation/production)', 'text', false),
  ('zatca.business_type',    'both',            'zatca', 'نوع النشاط (B2B/B2C/both)',  'text', false),
  -- ZATCA: المرحلة 1
  ('zatca.qr_enabled',       'true',            'zatca', 'تفعيل رمز QR على الفاتورة',  'boolean', false),
  -- ZATCA: المرحلة 2 (حقول حسّاسة)
  ('zatca.egs_unit_name',    '',                'zatca', 'اسم وحدة EGS',              'text', false),
  ('zatca.egs_serial',       '',                'zatca', 'الرقم التسلسلي لوحدة EGS',  'text', false),
  ('zatca.otp',              '',                'zatca', 'رمز OTP المؤقت',            'text', true),
  ('zatca.csid',             '',                'zatca', 'معرّف الختم التشفيري (CSID)','text', true),
  ('zatca.registration_status','not_registered','zatca', 'حالة التسجيل',              'text', false),
  ('zatca.fatoora_url',      'https://fatoora.zatca.gov.sa', 'zatca', 'رابط بوابة فاتورة', 'text', false)
ON CONFLICT (key) DO NOTHING;
