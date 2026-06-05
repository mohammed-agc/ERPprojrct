
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS requester_name text,
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS suggested_supplier_id uuid REFERENCES public.suppliers(id);

ALTER TABLE public.purchase_request_lines
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS trim text;

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS trim text;
