import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Package, Landmark, ShoppingCart, TrendingUp, TrendingDown,
  AlertTriangle, BarChart3, FileText, RefreshCw, ArrowUpCircle,
  ArrowDownCircle, Boxes, Warehouse, ClipboardList
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────

interface InventoryStats {
  total_items: number;
  total_value: number;
  low_stock: number;
  out_of_stock: number;
  warehouses: number;
  top_items: Array<{ name: string; qty: number; value: number }>;
}

interface PurchasingStats {
  open_orders: number;
  open_value: number;
  pending_invoices: number;
  pending_amount: number;
  overdue_invoices: number;
  overdue_amount: number;
  recent_pos: Array<{ po_no: string; supplier_name: string; total_amount: number; status: string }>;
}

interface TreasuryStats {
  total_cash: number;
  total_bank: number;
  total_balance: number;
  receipts_today: number;
  payments_today: number;
  accounts: Array<{ name: string; account_type: string; current_balance: number }>;
}

// ─── Helpers ─────────────────────────────────────────────────

function fmtSAR(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}م ر.س`;
  if (n >= 1000)    return `${(n / 1000).toFixed(0)}K ر.س`;
  return `${n.toLocaleString("ar-SA")} ر.س`;
}

function KPICard({ label, value, sub, icon: Icon, color, alert }: {
  label: string; value: string; sub?: string;
  icon: any; color: string; alert?: boolean;
}) {
  const colors: Record<string, string> = {
    blue:   "bg-blue-50 border-blue-200 text-blue-700",
    green:  "bg-green-50 border-green-200 text-green-700",
    red:    "bg-red-50 border-red-200 text-red-700",
    amber:  "bg-amber-50 border-amber-200 text-amber-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    teal:   "bg-teal-50 border-teal-200 text-teal-700",
  };
  return (
    <div className={`relative border rounded-xl p-4 ${colors[color]}`}>
      {alert && <span className="absolute top-2 left-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-75">{label}</span>
        <Icon className="h-4 w-4 opacity-60" />
      </div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function ERPReports() {
  const [inv,  setInv]  = useState<InventoryStats | null>(null);
  const [pur,  setPur]  = useState<PurchasingStats | null>(null);
  const [tre,  setTre]  = useState<TreasuryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"inventory" | "purchasing" | "treasury">("inventory");

  const load = async () => {
    setLoading(true);
    try {
      await Promise.all([loadInventory(), loadPurchasing(), loadTreasury()]);
    } finally {
      setLoading(false);
    }
  };

  const loadInventory = async () => {
    const { data: items } = await supabase
      .from("inventory_items").select("name, qty_on_hand, avg_cost, reorder_point, status, warehouse_id");
    const { data: whs } = await supabase
      .from("warehouses").select("id").eq("active", true);

    const active = (items ?? []).filter(i => i.status === "active");
    const top = active
      .sort((a, b) => (b.qty_on_hand * b.avg_cost) - (a.qty_on_hand * a.avg_cost))
      .slice(0, 5)
      .map(i => ({ name: i.name, qty: i.qty_on_hand, value: i.qty_on_hand * i.avg_cost }));

    setInv({
      total_items:  active.length,
      total_value:  active.reduce((s, i) => s + i.qty_on_hand * i.avg_cost, 0),
      low_stock:    active.filter(i => i.qty_on_hand > 0 && i.qty_on_hand <= i.reorder_point).length,
      out_of_stock: active.filter(i => i.qty_on_hand <= 0).length,
      warehouses:   whs?.length ?? 0,
      top_items:    top,
    });
  };

  const loadPurchasing = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("po_no, supplier_name, total_amount, grand_total, status")
      .in("status", ["draft", "sent", "acknowledged", "partially_received"])
      .order("created_at", { ascending: false });

    const { data: invs } = await supabase
      .from("purchase_invoices")
      .select("total, paid_amount, due_date, status")
      .neq("status", "paid").neq("status", "cancelled");

    const pending = (invs ?? []).filter(i => i.status !== "paid");
    const overdue = pending.filter(i => i.due_date && i.due_date < today);
    const recentPOs = (pos ?? []).slice(0, 5).map(p => ({
      po_no: p.po_no, supplier_name: p.supplier_name ?? "—",
      total_amount: p.grand_total ?? p.total_amount ?? 0, status: p.status
    }));

    setPur({
      open_orders:      pos?.length ?? 0,
      open_value:       (pos ?? []).reduce((s, p) => s + (p.grand_total ?? p.total_amount ?? 0), 0),
      pending_invoices: pending.length,
      pending_amount:   pending.reduce((s, i) => s + i.total - i.paid_amount, 0),
      overdue_invoices: overdue.length,
      overdue_amount:   overdue.reduce((s, i) => s + i.total - i.paid_amount, 0),
      recent_pos:       recentPOs,
    });
  };

  const loadTreasury = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: accounts } = await supabase
      .from("treasury_accounts").select("name, account_type, current_balance").eq("active", true);
    const { data: todayTrx } = await supabase
      .from("treasury_transactions")
      .select("transaction_type, amount")
      .eq("transaction_date", today).eq("status", "posted");

    const accts = accounts ?? [];
    const trxs  = todayTrx ?? [];
    const cash = accts.filter(a => a.account_type !== "bank_account").reduce((s, a) => s + a.current_balance, 0);
    const bank = accts.filter(a => a.account_type === "bank_account").reduce((s, a) => s + a.current_balance, 0);

    setTre({
      total_cash:     cash,
      total_bank:     bank,
      total_balance:  cash + bank,
      receipts_today: trxs.filter(t => t.transaction_type === "receipt").reduce((s, t) => s + t.amount, 0),
      payments_today: trxs.filter(t => t.transaction_type === "payment").reduce((s, t) => s + t.amount, 0),
      accounts:       accts,
    });
  };

  useEffect(() => { load(); }, []);

  const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    draft:              { label: "مسودة",       color: "bg-gray-100 text-gray-700" },
    sent:               { label: "أُرسل",        color: "bg-blue-100 text-blue-700" },
    acknowledged:       { label: "مؤكد",         color: "bg-green-100 text-green-700" },
    partially_received: { label: "مستلم جزئياً", color: "bg-amber-100 text-amber-700" },
    received:           { label: "مستلم",        color: "bg-green-100 text-green-700" },
    cancelled:          { label: "ملغى",         color: "bg-red-100 text-red-700" },
  };

  const ACCT_LABEL: Record<string, string> = {
    cash_box: "صندوق", petty_cash: "عهدة", bank_account: "بنك"
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-600" /> تقارير ERP
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">مخزون • مشتريات • خزينة</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600 ml-2" />
          <span className="text-gray-500">جاري تحميل التقارير…</span>
        </div>
      ) : (
        <div className="p-6 space-y-6">

          {/* KPI Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPICard label="قيمة المخزون"      value={fmtSAR(inv?.total_value ?? 0)}    icon={Boxes}          color="blue"   />
            <KPICard label="أصناف منخفضة"      value={String(inv?.low_stock ?? 0)}       icon={AlertTriangle}  color="amber"  alert={(inv?.low_stock ?? 0) > 0} />
            <KPICard label="أوامر شراء مفتوحة"  value={String(pur?.open_orders ?? 0)}    icon={ShoppingCart}   color="purple" />
            <KPICard label="فواتير معلقة"       value={fmtSAR(pur?.pending_amount ?? 0)} icon={FileText}       color="red"    alert={(pur?.overdue_invoices ?? 0) > 0} />
            <KPICard label="الرصيد النقدي"      value={fmtSAR(tre?.total_cash ?? 0)}     icon={Landmark}       color="green"  />
            <KPICard label="أرصدة البنوك"       value={fmtSAR(tre?.total_bank ?? 0)}     icon={TrendingUp}     color="teal"   />
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="border-b border-gray-200">
              <nav className="flex">
                {[
                  { key: "inventory",  label: "📦 المخزون" },
                  { key: "purchasing", label: "🛒 المشتريات" },
                  { key: "treasury",   label: "🏦 الخزينة" },
                ].map(t => (
                  <button key={t.key}
                    onClick={() => setTab(t.key as typeof tab)}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                      tab === t.key
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >{t.label}</button>
                ))}
              </nav>
            </div>

            <div className="p-5">

              {/* ── Inventory Tab ── */}
              {tab === "inventory" && inv && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-700">{inv.total_items}</div>
                      <div className="text-xs text-blue-600">إجمالي الأصناف</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-700">{fmtSAR(inv.total_value)}</div>
                      <div className="text-xs text-green-600">قيمة المخزون</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-amber-700">{inv.low_stock}</div>
                      <div className="text-xs text-amber-600">مخزون منخفض</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-700">{inv.out_of_stock}</div>
                      <div className="text-xs text-red-600">نفد المخزون</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-purple-700">{inv.warehouses}</div>
                      <div className="text-xs text-purple-600">مستودعات نشطة</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <Warehouse className="h-4 w-4" /> أعلى 5 أصناف بالقيمة
                    </h3>
                    {inv.top_items.length === 0 ? (
                      <p className="text-center text-gray-400 py-6 text-sm">لا توجد أصناف</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b">
                            <th className="text-right pb-2">الصنف</th>
                            <th className="text-right pb-2">الكمية</th>
                            <th className="text-right pb-2">القيمة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.top_items.map((item, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="py-2 font-medium">{item.name}</td>
                              <td className="py-2 text-gray-600">{item.qty}</td>
                              <td className="py-2 text-green-700 font-semibold">{fmtSAR(item.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Link to="/inventory" className="text-xs text-blue-600 hover:underline">← لوحة المخزون</Link>
                    <Link to="/inventory/parts" className="text-xs text-blue-600 hover:underline">← قطع الغيار</Link>
                    <Link to="/inventory/movements" className="text-xs text-blue-600 hover:underline">← حركات المخزون</Link>
                  </div>
                </div>
              )}

              {/* ── Purchasing Tab ── */}
              {tab === "purchasing" && pur && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-purple-50 rounded-lg p-3">
                      <div className="text-xs text-purple-600 mb-1">أوامر شراء مفتوحة</div>
                      <div className="text-xl font-bold text-purple-700">{pur.open_orders}</div>
                      <div className="text-xs text-gray-500">{fmtSAR(pur.open_value)}</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                      <div className="text-xs text-amber-600 mb-1">فواتير معلقة</div>
                      <div className="text-xl font-bold text-amber-700">{pur.pending_invoices}</div>
                      <div className="text-xs text-gray-500">{fmtSAR(pur.pending_amount)}</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <div className="text-xs text-red-600 mb-1">فواتير متأخرة</div>
                      <div className="text-xl font-bold text-red-700">{pur.overdue_invoices}</div>
                      <div className="text-xs text-gray-500">{fmtSAR(pur.overdue_amount)}</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <ClipboardList className="h-4 w-4" /> آخر أوامر الشراء المفتوحة
                    </h3>
                    {pur.recent_pos.length === 0 ? (
                      <p className="text-center text-gray-400 py-6 text-sm">لا توجد أوامر مفتوحة</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b">
                            <th className="text-right pb-2">الرقم</th>
                            <th className="text-right pb-2">المورد</th>
                            <th className="text-right pb-2">الإجمالي</th>
                            <th className="text-right pb-2">الحالة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pur.recent_pos.map((po, i) => {
                            const s = STATUS_LABEL[po.status] ?? { label: po.status, color: "bg-gray-100 text-gray-700" };
                            return (
                              <tr key={i} className="border-b border-gray-50">
                                <td className="py-2 font-mono text-xs">
                                  <Link to={`/purchasing/orders`} className="text-blue-600 hover:underline">{po.po_no}</Link>
                                </td>
                                <td className="py-2 text-gray-700">{po.supplier_name}</td>
                                <td className="py-2 font-semibold">{fmtSAR(po.total_amount)}</td>
                                <td className="py-2">
                                  <span className={`px-2 py-0.5 rounded-full text-xs ${s.color}`}>{s.label}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Link to="/purchasing" className="text-xs text-blue-600 hover:underline">← لوحة المشتريات</Link>
                    <Link to="/purchasing/invoices" className="text-xs text-blue-600 hover:underline">← فواتير الشراء</Link>
                  </div>
                </div>
              )}

              {/* ── Treasury Tab ── */}
              {tab === "treasury" && tre && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="text-xs text-green-600 mb-1">إجمالي النقدية</div>
                      <div className="text-xl font-bold text-green-700">{fmtSAR(tre.total_cash)}</div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-xs text-blue-600 mb-1">أرصدة البنوك</div>
                      <div className="text-xl font-bold text-blue-700">{fmtSAR(tre.total_bank)}</div>
                    </div>
                    <div className="bg-teal-50 rounded-lg p-3">
                      <div className="text-xs text-teal-600 mb-1 flex items-center gap-1"><ArrowDownCircle className="h-3 w-3" /> قبض اليوم</div>
                      <div className="text-xl font-bold text-teal-700">{fmtSAR(tre.receipts_today)}</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <div className="text-xs text-red-600 mb-1 flex items-center gap-1"><ArrowUpCircle className="h-3 w-3" /> صرف اليوم</div>
                      <div className="text-xl font-bold text-red-700">{fmtSAR(tre.payments_today)}</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <Landmark className="h-4 w-4" /> أرصدة الحسابات
                    </h3>
                    {tre.accounts.length === 0 ? (
                      <p className="text-center text-gray-400 py-6 text-sm">لا توجد حسابات</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b">
                            <th className="text-right pb-2">الحساب</th>
                            <th className="text-right pb-2">النوع</th>
                            <th className="text-right pb-2">الرصيد</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tre.accounts.map((a, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="py-2 font-medium">{a.name}</td>
                              <td className="py-2 text-gray-500 text-xs">{ACCT_LABEL[a.account_type] ?? a.account_type}</td>
                              <td className={`py-2 font-semibold ${a.current_balance >= 0 ? "text-green-700" : "text-red-700"}`}>
                                {fmtSAR(a.current_balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">إجمالي الرصيد</span>
                    <span className="text-lg font-bold text-green-700">{fmtSAR(tre.total_balance)}</span>
                  </div>

                  <div className="flex gap-2">
                    <Link to="/treasury" className="text-xs text-blue-600 hover:underline">← لوحة الخزينة</Link>
                    <Link to="/treasury/accounts" className="text-xs text-blue-600 hover:underline">← إدارة الحسابات</Link>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
