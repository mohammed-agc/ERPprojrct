-- ============================================================
-- Company Foundation — Phase 1: companies master table
-- ============================================================
-- ARCHITECTURAL PRINCIPLE:
--   This ERP is Product-First, SaaS-Ready, Company-Aware, Branch-Aware.
--   Current deployment: Single Company / Single DB / Single Tenant.
--   NO tenant isolation, NO company switching, NO RLS-based multi-tenant
--   security at this stage — those come in a later SaaS phase.
--
--   The companies table becomes the ROOT MASTER record. Future entities
--   (branches, warehouses, sequences, accounting, inventory, sales,
--   purchasing, workshop, insurance, warranty, treasury, assets, HR)
--   will reference company_id.
--
-- IMPORTANT: services must ALWAYS retrieve the company dynamically by
--   (code='DEFAULT' AND is_active=true). Never hardcode the UUID.
-- ============================================================

-- ── جدول الشركات (root master, minimal) ──
CREATE TABLE IF NOT EXISTS companies (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     text NOT NULL UNIQUE,
  name                     text NOT NULL,
  commercial_registration  text,
  vat_number               text,
  country                  text NOT NULL DEFAULT 'SA',
  currency_code            text NOT NULL DEFAULT 'SAR',
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ── السجل الأولي: الشركة الافتراضية ──
INSERT INTO companies (code, name, country, currency_code, is_active)
SELECT 'DEFAULT', 'شركة معرض الخليج العربي للسيارات', 'SA', 'SAR', true
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE code = 'DEFAULT');

-- ── TEMPORARY RLS POLICY ──
-- This is NOT SaaS security and NOT tenant isolation.
-- It only allows authenticated users to access the company table
-- (Supabase enables RLS on new tables and blocks all access without a policy).
-- TO BE REPLACED during the Multi-Company / SaaS Architecture Phase.
DROP POLICY IF EXISTS auth_all_companies ON companies;
CREATE POLICY auth_all_companies ON companies
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── التحقّق ──
SELECT id, code, name, country, currency_code, is_active FROM companies;
