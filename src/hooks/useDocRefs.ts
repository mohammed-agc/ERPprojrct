// Resolve internal UUIDs to business document numbers / names.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Map = Record<string, string>;

async function fetchMap(table: string, ids: string[], labelCol: string): Promise<Map> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return {};
  const { data, error } = await supabase.from(table as any).select(`id, ${labelCol}`).in("id", uniq);
  if (error) throw error;
  const m: Map = {};
  (data ?? []).forEach((r: any) => { m[r.id] = r[labelCol]; });
  return m;
}

export function useDocRefs(input: {
  supplierIds?: (string | null | undefined)[];
  poIds?: (string | null | undefined)[];
  allocationIds?: (string | null | undefined)[];
  shipmentIds?: (string | null | undefined)[];
  grnIds?: (string | null | undefined)[];
  vehicleIds?: (string | null | undefined)[];
}) {
  const suppliers = (input.supplierIds ?? []).filter(Boolean) as string[];
  const pos = (input.poIds ?? []).filter(Boolean) as string[];
  const allocs = (input.allocationIds ?? []).filter(Boolean) as string[];
  const ships = (input.shipmentIds ?? []).filter(Boolean) as string[];
  const grns = (input.grnIds ?? []).filter(Boolean) as string[];
  const vehs = (input.vehicleIds ?? []).filter(Boolean) as string[];

  const key = [
    suppliers.sort().join(","), pos.sort().join(","), allocs.sort().join(","),
    ships.sort().join(","), grns.sort().join(","), vehs.sort().join(","),
  ];

  const { data } = useQuery({
    queryKey: ["doc-refs", ...key],
    queryFn: async () => {
      const [supplier, po, allocation, shipment, grn, vehicle] = await Promise.all([
        fetchMap("suppliers", suppliers, "name"),
        fetchMap("purchase_orders", pos, "po_no"),
        fetchMap("allocations", allocs, "alloc_no"),
        fetchMap("shipments", ships, "shipment_no"),
        fetchMap("goods_receipts", grns, "grn_no"),
        fetchMap("vehicles", vehs, "vin"),
      ]);
      return { supplier, po, allocation, shipment, grn, vehicle };
    },
  });

  const empty: Map = {};
  return {
    supplier: data?.supplier ?? empty,
    po: data?.po ?? empty,
    allocation: data?.allocation ?? empty,
    shipment: data?.shipment ?? empty,
    grn: data?.grn ?? empty,
    vehicle: data?.vehicle ?? empty,
  };
}

export const refLabel = (map: Record<string, string>, id: string | null | undefined, fallback = "—") =>
  id ? (map[id] ?? id.slice(0, 8)) : fallback;
