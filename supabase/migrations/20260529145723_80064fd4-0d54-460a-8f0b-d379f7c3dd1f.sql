-- 1. Extend app_role enum with new roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'general_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'purchasing_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'purchasing_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'treasury_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'inventory_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'receiving_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'inspection_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'workshop_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'spare_parts_manager';