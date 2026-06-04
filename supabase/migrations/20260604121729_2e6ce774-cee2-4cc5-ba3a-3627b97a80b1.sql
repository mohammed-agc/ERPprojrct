
ALTER VIEW public.v_gov_invoices_missing_cogs       SET (security_invoker = true);
ALTER VIEW public.v_gov_sold_vehicles_without_cogs  SET (security_invoker = true);
ALTER VIEW public.v_gov_vehicles_missing_cost       SET (security_invoker = true);
