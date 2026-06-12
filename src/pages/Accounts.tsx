import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/erp/EmptyState";
import { AccountDialog } from "@/components/erp/AccountDialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown, ChevronLeft, RotateCw, Search, FileSpreadsheet, Plus, MoreHorizontal,
  Wallet, Scale, Crown, TrendingUp, TrendingDown, FolderTree, FileText,
  Pencil, Archive, ArchiveRestore, Receipt, Building2, Calendar,
} from "lucide-react";
import { accounting, type AccountNode, type AccountRow } from "@/services/erp/accounting";
import { supabase } from "@/integrations/supabase/client";
import { accountOverlay, type AccountTypeKey, type AccountStats } from "@/lib/accountOverlay";
import { fmtSAR, accountTypeLabel, accountTypeColor, todayIso } from "@/lib/erpFormat";
import { toast } from "sonner";

const typeIcon: Record<AccountTypeKey, typeof Wallet> = {
  asset: Wallet, liability: Scale, equity: Crown, revenue: TrendingUp, expense: TrendingDown,
};

const typeAccent: Record<AccountTypeKey, string> = {
  asset: "border-r-blue-500",
  liability: "border-r-amber-500",
  equity: "border-r-purple-500",
  revenue: "border-r-emerald-500",
  expense: "border-r-rose-500",
};

