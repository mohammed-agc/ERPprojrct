import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, FileText, ShieldCheck } from "lucide-react";
import {
  purchasingService, PO_LABEL, PO_TONE, fmtSAR, fmtDate, type POStatus,
} from "@/services/erp/purchasing";
import { PurchaseOrderDialog } from "@/components/erp/PurchaseOrderDialog";
import { SupplierConfirmationDialog } from "@/components/erp/SupplierConfirmationDialog";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "نقدي", net_30: "30 يوم", net_60: "60 يوم", net_90: "90 يوم", credit_line: "حد ائتماني",
};


const STATUS_OPTS: { value: POStatus | "all" | "open"; label: string }[] = [
  { value: "open", label: "المفتوحة" },
  { value: "all", label: "الكل" },
  { value: "draft", label: PO_LABEL.draft },
  { value: "approved", label: PO_LABEL.approved },
  { value: "ordered", label: PO_LABEL.ordered },
  { value: "partially_received", label: PO_LABEL.partially_received },
  { value: "completed", label: PO_LABEL.completed },
  { value: "cancelled", label: PO_LABEL.cancelled },
];

export default function PurchaseOrders() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<POStatus | "all" | "open">("open");
  const [supplier, setSupplier] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmPoId, setConfirmPoId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const pos = useMemo(() => purchasingService.listPOs(), [tick]);

  const suppliers = useMemo(() => purchasingService.listSuppliers(), []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    const openStates: POStatus[] = ["draft", "approved", "ordered", "partially_received"];
    return pos.filter(p => {
      if (status === "open" && !openStates.includes(p.status)) return false;
      if (status !== "all" && status !== "open" && p.status !== status) return false;
      if (supplier !== "all" && p.supplier_id !== supplier) return false;
      if (!qv) return true;
      const s = suppliers.find(x => x.id === p.supplier_id);
      const hay = `${p.code} ${p.branch_destination} ${s?.name ?? ""}`.toLowerCase();
      return hay.includes(qv);
    });
  }, [pos, q, status, supplier, suppliers]);

  const totals = useMemo(() => ({
    count: filtered.length,
    value: filtered.reduce((s, p) => s + p.total, 0),
  }), [filtered]);

  return (
    <div>
      <PageHeader
        title="أوامر الشراء"
        subtitle={`${totals.count} أمر · إجمالي ${fmtSAR(totals.value)}`}
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 ml-1" /> أمر شراء جديد</Button>}
      />
      <PurchaseOrderDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => setTick(t => t + 1)} />


      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، مورد، فرع..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={supplier} onValueChange={setSupplier}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموردين</SelectItem>
            {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>المورد</th>
              <th>الفرع</th>
              <th>الأصناف</th>
              <th>القيمة</th>
              <th>الدفع</th>
              <th>الاتفاقية</th>
              <th>الوصول المتوقع</th>
              <th>التقدم</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="text-center text-muted-foreground py-8">لا توجد أوامر مطابقة</td></tr>
            )}
            {filtered.map(p => {
              const s = suppliers.find(x => x.id === p.supplier_id);
              const av = purchasingService.availability(p);
              const canConfirmSupplier = p.status === "awaiting_supplier_confirmation";
              return (
                <tr key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => nav(`/purchasing/orders/${p.id}`)}>
                  <td className="font-mono text-[11px]">
                    <div className="flex items-center gap-1.5 text-primary hover:underline">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      {p.code}
                    </div>
                    {p.pr_id && <div className="text-[9px] text-muted-foreground mt-0.5">من طلب شراء</div>}
                  </td>
                  <td>
                    <div className="text-sm">{s?.name ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{s?.country}</div>
                  </td>
                  <td className="text-xs">{p.branch_destination}</td>
                  <td className="text-xs">
                    {p.items.length} صنف · <span className="num">{p.items.reduce((x, i) => x + i.qty, 0)}</span> وحدة
                  </td>
                  <td className="num text-xs font-semibold">{fmtSAR(p.total)}</td>
                  <td className="text-xs">{PAYMENT_LABEL[p.payment_term]}</td>
                  <td className="text-xs">
                    {p.agreement_type === "framework" ? "إطارية" : p.agreement_type === "spot" ? "فورية" : "أمانة"}
                  </td>
                  <td className="text-xs">{fmtDate(p.expected_delivery)}</td>
                  <td className="w-[120px]">
                    <div className="h-1.5 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${av.pctReceived}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {av.receivedQty}/{av.totalQty} مستلم · <span className="text-success">{av.approvedQty} متاح للبيع</span>
                    </div>
                  </td>
                  <td><Badge className={PO_TONE[p.status]}>{PO_LABEL[p.status]}</Badge></td>
                  <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {canConfirmSupplier && (
                      <Button size="sm" variant="outline" className="h-7 text-[11px]"
                        onClick={() => setConfirmPoId(p.id)}>
                        <ShieldCheck className="h-3.5 w-3.5 ml-1" /> تأكيد المورد
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmPoId && (
        <SupplierConfirmationDialog
          open={!!confirmPoId}
          onOpenChange={(v) => !v && setConfirmPoId(null)}
          poId={confirmPoId}
          onDone={() => { setTick(t => t + 1); setConfirmPoId(null); }}
        />
      )}
    </div>
  );
}

