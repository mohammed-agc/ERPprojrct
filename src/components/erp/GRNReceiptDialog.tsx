import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  purchasingService, type GRNReceiptItem, type ReceivingNote,
} from "@/services/erp/purchasing";
import { getPoVehicleUnits, groupUnitsByPoLine } from "@/lib/poVehicleUnits";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grn: ReceivingNote;
  onRecorded?: () => void;
}

type RowState = {
  line_id: string;
  description: string;
  kind: "vehicle" | "part";
  ordered: number;
  alreadyReceived: number;
  remaining: number;
  qty: number;
  condition: GRNReceiptItem["condition"];
  bin?: string;
  vin_pending?: boolean;
  chassis_verified?: boolean;
  sku_verified?: boolean;
  barcode_verified?: boolean;
  notes?: string;
};

export function GRNReceiptDialog({ open, onOpenChange, grn, onRecorded }: Props) {
  const progress = useMemo(() => purchasingService.poReceivingProgress(grn.po_id), [grn.po_id, open]);

  const [rows, setRows] = useState<RowState[]>(() =>
    progress.lines.map(l => ({
      line_id: l.line_id,
      description: l.description,
      kind: l.kind,
      ordered: l.ordered,
      alreadyReceived: l.received,
      remaining: l.remaining,
      qty: 0,
      condition: "ok" as const,
      vin_pending: l.kind === "vehicle",
    })),
  );

  function upd(idx: number, patch: Partial<RowState>) {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function handleSave() {
    const items: GRNReceiptItem[] = rows
      .filter(r => (r.qty || 0) > 0)
      .map(r => ({
        line_id: r.line_id,
        qty: r.qty,
        condition: r.condition,
        bin: r.bin,
        vin_pending: r.kind === "vehicle" ? r.vin_pending : undefined,
        chassis_verified: r.kind === "vehicle" ? r.chassis_verified : undefined,
        sku_verified: r.kind === "part" ? r.sku_verified : undefined,
        barcode_verified: r.kind === "part" ? r.barcode_verified : undefined,
        notes: r.notes,
      }));
    if (items.length === 0) { toast.error("أدخل كميات للاستلام"); return; }
    purchasingService.recordReceipt(grn.id, items);
    toast.success("تم تسجيل الاستلام");
    onOpenChange(false);
    onRecorded?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>تسجيل استلام — {grn.code}</DialogTitle>
        </DialogHeader>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="w-[24%]">الصنف</th>
                <th>المطلوب</th>
                <th>المستلم سابقاً</th>
                <th>المتبقي</th>
                <th>كمية الاستلام</th>
                <th>الحالة</th>
                <th>الموقع/Bin</th>
                <th>التحقق</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.line_id}>
                  <td className="text-xs">
                    <div className="font-medium">{r.description}</div>
                    <div className="text-[10px] text-muted-foreground">{r.kind === "vehicle" ? "مركبة" : "قطعة"}</div>
                  </td>
                  <td className="num text-xs">{r.ordered}</td>
                  <td className="num text-xs text-muted-foreground">{r.alreadyReceived}</td>
                  <td className="num text-xs font-semibold">{r.remaining}</td>
                  <td>
                    <Input
                      type="number"
                      className="h-8 w-20 num"
                      min={0}
                      max={r.remaining}
                      value={r.qty}
                      onChange={e => upd(i, { qty: Math.max(0, Math.min(r.remaining, parseInt(e.target.value || "0", 10) || 0)) })}
                    />
                  </td>
                  <td>
                    <Select value={r.condition} onValueChange={(v) => upd(i, { condition: v as any })}>
                      <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ok">سليم</SelectItem>
                        <SelectItem value="damaged">تالف</SelectItem>
                        <SelectItem value="missing">ناقص</SelectItem>
                        <SelectItem value="wrong_item">صنف خاطئ</SelectItem>
                        <SelectItem value="extra">زائد</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td>
                    <Input className="h-8 w-24 text-xs" placeholder="Bin"
                      value={r.bin || ""} onChange={e => upd(i, { bin: e.target.value })} />
                  </td>
                  <td className="text-[10px]">
                    {r.kind === "vehicle" ? (
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-1">
                          <Checkbox checked={!!r.vin_pending} onCheckedChange={(v) => upd(i, { vin_pending: !!v })} />
                          VIN معلق
                        </label>
                        <label className="flex items-center gap-1">
                          <Checkbox checked={!!r.chassis_verified} onCheckedChange={(v) => upd(i, { chassis_verified: !!v })} />
                          شاسيه مطابق
                        </label>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-1">
                          <Checkbox checked={!!r.sku_verified} onCheckedChange={(v) => upd(i, { sku_verified: !!v })} />
                          SKU
                        </label>
                        <label className="flex items-center gap-1">
                          <Checkbox checked={!!r.barcode_verified} onCheckedChange={(v) => upd(i, { barcode_verified: !!v })} />
                          باركود
                        </label>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Label className="text-xs">
          <span className="text-muted-foreground">
            ملاحظة: لا يتم إنشاء مخزون فعلي إلا بعد اعتماد الفحص. هذه المرحلة تثبت الاستلام فقط.
          </span>
        </Label>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave}>تسجيل الاستلام</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
