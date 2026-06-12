import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, Building2, Network, Briefcase, Users, ChevronDown, ChevronLeft, Pencil } from "lucide-react";
import {
  type OrgDepartment,
  levelLabel, assignmentStatusLabel,
} from "@/data/orgMockData";
import {
  useDepartments, useUnits, usePositions, useAssignments, useSaveDepartment,
} from "@/hooks/erp/useOrg";
import { LoadingState, ErrorState } from "@/components/erp/StateViews";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Departments tab                                                     */
/* ------------------------------------------------------------------ */
function DepartmentsTab() {
  const { data: list = [], isLoading, isError, refetch } = useDepartments();
  const saveMut = useSaveDepartment();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OrgDepartment | null>(null);

  const filtered = useMemo(
    () => list.filter(d => !q || [d.name_ar, d.name_en, d.code, d.manager].some(v => (v ?? "").toLowerCase().includes(q.toLowerCase()))),
    [list, q]
  );

  const startCreate = () => {
    setEditing({ id: `d-new-${Date.now()}`, code: "", name_ar: "", name_en: "", manager: "", status: "active" });
    setOpen(true);
  };
  const startEdit = (d: OrgDepartment) => { setEditing({ ...d }); setOpen(true); };
  const save = async () => {
    if (!editing) return;
    if (!editing.name_ar.trim() || !editing.code.trim()) { toast.error("الاسم والكود مطلوبان"); return; }
    try {
      await saveMut.mutateAsync(editing);
      setOpen(false); setEditing(null);
      toast.success("تم الحفظ");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر الحفظ");
    }
  };

  return (
    <div className="space-y-3">
      <div className="erp-toolbar">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث عن قسم..." className="pr-8 h-9" />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">{filtered.length} قسم</div>
        <div className="flex-1" />
        <Button size="sm" onClick={startCreate}><Plus className="h-4 w-4 ml-1" /> قسم جديد</Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-24">الكود</th>
              <th>الاسم بالعربية</th>
              <th>الاسم بالإنجليزية</th>
              <th>مدير القسم</th>
              <th className="w-28">الحالة</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <LoadingState inTable colSpan={6} />}
            {isError && !isLoading && (
              <ErrorState inTable colSpan={6} onRetry={() => refetch()} />
            )}
            {!isLoading && !isError && filtered.map(d => (
              <tr key={d.id}>
                <td><span className="num text-xs font-mono" dir="ltr">{d.code}</span></td>
                <td className="font-medium">{d.name_ar}</td>
                <td className="text-muted-foreground" dir="ltr">{d.name_en}</td>
                <td>{d.manager || <span className="text-muted-foreground">—</span>}</td>
                <td>
                  <Badge variant={d.status === "active" ? "default" : "secondary"}>
                    {d.status === "active" ? "نشط" : "متوقف"}
                  </Badge>
                </td>
                <td>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>startEdit(d)}>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </td>
              </tr>
            ))}
            {!isLoading && !isError && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">لا توجد نتائج</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing && list.some(x=>x.id===editing.id) ? "تعديل قسم" : "إنشاء قسم"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>الكود</Label><Input value={editing.code} onChange={e=>setEditing({...editing, code:e.target.value})} dir="ltr" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الاسم (عربي)</Label><Input value={editing.name_ar} onChange={e=>setEditing({...editing, name_ar:e.target.value})} /></div>
                <div><Label>الاسم (إنجليزي)</Label><Input value={editing.name_en} onChange={e=>setEditing({...editing, name_en:e.target.value})} dir="ltr" /></div>
              </div>
              <div><Label>مدير القسم</Label><Input value={editing.manager ?? ""} onChange={e=>setEditing({...editing, manager:e.target.value})} placeholder="اسم المدير" /></div>
              <div>
                <Label>الحالة</Label>
                <Select value={editing.status} onValueChange={(v)=>setEditing({...editing, status:v as any})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">متوقف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saveMut.isPending}>{saveMut.isPending ? "جاري الحفظ..." : "حفظ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Operational Units tab — hierarchical view                            */
/* ------------------------------------------------------------------ */
function UnitsTab() {
  const { data: departments = [], isLoading: dLoad, isError: dErr, refetch: rDept } = useDepartments();
  const { data: units = [], isLoading: uLoad, isError: uErr, refetch: rUnits } = useUnits();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Default-expand on first load
  useMemo(() => {
    if (departments.length && expanded.size === 0) {
      setExpanded(new Set(departments.map(d => d.id)));
    }
  }, [departments]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setExpanded(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  if (dLoad || uLoad) return <LoadingState />;
  if (dErr || uErr) return <ErrorState onRetry={() => { rDept(); rUnits(); }} />;

  return (
    <div className="space-y-3">
      <div className="erp-toolbar">
        <div className="text-sm text-muted-foreground">عرض هرمي للأقسام والوحدات التشغيلية</div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={()=>setExpanded(new Set(departments.map(d=>d.id)))}>توسيع الكل</Button>
        <Button size="sm" variant="outline" onClick={()=>setExpanded(new Set())}>طيّ الكل</Button>
        <Button size="sm"><Plus className="h-4 w-4 ml-1" /> وحدة جديدة</Button>
      </div>

      <div className="bg-card border border-border rounded-lg p-2">
        {departments.map(d => {
          const deptUnits = units.filter(u => u.department_id === d.id);
          const isOpen = expanded.has(d.id);
          return (
            <div key={d.id} className="border-b border-border last:border-0">
              <button
                type="button"
                onClick={()=>toggle(d.id)}
                className="w-full flex items-center gap-2 px-2 py-2 hover:bg-accent/40 rounded text-right"
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                <Building2 className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{d.name_ar}</span>
                <span className="text-[12px] text-muted-foreground font-mono" dir="ltr">{d.code}</span>
                <div className="flex-1" />
                <Badge variant="secondary" className="text-[11.5px]">{deptUnits.length} وحدة</Badge>
              </button>
              {isOpen && (
                <div className="pr-8 pb-2 space-y-0.5">
                  {deptUnits.length === 0 && (
                    <div className="text-xs text-muted-foreground py-2 px-2">لا توجد وحدات</div>
                  )}
                  {deptUnits.map(u => (
                    <div key={u.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent/30 rounded text-sm border-r-2 border-border">
                      <Network className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{u.name_ar}</span>
                      <span className="text-[12px] text-muted-foreground" dir="ltr">{u.name_en}</span>
                      <div className="flex-1" />
                      {u.manager && <span className="text-[12px] text-muted-foreground">المسؤول: {u.manager}</span>}
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Job Positions tab                                                    */
/* ------------------------------------------------------------------ */
function PositionsTab() {
  const { data: departments = [] } = useDepartments();
  const { data: units = [] } = useUnits();
  const { data: positions = [], isLoading, isError, refetch } = usePositions();
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");

  const filteredUnits = useMemo(
    () => deptFilter === "all" ? units : units.filter(u => u.department_id === deptFilter),
    [units, deptFilter]
  );

  const filtered = useMemo(() => {
    return positions.filter(p => {
      if (deptFilter !== "all" && p.department_id !== deptFilter) return false;
      if (unitFilter !== "all" && p.unit_id !== unitFilter) return false;
      if (q && ![p.title_ar, p.title_en].some(v => v.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [positions, q, deptFilter, unitFilter]);

  return (
    <div className="space-y-3">
      <div className="erp-toolbar">
        <div className="relative flex-1 max-w-xs min-w-[200px]">
          <Search className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث عن وظيفة..." className="pr-8 h-9" />
        </div>
        <Select value={deptFilter} onValueChange={(v)=>{ setDeptFilter(v); setUnitFilter("all"); }}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="القسم" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={unitFilter} onValueChange={setUnitFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="الوحدة التشغيلية" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الوحدات</SelectItem>
            {filteredUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.name_ar}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground">{filtered.length} وظيفة</div>
        <div className="flex-1" />
        <Button size="sm"><Plus className="h-4 w-4 ml-1" /> وظيفة جديدة</Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>المسمى الوظيفي</th>
              <th>الإنجليزية</th>
              <th>القسم</th>
              <th>الوحدة</th>
              <th className="w-28">المستوى</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <LoadingState inTable colSpan={6} />}
            {isError && !isLoading && <ErrorState inTable colSpan={6} onRetry={() => refetch()} />}
            {!isLoading && !isError && filtered.map(p => {
              const dept = departments.find(d => d.id === p.department_id);
              const unit = units.find(u => u.id === p.unit_id);
              return (
                <tr key={p.id}>
                  <td className="font-medium">{p.title_ar}</td>
                  <td className="text-muted-foreground text-xs" dir="ltr">{p.title_en}</td>
                  <td className="text-sm">{dept?.name_ar ?? "—"}</td>
                  <td className="text-sm text-muted-foreground">{unit?.name_ar ?? "—"}</td>
                  <td><Badge variant="outline" className="text-[11.5px]">{levelLabel[p.level]}</Badge></td>
                  <td><Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></Button></td>
                </tr>
              );
            })}
            {!isLoading && !isError && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">لا توجد نتائج</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Employee Assignments tab                                             */
/* ------------------------------------------------------------------ */
function AssignmentsTab() {
  const { data: departments = [] } = useDepartments();
  const { data: units = [] } = useUnits();
  const { data: positions = [] } = usePositions();
  const { data: assignments = [], isLoading, isError, refetch } = useAssignments();
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const filtered = useMemo(() => assignments.filter(a => {
    if (deptFilter !== "all" && a.department_id !== deptFilter) return false;
    if (q && ![a.employee_name, a.employee_no].some(v => v.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [assignments, q, deptFilter]);

  return (
    <div className="space-y-3">
      <div className="erp-toolbar">
        <div className="relative flex-1 max-w-xs min-w-[200px]">
          <Search className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث عن موظف..." className="pr-8 h-9" />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="القسم" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground">{filtered.length} تعيين</div>
        <div className="flex-1" />
        <Button size="sm"><Plus className="h-4 w-4 ml-1" /> تعيين جديد</Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-28">الرقم الوظيفي</th>
              <th>الموظف</th>
              <th>القسم</th>
              <th>الوحدة</th>
              <th>الوظيفة</th>
              <th className="w-28">تاريخ المباشرة</th>
              <th className="w-24">الحالة</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <LoadingState inTable colSpan={8} />}
            {isError && !isLoading && <ErrorState inTable colSpan={8} onRetry={() => refetch()} />}
            {!isLoading && !isError && filtered.map(a => {
              const dept = departments.find(d => d.id === a.department_id);
              const unit = units.find(u => u.id === a.unit_id);
              const pos = positions.find(p => p.id === a.position_id);
              return (
                <tr key={a.id}>
                  <td><span className="num text-xs font-mono" dir="ltr">{a.employee_no}</span></td>
                  <td className="font-medium">{a.employee_name}</td>
                  <td className="text-sm">{dept?.name_ar ?? "—"}</td>
                  <td className="text-sm text-muted-foreground">{unit?.name_ar ?? "—"}</td>
                  <td className="text-sm">{pos?.title_ar ?? "—"}</td>
                  <td><span className="num text-xs" dir="ltr">{a.start_date}</span></td>
                  <td>
                    <Badge
                      variant={a.status === "active" ? "default" : a.status === "on_leave" ? "secondary" : "outline"}
                      className={cn("text-[11.5px]", a.status === "ended" && "text-muted-foreground")}
                    >
                      {assignmentStatusLabel[a.status]}
                    </Badge>
                  </td>
                  <td><Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></Button></td>
                </tr>
              );
            })}
            {!isLoading && !isError && filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">لا توجد نتائج</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */
export default function Organization() {
  return (
    <div>
      <PageHeader
        title="الهيكل التنظيمي"
        subtitle="إدارة الأقسام، الوحدات التشغيلية، الوظائف، وتعيينات الموظفين"
      />

      <Tabs defaultValue="departments" dir="rtl">
        <TabsList className="mb-4">
          <TabsTrigger value="departments" className="gap-2"><Building2 className="h-4 w-4" /> الأقسام</TabsTrigger>
          <TabsTrigger value="units" className="gap-2"><Network className="h-4 w-4" /> الوحدات التشغيلية</TabsTrigger>
          <TabsTrigger value="positions" className="gap-2"><Briefcase className="h-4 w-4" /> الوظائف</TabsTrigger>
          <TabsTrigger value="assignments" className="gap-2"><Users className="h-4 w-4" /> التعيينات</TabsTrigger>
        </TabsList>

        <TabsContent value="departments"><DepartmentsTab /></TabsContent>
        <TabsContent value="units"><UnitsTab /></TabsContent>
        <TabsContent value="positions"><PositionsTab /></TabsContent>
        <TabsContent value="assignments"><AssignmentsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