function exportCsv(rows: AccountNode[]) {
  const flat: AccountNode[] = [];
  const walk = (n: AccountNode) => { flat.push(n); n.children.forEach(walk); };
  rows.forEach(walk);
  const head = ["الكود", "الاسم", "النوع", "ترحيل", "نشط", "مدين", "دائن", "الرصيد", "الرصيد التجميعي"];
  const lines = flat.map(n => [n.code, n.name_ar, accountTypeLabel[n.type], n.is_posting ? "نعم" : "لا",
    n.is_active ? "نعم" : "لا",
    n.debit.toFixed(2), n.credit.toFixed(2), n.balance.toFixed(2), n.rollup.toFixed(2)].join(","));
  const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `chart-of-accounts-${todayIso()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

interface RowProps {
  node: AccountNode;
  expanded: Set<string>;
  toggle: (c: string) => void;
  query: string;
  typeFilter: AccountTypeKey | "all";
  hideZero: boolean;
  hideInactive: boolean;
  stats: Map<string, AccountStats>;
  metaById: Map<string, any>;
  onAddChild: (parent: AccountNode) => void;
  onEdit: (n: AccountNode) => void;
  onArchive: (n: AccountNode) => void;
}

function NodeRow(p: RowProps) {
  const {
    node, expanded, toggle, query, typeFilter, hideZero, hideInactive, stats, metaById,
    onAddChild, onEdit, onArchive,
  } = p;
  const isOpen = expanded.has(node.code);
  const hasChildren = node.children.length > 0;
  const TypeIcon = typeIcon[node.type];
  const meta = metaById.get(node.id) ?? {};
  const st = stats.get(node.id);

  // matching logic
  const matches = !query || node.code.includes(query) || node.name_ar.includes(query) || (node.name_en ?? "").toLowerCase().includes(query.toLowerCase());
  const typeOk = typeFilter === "all" || node.type === typeFilter;
  const zeroOk = !hideZero || Math.abs(node.rollup) > 0.005;
  const inactiveOk = !hideInactive || node.is_active;
  const childMatches = (n: AccountNode): boolean => {
    const m = (!query || n.code.includes(query) || n.name_ar.includes(query))
      && (typeFilter === "all" || n.type === typeFilter)
      && (!hideZero || Math.abs(n.rollup) > 0.005)
      && (!hideInactive || n.is_active);
    return m || n.children.some(childMatches);
  };
  const selfHidden = !(matches && typeOk && zeroOk && inactiveOk);
  if (selfHidden && !node.children.some(childMatches)) return null;

  return (
    <>
      {!selfHidden && (
        <tr className={`hover:bg-muted/40 group ${node.depth === 0 ? "bg-muted/30" : ""} ${!node.is_active ? "opacity-60" : ""}`}>
          {/* hierarchy column */}
          <td className="py-1 align-middle">
            <div className="flex items-stretch">
              {/* indent guides */}
              {Array.from({ length: node.depth }).map((_, i) => (
                <span key={i} className="w-4 border-l border-dashed border-border/60 inline-block" />
              ))}
              {/* twisty */}
              <div className="flex items-center gap-1 pr-1">
                {hasChildren ? (
                  <button
                    onClick={() => toggle(node.code)}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted"
                    aria-label={isOpen ? "طي" : "توسيع"}
                  >
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                  </button>
                ) : <span className="w-4 inline-block" />}
                {hasChildren
                  ? <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
                  : <FileText className="h-3.5 w-3.5 text-muted-foreground/70" />}
                <Link to={`/accounts/${node.id}`} className={`font-mono text-xs hover:text-primary ${node.depth === 0 ? "font-bold" : node.is_posting ? "" : "font-semibold"}`}>
                  {node.code}
                </Link>
              </div>
            </div>
          </td>

          {/* name + accent */}
          <td className={`border-r-2 ${typeAccent[node.type]}`}>
            <div className="flex items-center gap-2 pr-2">
              <TypeIcon className={`h-3.5 w-3.5 ${node.type === "asset" ? "text-blue-600" :
                node.type === "liability" ? "text-amber-600" :
                node.type === "equity" ? "text-purple-600" :
                node.type === "revenue" ? "text-emerald-600" : "text-rose-600"}`} />
              <Link to={`/accounts/${node.id}`} className={`hover:text-primary ${node.depth === 0 ? "font-bold" : node.is_posting ? "" : "font-semibold"}`}>
                {node.name_ar}
              </Link>
              {node.name_en && <span className="text-[11.5px] text-muted-foreground" dir="ltr">{node.name_en}</span>}
              {/* meta chips */}
              {meta.vat_applicable && <Badge variant="outline" className="text-[12px] px-1 py-0 h-4 border-amber-300 text-amber-700">VAT</Badge>}
              {meta.cost_center_applicable && <Badge variant="outline" className="text-[12px] px-1 py-0 h-4 border-purple-300 text-purple-700">CC</Badge>}
            </div>
          </td>

          {/* type badge */}
          <td>
            <span className={`text-[11.5px] px-1.5 py-0.5 rounded border ${accountTypeColor[node.type]}`}>
              {accountTypeLabel[node.type]}
            </span>
          </td>

          {/* posting */}
          <td>
            {node.is_posting
              ? <Badge variant="outline" className="text-[11.5px] h-5 border-emerald-300 text-emerald-700 bg-emerald-500/5">ترحيل</Badge>
              : <Badge variant="outline" className="text-[11.5px] h-5 border-slate-300 text-slate-600 bg-muted/40">رئيسي</Badge>}
          </td>

          {/* active */}
          <td>
            {node.is_active
              ? <span className="text-success text-xs">●</span>
              : <Badge variant="secondary" className="text-[11.5px]">مؤرشف</Badge>}
          </td>

          {/* tx count */}
          <td className="text-center text-xs">
            {st?.tx_count ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Receipt className="h-3 w-3" />{st.tx_count}</span>
            ) : <span className="text-muted-foreground/40">—</span>}
          </td>

          {/* last movement */}
          <td className="text-xs text-muted-foreground">
            {st?.last_movement ? (
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{st.last_movement}</span>
            ) : "—"}
          </td>

          {/* amounts */}
          <td className="num text-right text-xs">{node.debit ? fmtSAR(node.debit) : <span className="text-muted-foreground/40">—</span>}</td>
          <td className="num text-right text-xs">{node.credit ? fmtSAR(node.credit) : <span className="text-muted-foreground/40">—</span>}</td>
          <td className={`num text-right font-semibold ${node.rollup < 0 ? "text-destructive" : node.rollup > 0 ? "" : "text-muted-foreground/50"}`}>
            {fmtSAR(node.rollup)}
          </td>

          {/* actions */}
          <td className="w-8">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onAddChild(node)}>
                  <Plus className="h-3.5 w-3.5 ml-2" /> إضافة حساب فرعي
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(node)}>
                  <Pencil className="h-3.5 w-3.5 ml-2" /> تعديل
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={`/accounts/${node.id}`}>
                    <FileText className="h-3.5 w-3.5 ml-2" /> فتح كشف الحساب
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onArchive(node)} className="text-destructive">
                  {node.is_active
                    ? <><Archive className="h-3.5 w-3.5 ml-2" /> أرشفة</>
                    : <><ArchiveRestore className="h-3.5 w-3.5 ml-2" /> استعادة</>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
      )}
      {(isOpen || query || typeFilter !== "all") && node.children.map(c => (
        <NodeRow {...p} key={c.id} node={c} />
      ))}
    </>
  );
}

export default function Accounts() {
  const [roots, setRoots] = useState<AccountNode[]>([]);
  const [accountsFlat, setAccountsFlat] = useState<(AccountRow & { meta?: any })[]>([]);
  const [stats, setStats] = useState<Map<string, AccountStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [asOf, setAsOf] = useState(todayIso());
  const [typeFilter, setTypeFilter] = useState<AccountTypeKey | "all">("all");
  const [hideZero, setHideZero] = useState(false);
  const [hideInactive, setHideInactive] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogTarget, setDialogTarget] = useState<AccountRow | undefined>();
  const [dialogParent, setDialogParent] = useState<AccountRow | undefined>();

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      accounting.chartTree(asOf),
      accounting.listAccounts(),
      accountOverlay.stats(),
    ]).then(([tree, flat, st]) => {
      accountOverlay.applyTreeMeta(tree);
      setRoots(tree);
      setAccountsFlat(accountOverlay.mergeAccounts(flat));
      setStats(st);
      // auto-expand top 2 levels first time
      setExpanded(prev => {
        if (prev.size) return prev;
        const next = new Set<string>();
        const walk = (n: AccountNode) => { if (n.depth < 2) next.add(n.code); n.children.forEach(walk); };
        tree.forEach(walk);
        return next;
      });
    }).finally(() => setLoading(false));
  }, [asOf]);

  useEffect(() => { load(); }, [load]);

  const toggle = (c: string) => setExpanded(p => {
    const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n;
  });
  const expandAll = () => {
    const next = new Set<string>();
    const walk = (n: AccountNode) => { next.add(n.code); n.children.forEach(walk); };
    roots.forEach(walk); setExpanded(next);
  };
  const collapseAll = () => setExpanded(new Set());

  const summary = useMemo(() => {
    const acc = { count: 0, posting: 0, header: 0, inactive: 0, byType: {} as Record<string, { count: number; total: number }> };
    const walk = (n: AccountNode) => {
      acc.count++;
      if (n.is_posting) acc.posting++; else acc.header++;
      if (!n.is_active) acc.inactive++;
      const cur = acc.byType[n.type] ?? { count: 0, total: 0 };
      cur.count++; if (n.depth === 0) cur.total = n.rollup;
      acc.byType[n.type] = cur;
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    return acc;
  }, [roots]);

  const metaById = useMemo(() => {
    const m = new Map<string, any>();
    accountsFlat.forEach(a => m.set(a.id, a.meta ?? {}));
    return m;
  }, [accountsFlat]);

  const openCreate = (parent?: AccountNode) => {
    setDialogMode("create");
    setDialogTarget(undefined);
    setDialogParent(parent ? accountsFlat.find(a => a.id === parent.id) : undefined);
    setDialogOpen(true);
  };
  const openEdit = (n: AccountNode) => {
    setDialogMode("edit");
    setDialogTarget(accountsFlat.find(a => a.id === n.id) ?? n);
    setDialogParent(undefined);
    setDialogOpen(true);
  };
  const handleArchive = async (n: AccountNode) => {
    const { error } = await supabase.from("accounts")
      .update({ is_archived: n.is_active, updated_at: new Date().toISOString() })
      .eq("id", n.id);
    if (error) { toast.error(error.message); return; }
    toast.success(n.is_active ? "تمت الأرشفة" : "تمت الاستعادة");
    load();
  };

  const typeChips: { key: AccountTypeKey | "all"; label: string }[] = [
    { key: "all", label: "الكل" },
    { key: "asset", label: "أصول" },
    { key: "liability", label: "التزامات" },
    { key: "equity", label: "حقوق ملكية" },
    { key: "revenue", label: "إيرادات" },
    { key: "expense", label: "مصروفات" },
  ];

  return (
    <div>
      <PageHeader
        title="دليل الحسابات"
        subtitle={`${summary.count} حساب — ${summary.posting} ترحيل · ${summary.header} رئيسي — هيكل IFRS سعودي`}
        sticky
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => openCreate()}><Plus className="h-3.5 w-3.5 ml-1" /> حساب جديد</Button>
            <Button variant="outline" size="sm" onClick={() => exportCsv(roots)}><FileSpreadsheet className="h-3.5 w-3.5 ml-1" /> تصدير</Button>
            <Button variant="outline" size="sm" onClick={load}><RotateCw className="h-3.5 w-3.5 ml-1" /> تحديث</Button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        {(["asset", "liability", "equity", "revenue", "expense"] as AccountTypeKey[]).map(k => {
          const Icon = typeIcon[k];
          return (
            <button
              key={k}
              onClick={() => setTypeFilter(p => p === k ? "all" : k)}
              className={`border rounded-md p-2 text-right transition ${accountTypeColor[k]} ${typeFilter === k ? "ring-2 ring-offset-1 ring-primary/40" : "hover:brightness-95"}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-[11.5px] opacity-80">{accountTypeLabel[k]}</div>
                <Icon className="h-3.5 w-3.5 opacity-70" />
              </div>
              <div className="text-lg font-bold">{summary.byType[k]?.count ?? 0}</div>
              <div className="text-[11.5px] opacity-70">حساب</div>
            </button>
          );
        })}
      </div>

      {/* Sticky filters */}
      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <Label className="text-xs">بحث</Label>
            <div className="relative">
              <Search className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input className="h-8 pr-8" placeholder="الكود، الاسم العربي أو الإنجليزي" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">حتى تاريخ</Label>
            <Input type="date" className="h-8 w-36" value={asOf} onChange={e => setAsOf(e.target.value)} />
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={expandAll}>توسيع الكل</Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>طي الكل</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {typeChips.map(c => (
              <button
                key={c.key}
                onClick={() => setTypeFilter(c.key)}
                className={`text-[12px] px-2 py-0.5 rounded-full border transition ${typeFilter === c.key ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
              >{c.label}</button>
            ))}
          </div>
          <div className="flex-1" />
          <label className="text-[12px] flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} className="accent-primary" />
            إخفاء بدون رصيد
          </label>
          <label className="text-[12px] flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={hideInactive} onChange={e => setHideInactive(e.target.checked)} className="accent-primary" />
            إخفاء المؤرشف
          </label>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead className="sticky top-0 z-[5] bg-muted/60 backdrop-blur">
            <tr>
              <th className="w-44">الكود / الهيكل</th>
              <th>الحساب</th>
              <th className="w-24">النوع</th>
              <th className="w-20">طبيعة</th>
              <th className="w-16">الحالة</th>
              <th className="w-16 text-center">القيود</th>
              <th className="w-28">آخر حركة</th>
              <th className="text-right w-24">مدين</th>
              <th className="text-right w-24">دائن</th>
              <th className="text-right w-32">الرصيد التجميعي</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>}
            {!loading && roots.length === 0 && <EmptyState inTable colSpan={11} title="لا توجد حسابات" description="ابدأ بإنشاء أول حساب في دليل الحسابات." />}
            {!loading && roots.map(r => (
              <NodeRow
                key={r.id}
                node={r}
                expanded={expanded}
                toggle={toggle}
                query={query}
                typeFilter={typeFilter}
                hideZero={hideZero}
                hideInactive={hideInactive}
                stats={stats}
                metaById={metaById}
                onAddChild={openCreate}
                onEdit={openEdit}
                onArchive={handleArchive}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer legend */}
      <div className="mt-3 text-[12px] text-muted-foreground flex flex-wrap gap-3 px-1">
        <span className="flex items-center gap-1"><FolderTree className="h-3 w-3" /> حساب رئيسي (تجميع فقط)</span>
        <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> حساب ترحيل (يقبل قيود)</span>
        <span className="flex items-center gap-1"><Badge variant="outline" className="h-4 px-1 text-[12px] border-amber-300 text-amber-700">VAT</Badge> خاضع لضريبة القيمة المضافة</span>
        <span className="flex items-center gap-1"><Badge variant="outline" className="h-4 px-1 text-[12px] border-purple-300 text-purple-700">CC</Badge> يتطلب مركز تكلفة</span>
      </div>

      <AccountDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
        mode={dialogMode}
        accounts={accountsFlat}
        target={dialogTarget as any}
        parentHint={dialogParent as any}
      />
    </div>
  );
}
