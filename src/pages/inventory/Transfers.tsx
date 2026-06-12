import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowLeftRight, Truck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { inventoryService, TRF_LABEL, TRF_TONE, fmtDate, type TransferStatus } from "@/services/erp/inventory";

export default function Transfers() {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<TransferStatus | "all">("all");

  const transfers = useMemo(() => inventoryService.listTransfers(), [tick]);
  const warehouses = useMemo(() => inventoryService.listWarehouses(), []);
  const vehicles = useMemo(() => inventoryService.listVehicles(), [tick]);
  const parts = useMemo(() => inventoryService.listParts(), [tick]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return transfers.filter(t => {
      if (status !== "all" && t.status !== status) return false;
      if (!qv) return true;
      return `${t.code} ${t.carrier ?? ""} ${t.user}`.toLowerCase().includes(qv);
    });
  }, [transfers, q, status]);

  const unitLabel = (t: typeof transfers[number]) => {
    if (t.kind === "vehicle") {
      const v = vehicles.find(x => x.id === t.unit_id);
      return v ? `${v.make} ${v.model} · ${v.vin.slice(-6)}` : "—";
    }
    const p = parts.find(x => x.id === t.unit_id);
    return p ? `${p.sku} · ${p.description}` : "—";
  };

  return (
    <div>
      <PageHeader title="التحويلات بين المستودعات" subtitle={`${transfers.length} تحويل`} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، ناقل..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="draft">{TRF_LABEL.draft}</SelectItem>
            <SelectItem value="in_transit">{TRF_LABEL.in_transit}</SelectItem>
            <SelectItem value="received">{TRF_LABEL.received}</SelectItem>
            <SelectItem value="cancelled">{TRF_LABEL.cancelled}</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>النوع</th>
              <th>الصنف</th>
              <th>الكمية</th>
              <th>من</th>
              <th>إلى</th>
              <th>الناقل</th>
              <th>الإنشاء</th>
              <th>الاستلام</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={11} className="text-center text-muted-foreground py-8">لا توجد تحويلات</td></tr>}
            {filtered.map(t => {
              const fromW = warehouses.find(w => w.id === t.from_warehouse_id);
              const toW = warehouses.find(w => w.id === t.to_warehouse_id);
              return (
                <tr key={t.id}>
                  <td className="font-mono text-[12px]"><div className="flex items-center gap-1.5"><ArrowLeftRight className="h-3 w-3 text-muted-foreground" />{t.code}</div></td>
                  <td className="text-xs">{t.kind === "vehicle" ? "مركبة" : "قطعة"}</td>
                  <td className="text-xs">{unitLabel(t)}</td>
                  <td className="num text-xs">{t.qty}</td>
                  <td className="text-xs">{fromW?.name ?? "—"}</td>
                  <td className="text-xs">{toW?.name ?? "—"}</td>
                  <td className="text-xs">{t.carrier ?? "—"}</td>
                  <td className="text-xs">{fmtDate(t.created_at)}</td>
                  <td className="text-xs">{fmtDate(t.received_at)}</td>
                  <td><Badge className={TRF_TONE[t.status]}>{TRF_LABEL[t.status]}</Badge></td>
                  <td>
                    <div className="flex gap-1">
                      {t.status === "draft" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-primary" title="شحن"
                          onClick={() => { inventoryService.setTransferStatus(t.id, "in_transit"); toast.success("تم تأكيد الشحن"); refresh(); }}>
                          <Truck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {t.status === "in_transit" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-success" title="استلام"
                          onClick={() => { inventoryService.setTransferStatus(t.id, "received"); toast.success("تم استلام التحويل"); refresh(); }}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
