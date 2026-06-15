-- Migration: add REBATE and INSURANCE to open_item_allocations.allocation_type
-- Context: ZATCA/SAP open-item clearing — REBATE (manufacturer incentive reducing
-- customer balance) and INSURANCE (insurance fee) needed as allocation types.
-- Applied manually on 2026-06-14 via Supabase SQL Editor; documented here for parity.

ALTER TABLE open_item_allocations
DROP CONSTRAINT IF EXISTS open_item_allocations_allocation_type_check;

ALTER TABLE open_item_allocations
ADD CONSTRAINT open_item_allocations_allocation_type_check
CHECK (allocation_type = ANY (ARRAY[
    'PAYMENT'::text,
    'SETTLEMENT'::text,
    'CREDIT_NOTE'::text,
    'DEBIT_NOTE'::text,
    'WRITE_OFF'::text,
    'ADJUSTMENT'::text,
    'REBATE'::text,
    'INSURANCE'::text
]));
