import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Search, Save, RotateCcw, Users as UsersIcon, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS, type ErpRole } from "@/lib/erpPermissions";
import {
  mockPermissions, workflowGroupLabel, permTypeLabel, permTypeClass,
  type WorkflowGroup, type PermType,
} from "@/data/permissionsMockData";
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_ROLES: ErpRole[] = [
  "admin", "general_manager",
  "purchasing_officer", "purchasing_manager",
  "sales_officer", "sales_manager",
  "accountant", "treasury_officer",
  "inventory_officer", "receiving_officer", "inspection_officer",
  "workshop_manager", "spare_parts_manager", "employee",
];

type MatrixState = Record<string, Set<string>>; // role -> set of permission_code

export default function RolesManager() {
  const { isAdmin } = useAuth();
  const [matrix, setMatrix] = useState<MatrixState>({});
  const [original, setOriginal] = useState<MatrixState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(["admin"]));
  const [q, setQ] = useState("");
  const [groupFilter, setGroupFilter] = useState<WorkflowGroup | "all">("all");
  const [typeFilter, setTypeFilter] = useState<PermType | "all">("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("role_permissions").select("role, permission_code");
    if (error) {
      toast.error("تعذر تحميل صلاحيات الأدوار: " + error.message);
      setLoading(false);
      return;
    }
    const m: MatrixState = {};
    DEFAULT_ROLES.forEach(r => { m[r] = new Set(); });
    (data ?? []).forEach((row: any) => {
      if (!m[row.role]) m[row.role] = new Set();
      m[row.role].add(row.permission_code);
    });
    setMatrix(cloneMatrix(m));
    setOriginal(cloneMatrix(m));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const dirty = useMemo(() => !sameMatrix(matrix, original), [matrix, original]);

  const filteredPerms = useMemo(() => {
    return mockPermissions.filter(p => {
      if (groupFilter !== "all" && p.group !== groupFilter) return false;
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (q && ![p.code, p.label_ar].some(v => v.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [q, groupFilter, typeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<WorkflowGroup, typeof mockPermissions>();
    for (const p of filteredPerms) {
      if (!map.has(p.group)) map.set(p.group, [] as any);
      (map.get(p.group) as any[]).push(p);
    }
    return Array.from(map.entries());
  }, [filteredPerms]);

  const togglePermForSelected = (code: string, value: boolean) => {
    if (selectedRoles.size === 0) return toast.warning("اختر دوراً واحداً على الأقل");
    setMatrix(prev => {
      const next: MatrixState = { ...prev };
      selectedRoles.forEach(r => {
        const s = new Set(prev[r] ?? []);
        value ? s.add(code) : s.delete(code);
        next[r] = s;
      });
      return next;
    });
  };

  const bulkApplyVisible = (value: boolean) => {
    if (selectedRoles.size === 0) return toast.warning("اختر دوراً واحداً على الأقل");
    setMatrix(prev => {
      const next: MatrixState = { ...prev };
      selectedRoles.forEach(r => {
        const s = new Set(prev[r] ?? []);
        filteredPerms.forEach(p => value ? s.add(p.code) : s.delete(p.code));
        next[r] = s;
      });
      return next;
    });
    toast.success(value ? `تم منح ${filteredPerms.length} صلاحية` : `تم سحب ${filteredPerms.length} صلاحية`);
  };

  const toggleRoleSelected = (r: string) => {
    setSelectedRoles(prev => {
      const n = new Set(prev);
      n.has(r) ? n.delete(r) : n.add(r);
      return n;
    });
  };

  const save = async () => {
    if (!isAdmin) return toast.error("هذه العملية مقتصرة على مدير النظام");
    setSaving(true);
    try {
      // diff and apply per role
      for (const role of DEFAULT_ROLES) {
        const curr = matrix[role] ?? new Set();
        const orig = original[role] ?? new Set();
        const toAdd = [...curr].filter(c => !orig.has(c));
        const toRemove = [...orig].filter(c => !curr.has(c));

        if (toAdd.length) {
          const { error } = await supabase.from("role_permissions").insert(
            toAdd.map(code => ({ role: role as any, permission_code: code }))
          );
          if (error) throw error;
        }
        if (toRemove.length) {
          const { error } = await supabase.from("role_permissions")
            .delete().eq("role", role as any).in("permission_code", toRemove);
          if (error) throw error;
        }
      }
      toast.success("تم حفظ صلاحيات الأدوار بنجاح");
      await load();
    } catch (e: any) {
      toast.error("تعذر الحفظ: " + (e.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setMatrix(cloneMatrix(original)); toast.info("تم التراجع عن التغييرات"); };

  return (
    <div>
      <PageHeader
        title="إدارة الأدوار والصلاحيات"
        subtitle="حدد الأدوار ثم امنح أو اسحب الصلاحيات دفعة واحدة. يتم الحفظ في قاعدة البيانات مع تطبيق RLS."
        actions={
          <div className="flex items-center gap-2">
            {dirty && <Badge variant="destructive" className="text-[11.5px]">تغييرات غير محفوظة</Badge>}
            <Button size="sm" variant="outline" onClick={reset} disabled={!dirty || saving}>
              <RotateCcw className="h-4 w-4 mr-1" /> تراجع
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving || !isAdmin}>
              <Save className="h-4 w-4 mr-1" /> {saving ? "جاري الحفظ…" : "حفظ"}
            </Button>
          </div>
        }
      />

      {!isAdmin && (
        <Card className="p-3 mb-3 border-warning/50 bg-warning/5 text-xs">
          عرض فقط — التعديل والحفظ متاح لمدير النظام فقط (محمي عبر RLS في قاعدة البيانات).
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3">
        {/* Roles panel */}
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> الأدوار
            </div>
            <Badge variant="secondary" className="text-[11.5px]">{selectedRoles.size} محدد</Badge>
          </div>
          <div className="flex gap-1 mb-2">
            <Button size="sm" variant="outline" className="flex-1 h-7 text-[12px]"
              onClick={() => setSelectedRoles(new Set(DEFAULT_ROLES))}>
              <CheckSquare className="h-3 w-3 mr-1" /> الكل
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-[12px]"
              onClick={() => setSelectedRoles(new Set())}>
              <Square className="h-3 w-3 mr-1" /> لا شيء
            </Button>
          </div>
          <ScrollArea className="h-[520px] pr-1">
            <div className="space-y-1">
              {DEFAULT_ROLES.map(r => {
                const count = matrix[r]?.size ?? 0;
                const selected = selectedRoles.has(r);
                return (
                  <button
                    key={r}
                    onClick={() => toggleRoleSelected(r)}
                    className={`w-full text-right p-2 rounded-md border transition-colors text-xs flex items-center justify-between gap-2 ${
                      selected ? "bg-primary/10 border-primary" : "bg-card hover:bg-muted border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox checked={selected} onCheckedChange={() => toggleRoleSelected(r)} />
                      <div className="min-w-0">
                        <div className="font-bold truncate">{ROLE_LABELS[r]}</div>
                        <div className="text-[11.5px] font-mono text-muted-foreground truncate">{r}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="gap-1 text-[11.5px]">
                      <UsersIcon className="h-3 w-3" /> {count}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        {/* Permissions panel */}
        <Card className="p-3">
          <div className="flex flex-col md:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث عن صلاحية..." className="pr-8 h-8 text-xs" />
            </div>
            <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v as any)}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="المجموعة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {Object.entries(workflowGroupLabel).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="النوع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {Object.entries(permTypeLabel).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8 text-xs"
              onClick={() => bulkApplyVisible(true)} disabled={!isAdmin}>
              منح الكل المعروض
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs"
              onClick={() => bulkApplyVisible(false)} disabled={!isAdmin}>
              سحب الكل المعروض
            </Button>
          </div>

          <ScrollArea className="h-[520px] pr-1">
            {loading ? (
              <div className="text-center text-xs text-muted-foreground py-8">جاري التحميل…</div>
            ) : grouped.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8">لا توجد نتائج</div>
            ) : (
              <div className="space-y-4">
                {grouped.map(([group, perms]) => (
                  <div key={group}>
                    <div className="flex items-center justify-between mb-2 sticky top-0 bg-card z-10 py-1">
                      <div className="text-xs font-bold text-primary">{workflowGroupLabel[group]}</div>
                      <Badge variant="secondary" className="text-[11.5px]">{perms.length}</Badge>
                    </div>
                    <div className="space-y-1">
                      {perms.map(p => {
                        const counts = countAcrossSelected(matrix, selectedRoles, p.code);
                        const allHave = counts.have === selectedRoles.size && selectedRoles.size > 0;
                        const noneHave = counts.have === 0;
                        const indeterminate = !allHave && !noneHave;
                        return (
                          <div key={p.code}
                            className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/50">
                            <Checkbox
                              checked={allHave ? true : indeterminate ? "indeterminate" : false}
                              onCheckedChange={(v) => togglePermForSelected(p.code, v === true)}
                              disabled={!isAdmin}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium">{p.label_ar}</div>
                              <div className="text-[11.5px] font-mono text-muted-foreground">{p.code}</div>
                            </div>
                            <Badge variant="outline" className={`text-[11.5px] ${permTypeClass[p.type]}`}>
                              {permTypeLabel[p.type]}
                            </Badge>
                            {selectedRoles.size > 0 && (
                              <Badge variant="secondary" className="text-[11.5px] tabular-nums">
                                {counts.have}/{selectedRoles.size}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}

function cloneMatrix(m: MatrixState): MatrixState {
  const n: MatrixState = {};
  Object.keys(m).forEach(k => { n[k] = new Set(m[k]); });
  return n;
}
function sameMatrix(a: MatrixState, b: MatrixState): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const sa = a[k] ?? new Set(); const sb = b[k] ?? new Set();
    if (sa.size !== sb.size) return false;
    for (const v of sa) if (!sb.has(v)) return false;
  }
  return true;
}
function countAcrossSelected(m: MatrixState, roles: Set<string>, code: string) {
  let have = 0;
  roles.forEach(r => { if (m[r]?.has(code)) have++; });
  return { have };
}
