import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, ExternalLink, Car, Lock } from "lucide-react";

const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0 }) + " ر.س";
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";

const STATUS_MAP: Record<string, { label: string; variant: any }> = {
  reserved: { label: "محجوز", variant: "default" },
  sold:     { label: "مباع",  variant: "secondary" },
};

interface Row {
  vehicle_id: string;
  vin: string | null;
  name: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  sale_price: number;
  status: string;
  qty_reserved: number;
  order_id: string | null;
  order_no: string | null;
  order_status: string | null;
  order_date: string | null;
  customer_name: string | null;
}

export default function Reservations() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("reserved");

  const load = async () => {
    setLoading(true);
    // 1) المركبات المحجوزة/المباعة فعلياً في المخزون
    const { data: items } = await supabase
      .from("inventory_items")
      .select("id, vin, name, brand, model, year, color, sale_price, status, qty_reserved")
      .in("status", ["reserved", "sold"]);

    const ids = (items ?? []).map((i: any) => i.id);
    // 2) ربط كل مركبة بأمر البيع الذي يحجزها
    const orderByVeh: Record<string, any> = {};
    if (ids.length) {
      const { data: soLines } = await supabase
        .from("sales_order_lines")
        .select("vehicle_id, order_id")
        .in("vehicle_id", ids);
      const orderIds = Array.from(new Set((soLines ?? []).map((l: any) => l.order_id).filter(Boolean)));
      const ordersById: Record<string, any> = {};
      if (orderIds.length) {
        const { data: orders } = await supabase
          .from("sales_orders")
          .select("id, order_no, status, order_date, created_at, customer_name, contact:contacts(name)")
          .in("id", orderIds);
        (orders ?? []).forEach((o: any) => { ordersById[o.id] = o; });
      }
      (soLines ?? []).forEach((l: any) => {
        if (l.vehicle_id && !orderByVeh[l.vehicle_id]) {
          const o = ordersById[l.order_id];
          if (o) orderByVeh[l.vehicle_id] = o;
        }
      });
    }

    const mapped: Row[] = (items ?? []).map((it: any) => {
      const o = orderByVeh[it.id];
      return {
        vehicle_id: it.id, vin: it.vin, name: it.name, brand: it.brand, model: it.model,
        year: it.year, color: it.color, sale_price: Number(it.sale_price ?? 0),
        status: it.status, qty_reserved: Number(it.qty_reserved ?? 0),
        order_id: o?.id ?? null, order_no: o?.order_no ?? null,
        order_status: o?.status ?? null,
        order_date: o?.order_date ?? o?.created_at ?? null,
        customer_name: o?.contact?.name ?? o?.customer_name ?? null,
      };
    });
    // المحجوز أولاً، ثم الأحدث
    mapped.sort((a, b) => (a.status === b.status ? 0 : a.status === "reserved" ? -1 : 1));
    setRows(mapped);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter(r => {
    const matchS = statusFilter === "all" || r.status === statusFilter;
    if (!matchS) return false;
    if (!q) return true;
    const hay = [r.vin, r.name, r.brand, r.model, r.customer_name, r.order_no].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  }), [rows, q, statusFilter]);

  const reservedCount = rows.filter(r => r.status === "reserved").length;
  const soldCount = rows.filter(r => r.status === "sold").length;
  const reservedValue = rows.filter(r => r.status === "reserved").reduce((s, r) => s + r.sale_price, 0);

  return (
    <div dir="rtl">
      <PageHeader
        title="إدارة الحجوزات"
        subtitle={
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>محجوز: <b className="text-foreground">{reservedCount}</b></span>
            <span>مباع (لم يُسلَّم): <b className="text-foreground">{soldCount}</b></span>
            <span>قيمة المحجوز: <b className="text-foreground">{fmtSAR(reservedValue)}</b></span>
          </div>
        }
      />

      <div className="flex gap-2 px-4 pb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pr-8" placeholder="بحث: VIN، مركبة، عميل، رقم أمر..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="h-9 px-3 border border-border rounded-md text-sm bg-background"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="reserved">المحجوز فقط</option>
          <option value="sold">المباع</option>
          <option value="all">الكل</option>
        </select>
      </div>

      <div className="px-4">
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-right px-3 py-2 font-medium">المركبة</th>
                <th className="text-right px-3 py-2 font-medium">VIN</th>
                <th className="text-right px-3 py-2 font-medium">العميل</th>
                <th className="text-right px-3 py-2 font-medium">أمر البيع</th>
                <th className="text-right px-3 py-2 font-medium">تاريخ الحجز</th>
                <th className="text-left px-3 py-2 font-medium">السعر</th>
                <th className="text-right px-3 py-2 font-medium">الحالة</th>
                <th className="text-right px-3 py-2 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">
                  <Lock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  لا توجد حجوزات. تُحجز المركبة تلقائياً عند تأكيد أمر البيع.
                </td></tr>
              ) : filtered.map(r => {
                const sm = STATUS_MAP[r.status] ?? { label: r.status, variant: "secondary" };
                return (
                  <tr key={r.vehicle_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <div className="font-medium">{[r.brand, r.model].filter(Boolean).join(" ") || r.name}</div>
                          <div className="text-[11.5px] text-muted-foreground">{[r.year, r.color].filter(Boolean).join(" · ")}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs" dir="ltr">{r.vin || "—"}</td>
                    <td className="px-3 py-2">{r.customer_name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2">
                      {r.order_no ? (
                        <button onClick={() => nav(`/sales-orders/${r.order_id}`)} className="text-primary hover:underline font-mono text-xs">
                          {r.order_no}
                        </button>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(r.order_date)}</td>
                    <td className="px-3 py-2 text-left num font-medium">{fmtSAR(r.sale_price)}</td>
                    <td className="px-3 py-2"><Badge variant={sm.variant}>{sm.label}</Badge></td>
                    <td className="px-3 py-2">
                      {r.order_id && (
                        <button onClick={() => nav(`/sales-orders/${r.order_id}`)} className="text-muted-foreground hover:text-primary" title="فتح أمر البيع">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-muted-foreground mt-2 px-1">
          الحجز يُنشأ تلقائياً عند تأكيد أمر البيع، ويستمر حتى السداد (يصبح "مباع") أو يُفرَج عنه بإلغاء الأمر / إشعار دائن.
          لإلغاء حجز، افتح أمر البيع المرتبط.
        </p>
      </div>
    </div>
  );
}
