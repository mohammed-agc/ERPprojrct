/**
 * Inventory ⇄ Purchasing/Sales Integration Layer
 * ----------------------------------------------
 * Frontend operational glue. Translates lifecycle events from the document
 * workflows (PO → Receiving → Inspection → Intake, SO → Reservation →
 * Delivery) into real movements inside the inventory engine.
 *
 * Kept in its own module to avoid circular imports between
 * purchasing.ts / sales.ts / inventory.ts.
 */
import { inventoryService } from "./inventory";
import type {
  InspectionRecord, PurchaseOrder, LineItem,
} from "./purchasing";

const DEFAULT_WAREHOUSE = "wh_ruh_main";
const DEFAULT_INSP_WAREHOUSE = "wh_insp_jed";
const DEFAULT_YARD = "wh_yard_ruh";

/** Best-effort warehouse resolution from a PO branch destination string. */
function resolveWarehouse(branch?: string): string {
  if (!branch) return DEFAULT_WAREHOUSE;
  if (branch.includes("جدة")) return "wh_jed_main";
  if (branch.includes("الدمام")) return "wh_dmm_branch";
  if (branch.includes("الرياض")) return DEFAULT_WAREHOUSE;
  return DEFAULT_WAREHOUSE;
}

/** Find an existing part in inventory matching a PO line description. */
function findPartIdForLine(line: LineItem): string | undefined {
  const desc = line.description.trim().toLowerCase();
  const parts = inventoryService.listParts();
  return parts.find(p =>
    desc.includes(p.description.toLowerCase()) ||
    p.description.toLowerCase().includes(desc) ||
    desc.includes(p.sku.toLowerCase()) ||
    desc.includes(p.oem_no.toLowerCase()),
  )?.id;
}

export const inventoryIntegration = {
  /* ===================== PURCHASING SIDE ===================== */

  /** Called by purchasingService when an inspection is approved.
   *  - For PARTS lines: bumps on_hand and logs p_receive movements.
   *  - For VEHICLE lines: vehicle records are still created via VehicleIntakeDialog
   *    + recordVehicleIntake; this hook only logs an inspection movement.
   */
  onInspectionApproved(ins: InspectionRecord, po: PurchaseOrder | undefined) {
    if (!po) return;
    const wh = resolveWarehouse(po.branch_destination);
    ins.items.forEach(it => {
      const line = po.items.find(l => l.id === it.line_id);
      if (!line) return;
      const approvedQty = it.passed ?? 0;
      if (approvedQty <= 0) return;

      if (line.kind === "part") {
        const partId = findPartIdForLine(line);
        if (partId) {
          // Bump on_hand on the matched part
          const all = inventoryService.listParts();
          const p = all.find(x => x.id === partId);
          if (p) {
            // mutate via direct service path — re-save through a movement
            // (inventoryService persists movements; on_hand patch is intentional)
            (p as any).on_hand = p.on_hand + approvedQty;
            (p as any).last_movement_at = new Date().toISOString();
            // Persist by re-reading & writing through a private channel:
            // we leverage logMovement which also reloads/saves.
          }
          inventoryService.logMovement({
            kind: "p_receive",
            reference: po.code,
            warehouse_id: wh,
            unit_id: partId,
            unit_kind: "part",
            qty: approvedQty,
            user: ins.inspector,
            notes: `استلام معتمد من الفحص ${po.code}`,
          });
        } else {
          // Unknown SKU — still log so the audit trail captures the event
          inventoryService.logMovement({
            kind: "p_receive",
            reference: po.code,
            warehouse_id: wh,
            unit_id: `unmapped:${line.id}`,
            unit_kind: "part",
            qty: approvedQty,
            user: ins.inspector,
            notes: `قطعة غير مرتبطة بسجل مخزون: ${line.description}`,
          });
        }
      } else {
        // Vehicle inspection movement (per approved unit)
        inventoryService.logMovement({
          kind: "v_inspect",
          reference: po.code,
          warehouse_id: DEFAULT_INSP_WAREHOUSE,
          unit_id: `pending_intake:${line.id}`,
          unit_kind: "vehicle",
          qty: approvedQty,
          user: ins.inspector,
          notes: `اعتماد فحص ${approvedQty} مركبة — بانتظار إدخال VIN`,
        });
      }
    });
  },

  /** Called when VehicleIntakeDialog finishes inserting vehicles into Supabase.
   *  Pushes mirrored records into the inventory engine + receive/intake movements.
   */
  onVehicleIntake(input: {
    po: PurchaseOrder;
    inspector: string;
    vehicles: Array<{
      id: string; vin: string; brand: string; model: string; year: number;
      trim?: string; color?: string; mileage?: number; cost: number;
    }>;
  }) {
    const wh = resolveWarehouse(input.po.branch_destination);
    input.vehicles.forEach(v => {
      inventoryService.logMovement({
        kind: "v_receive",
        reference: input.po.code,
        warehouse_id: wh,
        unit_id: v.id,
        unit_kind: "vehicle",
        qty: 1,
        user: input.inspector,
        notes: `إدخال VIN ${v.vin} — ${v.brand} ${v.model} ${v.year}`,
      });
    });
  },

  /* ===================== SALES SIDE ===================== */

  /** Release the matching inventory-engine reservation when a sales reservation is released. */
  onSalesReservationReleased(reservationCode: string) {
    const matches = inventoryService
      .listReservations()
      .filter(r => r.code === reservationCode || r.order_ref === reservationCode);
    matches.forEach(r => {
      if (r.status === "active") inventoryService.releaseReservation(r.id);
    });
  },

  /** Consume inventory when a delivery is completed.
   *  Logs v_deliver and (best-effort) marks the linked vehicle as delivered.
   */
  onDeliveryCompleted(input: {
    delivery_code: string;
    so_code: string;
    vehicle_label: string;
    delivery_officer: string;
    branch?: string;
  }) {
    // Best-effort match by VIN or vehicle label substring
    const vehicles = inventoryService.listVehicles();
    const m = vehicles.find(v =>
      input.vehicle_label.includes(v.vin) ||
      input.vehicle_label.toLowerCase().includes(`${v.make} ${v.model}`.toLowerCase()),
    );
    const wh = resolveWarehouse(input.branch);
    if (m) {
      inventoryService.setVehicleStatus(m.id, "delivered");
      inventoryService.logMovement({
        kind: "v_deliver",
        reference: input.delivery_code,
        warehouse_id: m.warehouse_id || wh,
        unit_id: m.id,
        unit_kind: "vehicle",
        qty: 1,
        user: input.delivery_officer,
        notes: `تسليم — ${input.so_code}`,
      });
    } else {
      // still log an unmapped movement for audit
      inventoryService.logMovement({
        kind: "v_deliver",
        reference: input.delivery_code,
        warehouse_id: wh,
        unit_id: `unmapped:${input.so_code}`,
        unit_kind: "vehicle",
        qty: 1,
        user: input.delivery_officer,
        notes: `تسليم بدون ربط مخزون — ${input.vehicle_label}`,
      });
    }
  },

  /* ===================== HELPERS ===================== */
  resolveWarehouse,
  findPartIdForLine,
  DEFAULT_WAREHOUSE,
  DEFAULT_INSP_WAREHOUSE,
  DEFAULT_YARD,
};
