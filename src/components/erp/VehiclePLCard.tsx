/**
 * Vehicle P&L Card — embedded in Vehicle Detail page.
 *
 * Per-vehicle profitability + accounting integrity:
 *  Purchase Cost, Additional Costs, Landed Cost, Revenue, Discounts,
 *  Credit Notes, COGS Amount, Gross Profit, Net Profit,
 *  Inventory Status, COGS Status (with JE number), Days In Stock,
 *  and governance flags (negative profit, missing cost, missing revenue,
 *  missing COGS entry, inventory not reduced, cost source missing).
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fmtSAR } from "@/lib/erpFormat";
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, Wallet, Calendar, FileText } from "lucide-react";

interface Props { vehicleId: string; status: string; acquiredAt?: string | null; soldAt?: string | null; }

interface PL {
  purchase_cost: number;
  additional_costs: number;
  landed_cost: number;
  revenue: number;
  discounts: number;
  credit_notes: number;
  cogs_amount: number;
  gross_profit: number;
  net_profit: number;
  cogs_posted: boolean;
  has_invoice: boolean;
  cogs_je_no: string | null;
  inventory_reconciled: boolean;
  sold_at: string | null;
}

const daysBetween = (a: string, b: string) => Math.max(0, Math.floor((+new Date(b) - +new Date(a)) / 86400000));

export function VehiclePLCard({ vehicleId, status, acquiredAt, soldAt }: Props) {
  const [pl, setPl] = useState<PL | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [costRes, solRes, cnRes] = await Promise.all([
          supabase.rpc("compute_vehicle_landed_cost" as any, { p_vehicle_id: vehicleId }),
          supabase
            .from("sales_order_lines")
            .select("quantity, unit_price, discount_pct, line_total, order:sales_orders(id, status, order_date, invoices(id, status, cogs_journal_entry_id, invoice_date))")
            .eq("vehicle_id", vehicleId),
          supabase
            .from("credit_note_lines")
            .select("line_total, credit_note:credit_notes(status, cn_date)")
            .eq("vehicle_id", vehicleId),
        ]);
        const costRow = Array.isArray(costRes.data) ? costRes.data[0] : (costRes.data as any);
        const purchase_cost = Number(costRow?.purchase_cost || 0);
        const additional_costs = Number(costRow?.additional_costs || 0);
        const landed_cost = Number(costRow?.landed_cost || 0);

        let revenue = 0, discounts = 0, cogs_posted = false, derived_sold_at: string | null = null;
        let has_invoice = false;
        const cogs_je_ids: string[] = [];
        for (const l of (solRes.data ?? []) as any[]) {
          const o = l.order; if (!o || o.status === "cancelled") continue;
          const q = Number(l.quantity || 0), p = Number(l.unit_price || 0), d = Number(l.discount_pct || 0);
          revenue += Number(l.line_total || 0);
          discounts += q * p * (d / 100);
          const invs = o.invoices ?? [];
          for (const inv of invs) {
            if (inv && inv.status && inv.status !== "draft" && inv.status !== "cancelled") {
              has_invoice = true;
            }
            if (inv?.cogs_journal_entry_id) {
              cogs_posted = true;
              cogs_je_ids.push(inv.cogs_journal_entry_id);
            }
            if (inv?.invoice_date && (!derived_sold_at || inv.invoice_date < derived_sold_at)) derived_sold_at = inv.invoice_date;
          }
          if (!derived_sold_at && o.order_date && (o.status === "invoiced" || o.status === "confirmed")) derived_sold_at = o.order_date;
        }

        // Resolve COGS JE number (first one if multiple)
        let cogs_je_no: string | null = null;
        if (cogs_je_ids.length > 0) {
          const { data: jes } = await supabase
            .from("journal_entries")
            .select("id, entry_no")
            .in("id", cogs_je_ids)
            .limit(1);
          cogs_je_no = jes?.[0]?.entry_no ?? null;
        }

        let credit_notes = 0;
        for (const c of (cnRes.data ?? []) as any[]) {
          if (c.credit_note?.status !== "cancelled") credit_notes += Number(c.line_total || 0);
        }
        const cogs_amount = cogs_posted ? landed_cost : 0;
        const net_revenue = revenue - credit_notes;
        const gross_profit = revenue - landed_cost;
        const net_profit = net_revenue - landed_cost;
        const sold_at = soldAt ?? derived_sold_at;
        const inventory_reconciled = status !== "sold" || sold_at !== null;
        setPl({
          purchase_cost, additional_costs, landed_cost,
          revenue, discounts, credit_notes, cogs_amount,
          gross_profit, net_profit,
          cogs_posted, has_invoice, cogs_je_no,
          inventory_reconciled, sold_at,
        });
      } finally { setLoading(false); }
    })();
  }, [vehicleId, status, soldAt]);

  if (loading || !pl) {
    return <Card className="p-4 text-xs text-muted-foreground">جارٍ حساب الربحية…</Card>;
  }

  const endDate = pl.sold_at ?? new Date().toISOString().slice(0, 10);
  const daysInStock = acquiredAt ? daysBetween(acquiredAt, endDate) : null;

  // COGS detailed status (mutually exclusive, ordered by severity)
  const cogsStatus: { tone: "success" | "warning" | "destructive"; label: string } =
    pl.cogs_posted
      ? { tone: "success",     label: "✅ مرحّل" }
      : pl.landed_cost === 0
      ? { tone: "destructive", label: "⚠ مصدر التكلفة مفقود" }
      : status === "sold" && pl.has_invoice
      ? { tone: "destructive", label: "⚠ المخزون لم يُخفَّض" }
      : pl.has_invoice
      ? { tone: "warning",     label: "⚠ قيد COGS مفقود" }
      : { tone: "warning",     label: "—" };

  // Governance flags — pre-sale vehicles only carry cost/inventory presence checks.
  // Revenue / COGS / profitability indicators only apply after a sales document exists.
  const isSold = status === "sold";
  const hasSalesActivity = isSold || pl.has_invoice || pl.revenue > 0;

  const flags: { ok: boolean; label: string }[] = hasSalesActivity
    ? [
        { ok: pl.net_profit >= 0, label: pl.net_profit >= 0 ? "ربحية موجبة" : "ربحية سالبة" },
        { ok: pl.landed_cost > 0, label: "التكلفة مسجّلة" },
        { ok: pl.revenue > 0, label: "الإيراد مسجّل" },
        { ok: !pl.has_invoice || pl.cogs_posted, label: "قيد COGS مرحّل" },
        { ok: !isSold || pl.cogs_posted, label: "المخزون مُخفَّض" },
        { ok: pl.inventory_reconciled, label: "مطابقة المخزون" },
      ]
    : [
        { ok: pl.landed_cost > 0, label: "التكلفة مسجّلة" },
        { ok: true, label: "لم تُبع بعد — الربحية قيد الانتظار" },
      ];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> الربح والخسارة (P&L)
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          {hasSalesActivity ? (
            <>
              {pl.net_profit >= 0
                ? <TrendingUp className="h-3.5 w-3.5 text-success" />
                : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
              <span className={`font-semibold tabular-nums ${pl.net_profit >= 0 ? "text-success" : "text-destructive"}`}>
                {fmtSAR(pl.net_profit)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">لم تُبع بعد</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <Cell label="تكلفة الشراء" value={fmtSAR(pl.purchase_cost)} muted={pl.purchase_cost === 0} />
        <Cell label="تكاليف إضافية" value={fmtSAR(pl.additional_costs)} />
        <Cell label="التكلفة الكلية (Landed)" value={fmtSAR(pl.landed_cost)} accent />
        <Cell label="الإيراد" value={fmtSAR(pl.revenue)} muted={pl.revenue === 0} />
        <Cell label="الخصومات" value={fmtSAR(pl.discounts)} />
        <Cell label="الإشعارات الدائنة" value={fmtSAR(pl.credit_notes)} danger={pl.credit_notes > 0} />
        <Cell
          label="تكلفة البضاعة المباعة (COGS)"
          value={pl.cogs_posted ? fmtSAR(pl.cogs_amount) : "غير مرحّل"}
          tone={pl.cogs_posted ? undefined : "destructive"}
          muted={!pl.cogs_posted}
        />
        <Cell label="مجمل الربح" value={fmtSAR(pl.gross_profit)} tone={pl.gross_profit >= 0 ? "success" : "destructive"} />
        <Cell label="صافي الربح" value={fmtSAR(pl.net_profit)} tone={pl.net_profit >= 0 ? "success" : "destructive"} accent />
      </div>

      <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">حالة المخزون:</span>
          <Badge variant={status === "sold" ? "default" : "secondary"} className="text-[10px]">
            {status === "sold" ? "مباعة" : status === "available" ? "متوفّرة" : status === "reserved" ? "محجوزة" : status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">حالة COGS:</span>
          <Badge
            variant="outline"
            className={`text-[10px] ${
              cogsStatus.tone === "success"
                ? "border-success/40 text-success bg-success/5"
                : cogsStatus.tone === "warning"
                ? "border-warning/40 text-warning bg-warning/5"
                : "border-destructive/40 text-destructive bg-destructive/5"
            }`}
          >
            {cogsStatus.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <FileText className="h-3 w-3" /> قيد COGS:
          </span>
          <span className="font-mono font-medium">{pl.cogs_je_no ?? "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" /> أيام في المخزون:
          </span>
          <span className="font-medium tabular-nums">{daysInStock !== null ? `${daysInStock} يوم` : "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">تاريخ البيع:</span>
          <span className="font-medium">{pl.sold_at ?? "—"}</span>
        </div>
      </div>

      {/* Governance indicators */}
      <div className="mt-3 pt-3 border-t border-border">
        <div className="text-xs font-semibold text-muted-foreground mb-2">مؤشرات الحوكمة</div>
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f, i) => (
            <Badge
              key={i}
              variant="outline"
              className={`text-[10px] ${f.ok ? "border-success/40 text-success bg-success/5" : "border-destructive/40 text-destructive bg-destructive/5"}`}
            >
              {f.ok ? <CheckCircle2 className="h-3 w-3 ml-1" /> : <AlertTriangle className="h-3 w-3 ml-1" />}
              {f.label}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Cell({ label, value, accent, muted, danger, tone, icon }:
  { label: string; value: string; accent?: boolean; muted?: boolean; danger?: boolean; tone?: "success" | "destructive"; icon?: React.ReactNode }) {
  const colorCls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : danger ? "text-destructive" : muted ? "text-muted-foreground" : "";
  return (
    <div className={`rounded-md border p-2 ${accent ? "border-primary/40 bg-primary/5" : "border-border"}`}>
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`text-sm font-semibold tabular-nums mt-0.5 ${colorCls}`}>{value}</div>
    </div>
  );
}
