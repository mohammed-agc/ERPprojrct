import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/erp/EmptyState";
import { ChevronDown, ChevronLeft, RotateCw, Search, FileSpreadsheet } from "lucide-react";
import { accounting, type AccountNode } from "@/services/erp/accounting";
import { fmtSAR, accountTypeLabel, accountTypeColor, todayIso } from "@/lib/erpFormat";

function exportCsv(rows: AccountNode[]) {
  const flat: AccountNode[] = [];
  const walk = (n: AccountNode) => { flat.push(n); n.children.forEach(walk); };
  rows.forEach(walk);
  const head = ["الكود", "الاسم", "النوع", "ترحيل", "مدين", "دائن", "الرصيد", "الرصيد التجميعي"];
  const lines = flat.map(n => [n.code, n.name_ar, accountTypeLabel[n.type], n.is_posting ? "نعم" : "لا",
    n.debit.toFixed(2), n.credit.toFixed(2), n.balance.toFixed(2), n.rollup.toFixed(2)].join(","));
  const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `chart-of-accounts-${todayIso()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function NodeRow({ node, expanded, toggle, query }: { node: AccountNode; expanded: Set<string>; toggle: (c: string) => void; query: string }) {
  const isOpen = expanded.has(node.code);
  const hasChildren = node.children.length > 0;
  const matches = !query || node.code.includes(query) || node.name_ar.includes(query);
  const childMatches = (n: AccountNode): boolean =>
    !query || n.code.includes(query) || n.name_ar.includes(query) || n.children.some(childMatches);
  if (query && !matches && !node.children.some(childMatches)) return null;
  return (
    <>
      <tr className={`hover:bg-muted/40 ${node.depth === 0 ? "bg-muted/30 font-semibold" : ""}`}>
        <td className="py-1">
          <div style={{ paddingRight: node.depth * 18 }} className="flex items-center gap-1">
            {hasChildren ? (
              <button onClick={() => toggle(node.code)} className="text-muted-foreground hover:text-foreground">
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </button>
            ) : <span className="w-3.5 inline-block" />}
            <Link to={`/accounts/${node.id}`} className="font-mono text-xs hover:text-primary">{node.code}</Link>
          </div>
        </td>
        <td>
          <Link to={`/accounts/${node.id}`} className="hover:text-primary">{node.name_ar}</Link>
          {node.name_en && <span className="text-[10px] text-muted-foreground mr-2" dir="ltr">{node.name_en}</span>}
        </td>
        <td><span className={`text-[10px] px-1.5 py-0.5 rounded border ${accountTypeColor[node.type]}`}>{accountTypeLabel[node.type]}</span></td>
        <td className="text-xs">
          {node.is_posting
            ? <span className="text-success">ترحيل</span>
            : <span className="text-muted-foreground">رئيسي</span>}
        </td>
        <td>{node.is_active ? <span className="text-success text-xs">نشط</span> : <Badge variant="secondary" className="text-[10px]">غير نشط</Badge>}</td>
        <td className="num text-left text-xs">{node.debit ? fmtSAR(node.debit) : "—"}</td>
        <td className="num text-left text-xs">{node.credit ? fmtSAR(node.credit) : "—"}</td>
        <td className={`num text-left font-semibold ${node.rollup < 0 ? "text-destructive" : ""}`}>{fmtSAR(node.rollup)}</td>
      </tr>
      {(isOpen || query) && node.children.map(c => (
        <NodeRow key={c.id} node={c} expanded={expanded} toggle={toggle} query={query} />
      ))}
    </>
  );
}

export default function Accounts() {
  const [roots, setRoots] = useState<AccountNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [asOf, setAsOf] = useState(todayIso());

  const load = () => {
    setLoading(true);
    accounting.chartTree(asOf).then(r => {
      setRoots(r);
      // expand top 2 levels by default
      const next = new Set<string>();
      const walk = (n: AccountNode) => { if (n.depth < 2) next.add(n.code); n.children.forEach(walk); };
      r.forEach(walk);
      setExpanded(next);
    }).finally(() => setLoading(false));
  };
  useEffect(load, [asOf]);

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
    const acc = { count: 0, posting: 0, byType: {} as Record<string, number> };
    const walk = (n: AccountNode) => {
      acc.count++;
      if (n.is_posting) acc.posting++;
      acc.byType[n.type] = (acc.byType[n.type] ?? 0) + 1;
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    return acc;
  }, [roots]);

  return (
    <div>
      <PageHeader
        title="دليل الحسابات"
        subtitle={`${summary.count} حساب — ${summary.posting} ترحيل — هيكل IFRS سعودي`}
        sticky
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportCsv(roots)}><FileSpreadsheet className="h-3.5 w-3.5 ml-1" /> تصدير</Button>
            <Button variant="outline" size="sm" onClick={load}><RotateCw className="h-3.5 w-3.5 ml-1" /> تحديث</Button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        {[
          { label: "أصول", key: "asset" },
          { label: "التزامات", key: "liability" },
          { label: "حقوق ملكية", key: "equity" },
          { label: "إيرادات", key: "revenue" },
          { label: "مصروفات", key: "expense" },
        ].map(k => (
          <div key={k.key} className={`border rounded-md p-2 ${accountTypeColor[k.key]}`}>
            <div className="text-[10px] opacity-80">{k.label}</div>
            <div className="text-lg font-bold">{summary.byType[k.key] ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Sticky filters */}
      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <Label className="text-xs">بحث</Label>
          <div className="relative">
            <Search className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="h-8 pr-8" placeholder="الكود أو الاسم" value={query} onChange={e => setQuery(e.target.value)} />
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

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-28">الكود</th>
              <th>الحساب</th>
              <th className="w-24">النوع</th>
              <th className="w-20">نوع الحساب</th>
              <th className="w-20">الحالة</th>
              <th className="text-left w-28">مدين</th>
              <th className="text-left w-28">دائن</th>
              <th className="text-left w-32">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>}
            {!loading && roots.length === 0 && <EmptyState inTable colSpan={8} title="لا توجد حسابات" description="لم يتم إعداد دليل الحسابات بعد." />}
            {!loading && roots.map(r => (
              <NodeRow key={r.id} node={r} expanded={expanded} toggle={toggle} query={query} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
