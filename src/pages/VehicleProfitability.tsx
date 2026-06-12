/**
 * Vehicle Profitability — Per-VIN P&L dashboard.
 *
 * Computes per-vehicle revenue (from sales_order_lines on filtered orders),
 * net of credit notes, against landed cost (compute_vehicle_landed_cost RPC).
 *
 * Filters: date range (order_date), department (sales_orders.department_code),
 * VIN / code / brand / model search.
 */

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/erp/EmptyState";
import { fmtCompact, fmtSAR } from "@/lib/erpFormat";
import { supabase } from "@/integrations/supabase/client";
import { Car, Download, RefreshCw, Search, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type DeptCode = "vehicles" | "spare_parts" | "workshop" | "accounting" | "inventory" | "purchasing" | "sales" | "crm";

interface VehicleRow {
  id: string;
  code: string;
  name: string;
  brand: string;
  model: string;
  year: number;
  vin: string | null;
  status: string;
  revenue: number;
  credited: number;
  net_revenue: number;
  landed_cost: number;
  cogs_amount: number;
  cogs_je_no: string | null;
  cogs_status: "posted" | "missing_entry" | "inventory_not_reduced" | "cost_missing" | "n_a";
  has_invoice: boolean;
  profit: number;
  margin: number;
  acquired_at: string | null;
  sold_at: string | null;
  days_in_stock: number | null;
  cogs_posted: boolean;
  flags: string[];
}

const COGS_STATUS_LABEL: Record<VehicleRow["cogs_status"], string> = {
  posted:                 "✅ مرحّل",
  missing_entry:          "⚠ قيد COGS مفقود",
  inventory_not_reduced:  "⚠ المخزون لم يُخفَّض",
  cost_missing:           "⚠ مصدر التكلفة مفقود",
  n_a:                    "—",
};
const COGS_STATUS_TONE: Record<VehicleRow["cogs_status"], string> = {
  posted:                 "border-success/40 text-success bg-success/5",
  missing_entry:          "border-warning/40 text-warning bg-warning/5",
  inventory_not_reduced:  "border-destructive/40 text-destructive bg-destructive/5",
  cost_missing:           "border-destructive/40 text-destructive bg-destructive/5",
  n_a:                    "border-border text-muted-foreground",
};

type SortKey = "profit_desc" | "profit_asc" | "margin_desc" | "margin_asc" | "stock_desc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "profit_desc", label: "أعلى ربح" },
  { value: "profit_asc",  label: "أقل ربح" },
  { value: "margin_desc", label: "أعلى هامش %" },
  { value: "margin_asc",  label: "أقل هامش %" },
  { value: "stock_desc",  label: "أطول مدة في المخزون" },
];

const DEPT_OPTIONS: { value: DeptCode | "all"; label: string }[] = [
  { value: "all", label: "كل الأقسام" },
  { value: "vehicles", label: "إدارة المركبات" },
  { value: "sales", label: "المبيعات" },
  { value: "spare_parts", label: "قطع الغيار" },
  { value: "workshop", label: "الورشة" },
];

const today = new Date();
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const firstOfYear = new Date(today.getFullYear(), 0, 1);

