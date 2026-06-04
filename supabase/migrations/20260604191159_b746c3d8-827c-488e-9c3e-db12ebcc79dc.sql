
ALTER VIEW public.v_ap_vendor_balances SET (security_invoker = true);
ALTER VIEW public.v_ap_vendor_aging SET (security_invoker = true);
ALTER VIEW public.v_ap_vendor_statement SET (security_invoker = true);
ALTER VIEW public.v_gov_purchase_invoices_missing_je SET (security_invoker = true);
ALTER VIEW public.v_gov_supplier_payments_missing_je SET (security_invoker = true);
ALTER VIEW public.v_gov_inventory_without_purchase_cost SET (security_invoker = true);
