import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ShieldCheck, Car, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  purchasingService, fmtSAR, type InspectionRecord, type PurchaseOrder, type LineItem,
} from "@/services/erp/purchasing";
import { inventoryIntegration } from "@/services/erp/integration";
import { serializeVehicleMeta, VehicleMeta } from "@/lib/vehicleMeta";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inspection: InspectionRecord | null;
  po: PurchaseOrder | null;
  onCreated?: () => void;
}

type Row = {
  uid: string;
  source_line_id: string;
  description: string;          // PO description "Toyota Camry 2026 GLE"
  brand: string;
  model: string;
  trim: string;
  year: number;
  unit_cost: number;
  vin: string;
  chassis: string;
  engine: string;
  color: string;
  mileage: number;
  transmission: "automatic" | "manual" | "cvt" | "";
  fuel_type: "petrol" | "diesel" | "hybrid" | "electric" | "";
  vinError?: string;
};

// Best-effort parser: "Toyota Camry 2026 GLE" → brand/model/year/trim
function parseDescription(desc: string): { brand: string; model: string; year: number; trim: string } {
  const yearMatch = desc.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear();
  const stripped = desc.replace(yearMatch?.[0] ?? "", "").trim();
  const parts = stripped.split(/\s+/);
  const brand = parts[0] ?? "";
  const trim = parts.length > 2 ? parts.slice(-1)[0] : "";
  const model = parts.slice(1, parts.length > 2 ? -1 : undefined).join(" ");
  return { brand, model: model || brand, year, trim };
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{11,17}$/i;

export function VehicleIntakeDialog({ open, onOpenChange, inspection, po, onCreated }: Props) {
  const supplier = useMemo(() => po ? purchasingService.getSupplier(po.supplier_id) : undefined, [po]);
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [existingVins, setExistingVins] = useState<Set<string>>(new Set());

  // Build rows for each approved unit of each vehicle-kind line that hasn't been intaked yet.
  useEffect(() => {
    if (!open || !inspection || !po) return;
    const alreadyTaken = inspection.vehicle_ids?.length ?? 0;
    const initial: Row[] = [];
    let counter = 0;
    inspection.items.forEach(insItem => {
      const poLine = po.items.find(l => l.id === insItem.line_id);
      if (!poLine || poLine.kind !== "vehicle") return;
      const approved = insItem.passed ?? 0;
      const parsed = parseDescription(poLine.description);
      for (let i = 0; i < approved; i++) {
        counter += 1;
        if (counter <= alreadyTaken) continue;
        initial.push({
          uid: `${insItem.line_id}_${i}`,
          source_line_id: insItem.line_id,
          description: poLine.description,
          ...parsed,
          unit_cost: poLine.unit_cost,
          vin: "", chassis: "", engine: "", color: "", mileage: 0,
          transmission: "automatic", fuel_type: "petrol",
        });
      }
    });
    setRows(initial);
  }, [open, inspection, po]);

  // Preload existing VINs from DB for duplicate detection
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    supabase.from("vehicles").select("vin").not("vin", "is", null)
      .then(({ data }) => {
        if (cancelled) return;
        setExistingVins(new Set((data ?? []).map((v: any) => String(v.vin).toUpperCase())));
      });
    return () => { cancelled = true; };
  }, [open]);

  // Validate all VINs on every change
  const validated = useMemo(() => {
    const seenLocal = new Map<string, number>();
    return rows.map((r) => {
      const v = r.vin.trim().toUpperCase();
      let err: string | undefined;
      if (!v) err = "VIN مطلوب";
      else if (!VIN_RE.test(v)) err = "VIN غير صالح (11–17 خانة، بدون I/O/Q)";
      else if (existingVins.has(v)) err = "VIN موجود مسبقاً في المخزون";
      else {
        const count = (seenLocal.get(v) ?? 0) + 1;
        seenLocal.set(v, count);
        if (count > 1) err = "VIN مكرر في هذه الدفعة";
      }
      return { ...r, vinError: err };
    });
  }, [rows, existingVins]);

  const hasErrors = validated.some(r => r.vinError);
  const update = (uid: string, patch: Partial<Row>) =>
    setRows(rs => rs.map(r => r.uid === uid ? { ...r, ...patch } : r));

  const submit = async () => {
    if (!inspection || !po) return;
    // Governance v1.3: Inventory creation ONLY when inspection is approved
    if (inspection.status !== "approved") {
      toast.error("لا يمكن إدخال المخزون قبل اعتماد الفحص (Inspection Passed)");
      return;
    }

    if (rows.length === 0) {
      toast.info("لا توجد وحدات بانتظار الإدخال للمخزون");
      return;
    }
    if (hasErrors) {
      toast.error("الرجاء تصحيح أخطاء VIN قبل الحفظ");
      return;
    }
    setSubmitting(true);
    try {
      // Generate codes
      const { count } = await supabase.from("vehicles").select("id", { count: "exact", head: true });
      const year = new Date().getFullYear();
      let seq = (count ?? 0) + 1;

      const inserts = validated.map(r => {
        const meta: VehicleMeta = {
          chassis: r.chassis || undefined,
          engine: r.engine || undefined,
          trim: r.trim || undefined,
          transmission: r.transmission || undefined,
          fuel_type: r.fuel_type || undefined,
          branch: po.branch_destination,
          supplier: supplier?.name,
          procurement: {
            state: "approved",
            po_reference: po.code,
            cost_purchase: r.unit_cost,
            approved_at: new Date().toISOString(),
            vin_verified: true,
            chassis_verified: !!r.chassis,
            engine_verified: !!r.engine,
            received_mileage: r.mileage,
          },
        };
        const row = {
          code: `VH-${year}-${String(seq++).padStart(5, "0")}`,
          name: `${r.brand} ${r.model} ${r.year}${r.trim ? " " + r.trim : ""}`.trim(),
          brand: r.brand,
          model: r.model,
          year: r.year,
          vin: r.vin.trim().toUpperCase(),
          color: r.color || null,
          mileage: r.mileage,
          cost_price: r.unit_cost,
          sale_price: 0,
          status: "available" as const,
          notes: serializeVehicleMeta(meta) || null,
        };
        return row;
      });

      const { data, error } = await supabase.from("vehicles").insert(inserts).select("id,vin");
      if (error) {
        if (error.code === "23505") {
          toast.error("VIN موجود مسبقاً — تعارض مع المخزون", {
            description: error.message,
          });
        } else {
          toast.error(error.message);
        }
        return;
      }
      const ids = (data ?? []).map((v: any) => v.id);
      purchasingService.recordVehicleIntake(inspection.id, ids);
      // Inventory engine integration: log v_receive movements per VIN
      try {
        inventoryIntegration.onVehicleIntake({
          po,
          inspector: inspection.inspector,
          vehicles: (data ?? []).map((row: any, idx: number) => {
            const r = validated[idx];
            return {
              id: row.id, vin: row.vin, brand: r.brand, model: r.model,
              year: r.year, trim: r.trim, color: r.color,
              mileage: r.mileage, cost: r.unit_cost,
            };
          }),
        });
      } catch (e) { console.warn("inv-integration:", e); }
      toast.success(`تم إدخال ${ids.length} مركبة للمخزون`);
      onOpenChange(false);
      onCreated?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            إدخال المركبات للمخزون
            {po && <Badge className="bg-primary/10 text-primary border border-primary/30 font-mono">{po.code}</Badge>}
          </DialogTitle>
          <DialogDescription>
            يتم تسجيل كل وحدة معتمدة من الفحص كسجل مركبة مستقل بـ <b>VIN فريد</b>. لا يمكن بيع المركبة قبل إكمال هذا الإدخال.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Info label="المورد" value={supplier?.name ?? "—"} />
          <Info label="فرع الوجهة" value={po?.branch_destination ?? "—"} />
          <Info label="عدد الوحدات" value={String(rows.length)} />
          <Info label="إجمالي التكلفة" value={fmtSAR(rows.reduce((s, r) => s + r.unit_cost, 0))} />
        </div>

        <div className="bg-warning/5 border border-warning/30 rounded p-2.5 text-xs flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
          <div>
            <b>حوكمة VIN:</b> رقم الهيكل (VIN) فريد عالمياً ولا يمكن تكراره — النظام يمنع تكراره مع أي مركبة في المخزون أو ضمن هذه الدفعة.
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-10 border border-dashed border-border rounded">
            لا توجد وحدات بانتظار الإدخال — جميع المركبات المعتمدة في هذا الفحص تم إدخالها للمخزون.
          </div>
        ) : (
          <div className="border border-border rounded overflow-x-auto">
            <table className="erp-table text-xs">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th className="min-w-[180px]">الوصف</th>
                  <th className="min-w-[170px]">VIN *</th>
                  <th className="min-w-[140px]">رقم الهيكل</th>
                  <th className="min-w-[140px]">رقم المحرك</th>
                  <th className="w-24">اللون</th>
                  <th className="w-20">الممشى</th>
                  <th className="w-28">ناقل الحركة</th>
                  <th className="w-24">الوقود</th>
                  <th className="w-28 text-left">التكلفة</th>
                </tr>
              </thead>
              <tbody>
                {validated.map((r, idx) => (
                  <tr key={r.uid}>
                    <td className="num text-muted-foreground">{idx + 1}</td>
                    <td>
                      <div className="font-medium">{r.brand} {r.model} <span className="num">{r.year}</span></div>
                      <div className="text-[10px] text-muted-foreground truncate">{r.description}</div>
                    </td>
                    <td>
                      <Input
                        dir="ltr" className={`h-7 font-mono text-xs ${r.vinError ? "border-destructive" : ""}`}
                        value={r.vin}
                        maxLength={17}
                        onChange={e => update(r.uid, { vin: e.target.value.toUpperCase() })}
                        placeholder="17 خانة"
                      />
                      {r.vinError && (
                        <div className="text-[10px] text-destructive flex items-center gap-0.5 mt-0.5">
                          <AlertTriangle className="h-3 w-3" />{r.vinError}
                        </div>
                      )}
                    </td>
                    <td><Input dir="ltr" className="h-7 font-mono text-xs" value={r.chassis} onChange={e => update(r.uid, { chassis: e.target.value })} /></td>
                    <td><Input dir="ltr" className="h-7 font-mono text-xs" value={r.engine} onChange={e => update(r.uid, { engine: e.target.value })} /></td>
                    <td><Input className="h-7 text-xs" value={r.color} onChange={e => update(r.uid, { color: e.target.value })} /></td>
                    <td><Input className="h-7 text-xs num" type="number" dir="ltr" value={r.mileage} onChange={e => update(r.uid, { mileage: Number(e.target.value) })} /></td>
                    <td>
                      <Select value={r.transmission || "automatic"} onValueChange={(v) => update(r.uid, { transmission: v as any })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="automatic">أوتوماتيك</SelectItem>
                          <SelectItem value="manual">يدوي</SelectItem>
                          <SelectItem value="cvt">CVT</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td>
                      <Select value={r.fuel_type || "petrol"} onValueChange={(v) => update(r.uid, { fuel_type: v as any })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="petrol">بنزين</SelectItem>
                          <SelectItem value="diesel">ديزل</SelectItem>
                          <SelectItem value="hybrid">هايبرد</SelectItem>
                          <SelectItem value="electric">كهربائي</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="num text-left font-semibold">{fmtSAR(r.unit_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>إلغاء</Button>
          <Button onClick={submit} disabled={submitting || rows.length === 0 || hasErrors}>
            {submitting && <Loader2 className="h-3.5 w-3.5 ml-1 animate-spin" />}
            إدخال {rows.length || ""} مركبة للمخزون
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 border border-border rounded p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

// Eslint: unused type guards — keep alongside dialog for future extension
export type _IntakeItem = LineItem;
