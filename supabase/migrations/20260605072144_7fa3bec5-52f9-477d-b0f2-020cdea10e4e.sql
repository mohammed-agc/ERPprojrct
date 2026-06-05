
-- Stage 1: Active allocation uniqueness guard on po_line_id.
-- Prevents a single PO line unit from being allocated more than once,
-- unless the prior allocation_line is cancelled.
CREATE UNIQUE INDEX IF NOT EXISTS uq_allocation_lines_active_po_line
ON public.allocation_lines (po_line_id)
WHERE po_line_id IS NOT NULL AND status <> 'cancelled';

-- Governance view: detects any po_line_id with more than one active allocation_line.
-- Should always be empty under the new guard; serves as a continuous control.
CREATE OR REPLACE VIEW public.v_gov_duplicate_po_line_allocations AS
SELECT
  al.po_line_id,
  COUNT(*) AS active_allocation_count,
  array_agg(DISTINCT a.alloc_no ORDER BY a.alloc_no) AS allocation_nos,
  array_agg(DISTINCT al.allocation_id) AS allocation_ids,
  array_agg(DISTINCT al.vin) AS vins,
  MIN(a.created_at) AS first_allocated_at,
  MAX(a.created_at) AS last_allocated_at
FROM public.allocation_lines al
JOIN public.allocations a ON a.id = al.allocation_id
WHERE al.po_line_id IS NOT NULL
  AND al.status <> 'cancelled'
  AND a.status <> 'cancelled'
GROUP BY al.po_line_id
HAVING COUNT(*) > 1;

GRANT SELECT ON public.v_gov_duplicate_po_line_allocations TO authenticated;
GRANT SELECT ON public.v_gov_duplicate_po_line_allocations TO service_role;
