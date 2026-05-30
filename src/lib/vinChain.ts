/**
 * VIN Chain — read-only verification helper.
 *
 * Walks every operational store (allocation → invoice link → GRN →
 * inspection → inventory) and reports where a given VIN appears.
 * Used by the Receiving Workbench to surface a "VIN chain ✓" badge so
 * operators see the same VIN flowing end-to-end without re-entry.
 */
import { allocationService } from "@/services/erp/allocations";
import { purchasingService } from "@/services/erp/purchasing";
import { inventoryService } from "@/services/erp/inventory";
import { normalizeVIN } from "@/lib/vinValidation";

export type VinChainStage =
  | "allocation"
  | "allocation_confirmation"
  | "purchase_invoice"
  | "receiving"
  | "inspection"
  | "inventory"
  | "sales"
  | "delivery";

export interface VinChainHit {
  stage: VinChainStage;
  reference: string;
}

export interface VinChainReport {
  vin: string;
  hits: VinChainHit[];
  /** stages found, in canonical order */
  stages: VinChainStage[];
  /** allocation → inventory all present */
  intact: boolean;
}

const ORDER: VinChainStage[] = [
  "allocation", "allocation_confirmation", "purchase_invoice",
  "receiving", "inspection", "inventory", "sales", "delivery",
];

const REQUIRED: VinChainStage[] = ["allocation", "inventory"];

export function getVinChain(rawVin: string): VinChainReport {
  const vin = normalizeVIN(rawVin);
  const hits: VinChainHit[] = [];
  if (!vin) return { vin, hits, stages: [], intact: false };

  // Allocations (lines carry VIN)
  for (const a of allocationService.list()) {
    if (a.status === "cancelled") continue;
    if (a.lines.some(l => normalizeVIN(l.vin) === vin)) {
      hits.push({ stage: "allocation", reference: a.code });
      if (a.status === "confirmed") {
        hits.push({ stage: "allocation_confirmation", reference: a.code });
      }
      if (a.invoice_id) {
        const inv = purchasingService.getPurchaseInvoice(a.invoice_id);
        if (inv) hits.push({ stage: "purchase_invoice", reference: inv.code });
      }
    }
  }

  // GRN (vin_pending flag — we don't store VIN at receiving level today,
  // but the linked PO/Allocation already proves the receiving step).
  // We surface "receiving" when a GRN exists for the same PO as a matching allocation.
  const allocPoIds = new Set(
    allocationService.list()
      .filter(a => a.lines.some(l => normalizeVIN(l.vin) === vin))
      .map(a => a.po_id),
  );
  for (const poId of allocPoIds) {
    const grns = purchasingService.grnsForPO(poId);
    grns.forEach(g => hits.push({ stage: "receiving", reference: g.code }));
    grns.forEach(g => {
      const insp = purchasingService.getInspectionByGRN(g.id);
      if (insp) hits.push({ stage: "inspection", reference: g.code });
    });
  }

  // Inventory
  const veh = inventoryService.listVehicles().find(v => normalizeVIN(v.vin) === vin);
  if (veh) {
    hits.push({ stage: "inventory", reference: veh.vin });
    if (veh.status === "sold") hits.push({ stage: "sales", reference: veh.vin });
    if (veh.status === "delivered") hits.push({ stage: "delivery", reference: veh.vin });
  }

  const stages = ORDER.filter(s => hits.some(h => h.stage === s));
  const intact = REQUIRED.every(s => stages.includes(s));
  return { vin, hits, stages, intact };
}

export const VIN_STAGE_LABEL: Record<VinChainStage, string> = {
  allocation: "تخصيص",
  allocation_confirmation: "تأكيد التخصيص",
  purchase_invoice: "فاتورة شراء",
  receiving: "استلام",
  inspection: "فحص",
  inventory: "مخزون",
  sales: "بيع",
  delivery: "تسليم",
};
