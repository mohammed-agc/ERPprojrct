
-- Phase 16A: Procurement simplification

-- 1. Receiving method enum
DO $$ BEGIN
  CREATE TYPE public.receiving_method AS ENUM ('rep_pickup', 'supplier_delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.grn_source AS ENUM ('allocation', 'shipment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Allocations: target warehouse / receiving method / receiver
ALTER TABLE public.allocations
  ADD COLUMN IF NOT EXISTS target_warehouse text,
  ADD COLUMN IF NOT EXISTS receiving_method public.receiving_method,
  ADD COLUMN IF NOT EXISTS receiver_id uuid;

-- 3. Goods receipts: shipment optional + source tag
ALTER TABLE public.goods_receipts
  ALTER COLUMN shipment_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source public.grn_source NOT NULL DEFAULT 'shipment';

-- Existing rows already have shipment_id, leave source='shipment'.
-- Future direct-from-allocation GRNs will be inserted with source='allocation'.

-- 4. Helpful index
CREATE INDEX IF NOT EXISTS idx_grn_allocation_id ON public.goods_receipts(allocation_id);

-- 5. Integrity: a GRN must either have a shipment OR be sourced from allocation
ALTER TABLE public.goods_receipts
  DROP CONSTRAINT IF EXISTS chk_grn_source_shipment;
ALTER TABLE public.goods_receipts
  ADD CONSTRAINT chk_grn_source_shipment CHECK (
    (source = 'shipment'  AND shipment_id IS NOT NULL) OR
    (source = 'allocation' AND allocation_id IS NOT NULL)
  );