const exportCsv = (rows: VehicleRow[]) => {
  const header = ["الكود","VIN","الماركة","الموديل","السنة","الحالة","تاريخ الاستلام","تاريخ البيع","أيام في المخزون","الإيراد","خصم/إرجاع","صافي الإيراد","التكلفة الكلية","تكلفة COGS","رقم قيد COGS","حالة COGS","صافي الربح","هامش %","ملاحظات الحوكمة"];
  const lines = rows.map(r => [
    r.code, r.vin ?? "", r.brand, r.model, r.year, r.status,
    r.acquired_at ?? "", r.sold_at ?? "", r.days_in_stock ?? "",
    r.revenue, r.credited, r.net_revenue, r.landed_cost,
    r.cogs_amount, r.cogs_je_no ?? "", COGS_STATUS_LABEL[r.cogs_status],
    r.profit, r.margin.toFixed(2),
    r.flags.join(" | "),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const blob = new Blob(["\ufeff" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `vehicle-profitability-${isoDate(today)}.csv`;
  a.click();
};

const Bar = ({ pct }: { pct: number }) => {
  const w = Math.min(100, Math.max(0, Math.abs(pct)));
  const cls = pct >= 15 ? "bg-success" : pct >= 0 ? "bg-warning" : "bg-destructive";
  return (
    <div className="h-1.5 bg-muted rounded overflow-hidden w-20">
      <div className={`h-full ${cls}`} style={{ width: `${w}%` }} />
    </div>
  );
};

export default function VehicleProfitability() {
  const [from, setFrom] = useState(isoDate(firstOfYear));
  const [to, setTo] = useState(isoDate(today));
  const [dept, setDept] = useState<DeptCode | "all">("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "sold" | "available">("all");
  const [sortKey, setSortKey] = useState<SortKey>("profit_desc");

  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1) sales_order_lines (with order context) for revenue
      const sol = supabase
        .from("sales_order_lines")
        .select("vehicle_id, line_total, order:sales_orders!inner(order_date, department_code, status)")
        .not("vehicle_id", "is", null)
        .gte("order.order_date", from)
        .lte("order.order_date", to);
      if (dept !== "all") sol.eq("order.department_code", dept);

      // 2) credit_note_lines for refund/return offsets
      const cnl = supabase
        .from("credit_note_lines")
        .select("vehicle_id, line_total, credit_note:credit_notes!inner(cn_date, status)")
        .not("vehicle_id", "is", null)
        .gte("credit_note.cn_date", from)
        .lte("credit_note.cn_date", to);

      // 3) vehicles for lookup — use authoritative stored acquired_at / sold_at
      let vq = supabase.from("vehicles").select("id, code, name, brand, model, year, vin, status, acquired_at, sold_at, created_at").limit(500);
      if (statusFilter !== "all") vq = vq.eq("status", statusFilter as any);
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        vq = vq.or(`vin.ilike.${s},code.ilike.${s},brand.ilike.${s},model.ilike.${s},name.ilike.${s}`);
      }

      const [solRes, cnlRes, vRes] = await Promise.all([sol, cnl, vq]);
      if (solRes.error) throw solRes.error;
      if (cnlRes.error) throw cnlRes.error;
      if (vRes.error) throw vRes.error;

      const revMap = new Map<string, number>();
      for (const r of solRes.data ?? []) {
        const id = (r as any).vehicle_id as string;
        revMap.set(id, (revMap.get(id) ?? 0) + Number((r as any).line_total || 0));
      }
      const crMap = new Map<string, number>();
      for (const r of cnlRes.data ?? []) {
        const id = (r as any).vehicle_id as string;
        crMap.set(id, (crMap.get(id) ?? 0) + Number((r as any).line_total || 0));
      }

      const vehicles = (vRes.data ?? []).filter(v =>
        revMap.has(v.id) || crMap.has(v.id) || (dept === "all" && !search && statusFilter === "all")
      );

      // 4) landed cost + COGS posted + COGS JE id + invoice existence, in parallel
      const enriched = await Promise.all(
        vehicles.map(async v => {
          const [{ data: cd }, { data: inv }] = await Promise.all([
            supabase.rpc("compute_vehicle_landed_cost" as any, { p_vehicle_id: v.id }),
            supabase
              .from("sales_order_lines")
              .select("order:sales_orders(invoices(status, cogs_journal_entry_id))")
              .eq("vehicle_id", v.id)
              .limit(20),
          ]);
          const row = Array.isArray(cd) ? cd[0] : cd;
          let cogs_posted = false;
          let cogs_je_id: string | null = null;
          let has_invoice = false;
          for (const l of (inv ?? []) as any[]) {
            for (const i of l.order?.invoices ?? []) {
              if (i?.status && i.status !== "draft" && i.status !== "cancelled") has_invoice = true;
              if (i?.cogs_journal_entry_id) {
                cogs_posted = true;
                if (!cogs_je_id) cogs_je_id = i.cogs_journal_entry_id;
              }
            }
          }
          return {
            id: v.id,
            landed: Number((row as any)?.landed_cost || 0),
            cogs_posted, cogs_je_id, has_invoice,
          };
        }),
      );
      const enrichMap = new Map(enriched.map(e => [e.id, e]));

      // 5) batch-resolve COGS journal entry numbers
      const jeIds = Array.from(new Set(enriched.map(e => e.cogs_je_id).filter(Boolean) as string[]));
      const jeMap = new Map<string, string>();
      if (jeIds.length > 0) {
        const { data: jes } = await supabase
          .from("journal_entries")
          .select("id, entry_no")
          .in("id", jeIds);
        for (const j of jes ?? []) jeMap.set((j as any).id, (j as any).entry_no);
      }

      const todayIso = isoDate(new Date());
      const result: VehicleRow[] = vehicles.map(v => {
        const e = enrichMap.get(v.id)!;
        const revenue = revMap.get(v.id) ?? 0;
        const credited = crMap.get(v.id) ?? 0;
        const net_revenue = revenue - credited;
        const landed_cost = e.landed;
        const profit = net_revenue - landed_cost;
        const margin = net_revenue > 0 ? (profit / net_revenue) * 100 : 0;
        const acquired_raw = (v as any).acquired_at ?? (v as any).created_at;
        const acquired_at = acquired_raw ? String(acquired_raw).slice(0, 10) : null;
        const sold_raw = (v as any).sold_at;
        const sold_at = sold_raw ? String(sold_raw).slice(0, 10) : null;
        const endIso = sold_at ?? todayIso;
        const days_in_stock = acquired_at
          ? Math.max(0, Math.floor((+new Date(endIso) - +new Date(acquired_at)) / 86400000))
          : null;

        // COGS detailed status (ordered by severity)
        const cogs_status: VehicleRow["cogs_status"] = e.cogs_posted
          ? "posted"
          : landed_cost === 0
          ? "cost_missing"
          : v.status === "sold" && e.has_invoice
          ? "inventory_not_reduced"
          : e.has_invoice
          ? "missing_entry"
          : "n_a";
        const cogs_amount = e.cogs_posted ? landed_cost : 0;
        const cogs_je_no = e.cogs_je_id ? (jeMap.get(e.cogs_je_id) ?? null) : null;

        const flags: string[] = [];
        if (profit < 0) flags.push("ربح سالب");
        if (landed_cost === 0) flags.push("تكلفة مفقودة");
        if (v.status === "sold" && revenue === 0) flags.push("إيراد مفقود");
        if (e.has_invoice && !e.cogs_posted) flags.push("قيد COGS مفقود");
        if (v.status === "sold" && !e.cogs_posted) flags.push("المخزون لم يُخفَّض");
        if (v.status === "sold" && !sold_at) flags.push("تاريخ بيع مفقود");
        if (!acquired_at) flags.push("تاريخ دخول مخزون مفقود");
        return {
          id: v.id, code: v.code, name: v.name, brand: v.brand, model: v.model, year: v.year, vin: v.vin, status: v.status,
          revenue, credited, net_revenue,
          landed_cost, cogs_amount, cogs_je_no, cogs_status, has_invoice: e.has_invoice,
          profit, margin,
          acquired_at, sold_at, days_in_stock, cogs_posted: e.cogs_posted, flags,
        };
      });

      setRows(result);
    } catch (e: any) {
      toast({ title: "تعذّر تحميل البيانات", description: e?.message ?? "خطأ غير معروف", variant: "destructive" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    switch (sortKey) {
      case "profit_desc": arr.sort((a, b) => b.profit - a.profit); break;
      case "profit_asc":  arr.sort((a, b) => a.profit - b.profit); break;
      case "margin_desc": arr.sort((a, b) => b.margin - a.margin); break;
      case "margin_asc":  arr.sort((a, b) => a.margin - b.margin); break;
      case "stock_desc":  arr.sort((a, b) => (b.days_in_stock ?? 0) - (a.days_in_stock ?? 0)); break;
    }
    return arr;
  }, [rows, sortKey]);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    revenue: a.revenue + r.net_revenue,
    cost: a.cost + r.landed_cost,
    profit: a.profit + r.profit,
    units: a.units + (r.net_revenue > 0 ? 1 : 0),
    flagged: a.flagged + (r.flags.length > 0 ? 1 : 0),
  }), { revenue: 0, cost: 0, profit: 0, units: 0, flagged: 0 }), [rows]);
  const totalMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  return (
    <div dir="rtl">
      <PageHeader
        title="ربحية المركبات"
        subtitle="تحليل الربح والخسارة لكل مركبة (Per-VIN P&L)"
        sticky
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ml-1 ${loading ? "animate-spin" : ""}`} />
              تحديث
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportCsv(sortedRows)} disabled={!rows.length}>
              <Download className="h-3.5 w-3.5 ml-1" /> CSV
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="bg-card border rounded-md p-3 mb-3 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">القسم</Label>
          <Select value={dept} onValueChange={(v) => setDept(v as DeptCode | "all")}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEPT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الحالة</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="sold">مباعة</SelectItem>
              <SelectItem value="available">متوفّرة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">بحث (VIN / كود / ماركة / موديل)</Label>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fetchData()}
              placeholder="مثل: JHD65378 أو VH-2026"
              className="h-8 pr-7"
            />
          </div>
        </div>
        <div className="md:col-span-4 flex items-end gap-2">
          <div className="space-y-1 flex-1 max-w-xs">
            <Label className="text-xs">الترتيب</Label>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="md:col-span-2 flex items-end justify-end">
          <Button size="sm" onClick={fetchData} disabled={loading}>تطبيق الفلاتر</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
        <KPI label="عدد المركبات" value={String(totals.units)} />
        <KPI label="صافي الإيراد" value={fmtCompact(totals.revenue)} tone="good" />
        <KPI label="إجمالي التكلفة" value={fmtCompact(totals.cost)} />
        <KPI label="صافي الربح" value={fmtCompact(totals.profit)} tone={totals.profit >= 0 ? "good" : "bad"} />
        <KPI label={`متوسط الهامش (${totalMargin.toFixed(1)}%)`} value={`${totalMargin.toFixed(1)}%`} tone={totalMargin >= 0 ? "good" : "bad"} />
        <KPI label="مركبات بمؤشرات حوكمة" value={String(totals.flagged)} tone={totals.flagged > 0 ? "bad" : "good"} />
      </div>

      {/* Table */}
      <div className="bg-card border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="text-right p-2">المركبة</th>
              <th className="text-right p-2">VIN</th>
              <th className="text-right p-2">الحالة</th>
              <th className="text-right p-2">أيام في المخزون</th>
              <th className="text-left p-2">صافي الإيراد</th>
              <th className="text-left p-2">التكلفة الكلية</th>
              <th className="text-right p-2">COGS</th>
              <th className="text-left p-2">صافي الربح</th>
              <th className="text-right p-2 w-32">الهامش</th>
              <th className="text-right p-2">الحوكمة</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>
            ) : !sortedRows.length ? (
              <EmptyState inTable colSpan={10} icon={<Car className="h-7 w-7" />} title="لا توجد بيانات" description="لا توجد مركبات تطابق الفلاتر المختارة." />
            ) : sortedRows.map(r => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="p-2">
                  <div className="font-medium">{r.brand} {r.model} {r.year}</div>
                  <div className="text-[11.5px] text-muted-foreground font-mono">{r.code}</div>
                </td>
                <td className="p-2 font-mono text-xs">{r.vin || <span className="text-muted-foreground">—</span>}</td>
                <td className="p-2">
                  <Badge variant={r.status === "sold" ? "default" : "secondary"} className="text-[11.5px]">
                    {r.status === "sold" ? "مباعة" : r.status === "available" ? "متوفّرة" : r.status}
                  </Badge>
                </td>
                <td className="p-2 text-right tabular-nums text-xs">
                  {r.days_in_stock !== null ? `${r.days_in_stock} يوم` : "—"}
                  {r.sold_at && <div className="text-[11.5px] text-muted-foreground">بيع: {r.sold_at}</div>}
                </td>
                <td className="p-2 text-left tabular-nums">
                  {fmtSAR(r.net_revenue)}
                  {r.credited > 0 && (
                    <div className="text-[11.5px] text-destructive">−{fmtSAR(r.credited)} مرتجع</div>
                  )}
                </td>
                <td className="p-2 text-left tabular-nums text-muted-foreground">{fmtSAR(r.landed_cost)}</td>
                <td className="p-2">
                  <div className="flex flex-col items-end gap-0.5">
                    <Badge variant="outline" className={`text-[11.5px] ${COGS_STATUS_TONE[r.cogs_status]}`}>
                      {COGS_STATUS_LABEL[r.cogs_status]}
                    </Badge>
                    <div className="text-[11.5px] tabular-nums text-muted-foreground">
                      {r.cogs_posted ? fmtSAR(r.cogs_amount) : "—"}
                    </div>
                    {r.cogs_je_no && (
                      <div className="text-[11.5px] font-mono text-muted-foreground">{r.cogs_je_no}</div>
                    )}
                  </div>
                </td>
                <td className={`p-2 text-left tabular-nums font-semibold ${r.profit >= 0 ? "text-success" : "text-destructive"}`}>
                  {fmtSAR(r.profit)}
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2 justify-end">
                    <Bar pct={r.margin} />
                    <span className={`text-xs tabular-nums ${r.margin >= 0 ? "" : "text-destructive"}`}>{r.margin.toFixed(1)}%</span>
                    {r.margin >= 0
                      ? <TrendingUp className="h-3 w-3 text-success" />
                      : <TrendingDown className="h-3 w-3 text-destructive" />}
                  </div>
                </td>
                <td className="p-2">
                  {r.flags.length === 0 ? (
                    <Badge variant="outline" className="text-[11.5px] border-success/40 text-success">سليم</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1 justify-end max-w-[180px]">
                      {r.flags.map((f, i) => (
                        <Badge key={i} variant="outline" className="text-[11.5px] border-destructive/40 text-destructive bg-destructive/5">{f}</Badge>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "border-success/40 bg-success/5" : tone === "bad" ? "border-destructive/40 bg-destructive/5" : "border-border";
  return (
    <div className={`bg-card border rounded-md p-3 ${cls}`}>
      <div className="text-[12px] text-muted-foreground font-medium">{label}</div>
      <div className="text-lg font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
