import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShieldCheck, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  workflowGroupLabel, permTypeLabel, permTypeClass,
  type PermissionDef, type WorkflowGroup, type RoleDef,
} from "@/data/permissionsMockData";
import { useDepartments } from "@/hooks/erp/useOrg";
import {
  usePermissionDefs, usePermissionRoles, usePermissionMatrix, useSavePermissionMatrix,
} from "@/hooks/erp/usePermissionMatrix";
import { LoadingState, ErrorState } from "@/components/erp/StateViews";

export default function Permissions() {
  const { data: departments = [] } = useDepartments();
  const { data: perms = [], isLoading: lPerms, isError: ePerms, refetch: rPerms } = usePermissionDefs();
  const { data: roles = [], isLoading: lRoles, isError: eRoles, refetch: rRoles } = usePermissionRoles();
  const { data: initialMatrix, isLoading: lMatrix, isError: eMatrix, refetch: rMatrix } = usePermissionMatrix();
  const saveMut = useSavePermissionMatrix();

  const isLoading = lPerms || lRoles || lMatrix;
  const isError = ePerms || eRoles || eMatrix;

  // local matrix state — Sets keyed by role_id
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({});
  const [dirty, setDirty] = useState(false);

  // hydrate when remote matrix arrives
  useEffect(() => {
    if (!initialMatrix) return;
    const m: Record<string, Set<string>> = {};
    for (const r of roles) m[r.id] = new Set(initialMatrix[r.id] ?? []);
    setMatrix(m);
    setDirty(false);
  }, [initialMatrix, roles]);

  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<WorkflowGroup | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const visibleRoles = useMemo(
    () => deptFilter === "all" ? roles : roles.filter(r => r.department_code === deptFilter),
    [roles, deptFilter]
  );

  const visiblePerms = useMemo(() => {
    return perms.filter(p => {
      if (deptFilter !== "all" && !p.departments.includes(deptFilter)) return false;
      if (groupFilter !== "all" && p.group !== groupFilter) return false;
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (q && ![p.code, p.label_ar].some(v => v.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [perms, q, deptFilter, groupFilter, typeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<WorkflowGroup, PermissionDef[]>();
    for (const p of visiblePerms) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return Array.from(map.entries());
  }, [visiblePerms]);

  const toggle = useCallback((roleId: string, code: string) => {
    setMatrix(prev => {
      const next = { ...prev, [roleId]: new Set(prev[roleId]) };
      next[roleId].has(code) ? next[roleId].delete(code) : next[roleId].add(code);
      return next;
    });
    setDirty(true);
  }, []);

  const toggleRowAll = useCallback((code: string, value: boolean) => {
    setMatrix(prev => {
      const next: typeof prev = { ...prev };
      for (const r of visibleRoles) {
        next[r.id] = new Set(prev[r.id]);
        value ? next[r.id].add(code) : next[r.id].delete(code);
      }
      return next;
    });
    setDirty(true);
  }, [visibleRoles]);

  const toggleColAll = useCallback((roleId: string, value: boolean) => {
    setMatrix(prev => {
      const set = new Set(prev[roleId]);
      for (const p of visiblePerms) value ? set.add(p.code) : set.delete(p.code);
      return { ...prev, [roleId]: set };
    });
    setDirty(true);
  }, [visiblePerms]);

  const reset = () => {
    if (!initialMatrix) return;
    const m: Record<string, Set<string>> = {};
    for (const r of roles) m[r.id] = new Set(initialMatrix[r.id] ?? []);
    setMatrix(m);
    setDirty(false);
    toast.success("تم استرجاع القيم الأصلية");
  };

  const save = async () => {
    const payload: Record<string, string[]> = {};
    for (const r of roles) payload[r.id] = Array.from(matrix[r.id] ?? []);
    try {
      await saveMut.mutateAsync(payload);
      setDirty(false);
      toast.success("تم حفظ المصفوفة");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر الحفظ");
    }
  };

  const colChecked = (roleId: string) =>
    visiblePerms.length > 0 && visiblePerms.every(p => matrix[roleId]?.has(p.code));
  const rowChecked = (code: string) =>
    visibleRoles.length > 0 && visibleRoles.every(r => matrix[r.id]?.has(code));

  return (
    <div>
      <PageHeader
        title="مصفوفة الصلاحيات"
        subtitle="إدارة الصلاحيات حسب الإجراء والقسم وسير العمل"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={reset} disabled={!dirty || saveMut.isPending}>
              <RotateCcw className="h-4 w-4 ml-1" /> استرجاع
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saveMut.isPending}>
              <Save className="h-4 w-4 ml-1" /> {saveMut.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </div>
        }
      />

      {/* Filters bar */}
      <div className="erp-toolbar mb-3">
        <div className="relative flex-1 max-w-xs min-w-[200px]">
          <Search className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث عن صلاحية..." className="pr-8 h-9" />
        </div>

        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="القسم" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {departments.map(d => (
              <SelectItem key={d.id} value={d.code}>{d.name_ar}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={groupFilter} onValueChange={v=>setGroupFilter(v as any)}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="مجموعة العمل" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المجموعات</SelectItem>
            {Object.entries(workflowGroupLabel).map(([k,v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="نوع الصلاحية" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            {Object.entries(permTypeLabel).map(([k,v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="text-xs text-muted-foreground mr-auto tabular-nums">
          {visiblePerms.length} صلاحية · {visibleRoles.length} وظيفة
          {dirty && <span className="mr-2 inline-flex items-center gap-1 text-warning"><span className="h-1.5 w-1.5 rounded-full bg-warning" />تغييرات غير محفوظة</span>}
        </div>
      </div>

      {/* Type legend */}
      <div className="flex items-center gap-2 mb-2 text-[12px]">
        <span className="text-muted-foreground">دلالة الألوان:</span>
        {(Object.keys(permTypeLabel) as Array<keyof typeof permTypeLabel>).map(k => (
          <span key={k} className={cn("px-1.5 py-0.5 rounded border", permTypeClass[k])}>{permTypeLabel[k]}</span>
        ))}
      </div>

      {/* Matrix */}
      <div className="bg-card border border-border rounded-lg overflow-auto max-h-[calc(100vh-280px)]">
        {isLoading && <LoadingState />}
        {isError && !isLoading && (
          <ErrorState onRetry={() => { rPerms(); rRoles(); rMatrix(); }} />
        )}
        {!isLoading && !isError && (
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20 bg-[hsl(var(--table-header))]">
            <tr>
              <th className="sticky right-0 z-30 bg-[hsl(var(--table-header))] text-right px-3 py-2 border-b border-l border-[hsl(var(--table-border))] min-w-[280px]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-xs uppercase tracking-wide">الصلاحية</span>
                </div>
              </th>
              <th className="text-center px-2 py-2 border-b border-l border-[hsl(var(--table-border))] text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground w-16">
                النوع
              </th>
              {visibleRoles.map(r => (
                <th
                  key={r.id}
                  className="text-center px-1.5 py-2 border-b border-l border-[hsl(var(--table-border))] min-w-[110px] align-bottom"
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-[12px] font-semibold leading-tight">{r.title_ar}</div>
                    <div className="text-[12px] text-muted-foreground font-mono" dir="ltr">{r.department_code}</div>
                    <Checkbox
                      checked={colChecked(r.id)}
                      onCheckedChange={(v)=>toggleColAll(r.id, !!v)}
                      className="mt-0.5"
                      aria-label={`تفعيل الكل لـ ${r.title_ar}`}
                    />
                  </div>
                </th>
              ))}
              <th className="w-2 border-b border-[hsl(var(--table-border))]" />
            </tr>
          </thead>

          <tbody>
            {grouped.length === 0 && (
              <tr>
                <td colSpan={visibleRoles.length + 3} className="text-center text-muted-foreground py-10">
                  لا توجد صلاحيات مطابقة للفلاتر
                </td>
              </tr>
            )}

            {grouped.map(([group, gperms]) => (
              <Section key={group} group={group} perms={gperms}>
                {gperms.map(p => (
                  <MatrixRow
                    key={p.code}
                    perm={p}
                    roles={visibleRoles}
                    matrix={matrix}
                    rowChecked={rowChecked(p.code)}
                    onToggle={toggle}
                    onToggleRow={toggleRowAll}
                  />
                ))}
              </Section>
            ))}
          </tbody>
        </table>
        )}
      </div>

      <div className="text-[12px] text-muted-foreground mt-2 text-center">
        مصفوفة واجهة فقط — لم تُربط بعد بمحرك الاعتماد الخلفي. التغييرات لا تؤثر على enforcement.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Memoized row — prevents whole-matrix re-render on a single toggle.   */
/* ------------------------------------------------------------------ */
interface RowProps {
  perm: PermissionDef;
  roles: RoleDef[];
  matrix: Record<string, Set<string>>;
  rowChecked: boolean;
  onToggle: (roleId: string, code: string) => void;
  onToggleRow: (code: string, value: boolean) => void;
}

const MatrixRow = memo(function MatrixRow({
  perm: p, roles, matrix, rowChecked, onToggle, onToggleRow,
}: RowProps) {
  return (
    <tr className="hover:bg-[hsl(var(--table-row-hover))]">
      <td className="sticky right-0 bg-card hover:bg-[hsl(var(--table-row-hover))] z-10 px-3 py-1.5 border-b border-l border-[hsl(var(--table-border))]">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={rowChecked}
            onCheckedChange={(v)=>onToggleRow(p.code, !!v)}
            aria-label={`تفعيل الكل لـ ${p.label_ar}`}
          />
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">{p.label_ar}</div>
            <div className="text-[11.5px] text-muted-foreground font-mono truncate" dir="ltr">{p.code}</div>
          </div>
        </div>
      </td>
      <td className="text-center px-1 py-1.5 border-b border-l border-[hsl(var(--table-border))]">
        <Badge variant="outline" className={cn("text-[12px] px-1.5 py-0", permTypeClass[p.type])}>
          {permTypeLabel[p.type]}
        </Badge>
      </td>
      {roles.map(r => {
        const checked = matrix[r.id]?.has(p.code) ?? false;
        return (
          <td
            key={r.id}
            className={cn(
              "text-center px-1 py-1.5 border-b border-l border-[hsl(var(--table-border))] cursor-pointer",
              checked && "bg-primary/5"
            )}
            onClick={()=>onToggle(r.id, p.code)}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={()=>onToggle(r.id, p.code)}
              onClick={(e)=>e.stopPropagation()}
              aria-label={`${p.label_ar} لـ ${r.title_ar}`}
            />
          </td>
        );
      })}
      <td className="border-b border-[hsl(var(--table-border))]" />
    </tr>
  );
}, (a, b) =>
  a.perm === b.perm &&
  a.roles === b.roles &&
  a.rowChecked === b.rowChecked &&
  // Only re-render this row if its own role-sets changed reference
  a.roles.every(r => a.matrix[r.id] === b.matrix[r.id])
);

/* Section header row that groups permissions by workflow */
function Section({
  group, perms, children,
}: { group: WorkflowGroup; perms: PermissionDef[]; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={100} className="sticky right-0 px-3 py-1.5 border-b border-[hsl(var(--table-border))] text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
          {workflowGroupLabel[group]} · {perms.length}
        </td>
      </tr>
      {children}
    </>
  );
}
