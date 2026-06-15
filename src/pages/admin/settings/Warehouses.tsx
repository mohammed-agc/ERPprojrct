import { useState, useEffect } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Save } from "lucide-react";
import { warehousesService, type Warehouse } from "@/services/erp/warehousesService";
import { branchesService, type Branch } from "@/services/erp/branchesService";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = { vehicles: "مركبات", parts: "قطع غيار", mixed: "مختلط" };

export default function SettingsWarehouses() {
  const [list, setList] = useState<Warehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, Warehouse>>({});

  useEffect(() => {
    Promise.all([warehousesService.list(), branchesService.list()])
      .then(([whs, brs]) => { setList(whs); setBranches(brs); })
      .catch(err => { console.error(err); toast.error("تعذّر تحميل المستودعات"); })
      .finally(() => setLoading(false));
  }, []);

  const editRow = (w: Warehouse, patch: Partial<Warehouse>) => {
    const updated = { ...w, ...patch };
    setList(p => p.map(x => x.id === w.id ? updated : x));
    setDirty(d => ({ ...d, [w.id]: updated }));
  };

  const saveRow = async (w: Warehouse) => {
    if (!w.code.trim() || !w.name.trim()) { toast.error("الكود والاسم مطلوبان"); return; }
    setSavingId(w.id);
    try {
      const payload = {
        code: w.code, name: w.name, name_en: w.name_en, city: w.city,
        branch_id: w.branch_id, type: w.type, capacity: w.capacity,
        active: w.active, notes: w.notes,
      };
      if (w.id.startsWith("new-")) {
        const created = await warehousesService.create(payload);
        setList(p => p.map(x => x.id === w.id ? created : x));
      } else {
        const updated = await warehousesService.update(w.id, payload);
        setList(p => p.map(x => x.id === w.id ? updated : x));
      }
      setDirty(d => { const n = { ...d }; delete n[w.id]; return n; });
      toast.success("تم حفظ المستودع");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message?.includes("duplicate") ? "كود المستودع مستخدم مسبقاً" : "تعذّر حفظ المستودع");
    } finally {
      setSavingId(null);
    }
  };

  const add = () => {
    const tempId = `new-${crypto.randomUUID()}`;
    const mainBranch = branches.find(b => b.is_main);
    const draft: Warehouse = {
      id: tempId, code: "", name: "", name_en: null, city: "",
      branch: null, branch_id: mainBranch?.id ?? null, type: "mixed",
      address: null, manager_id: null, capacity: null, used_capacity: 0,
      active: true, notes: null, created_at: "", updated_at: "",
    };
    setList(p => [...p, draft]);
    setDirty(d => ({ ...d, [tempId]: draft }));
  };

  const remove = async (w: Warehouse) => {
    if (w.id.startsWith("new-")) {
      setList(p => p.filter(x => x.id !== w.id));
      setDirty(d => { const n = { ...d }; delete n[w.id]; return n; });
      return;
    }
    if (!confirm(`حذف المستودع "${w.name}"؟`)) return;
    try {
      await warehousesService.remove(w.id);
      setList(p => p.filter(x => x.id !== w.id));
      toast.success("تم حذف المستودع");
    } catch (err: any) {
      console.error(err); toast.error(err?.message || "تعذّر حذف المستودع");
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="المستودعات" subtitle="جارٍ التحميل…" />
        <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="المستودعات" subtitle="إدارة مستودعات الشركة (مركبات، قطع غيار، مختلط)" actions={
        <Button variant="outline" onClick={add} size="sm"><Plus className="h-3.5 w-3.5 me-1" />إضافة مستودع</Button>
      } />
      <Card className="p-0 overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr><th>الكود</th><th>الاسم</th><th>الفرع</th><th>النوع</th><th>المدينة</th><th>السعة</th><th>نشط</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((w) => {
              const isDirty = !!dirty[w.id];
              return (
                <tr key={w.id}>
                  <td><Input value={w.code} onChange={e => editRow(w, { code: e.target.value })} className="h-8 font-mono w-28" /></td>
                  <td><Input value={w.name} onChange={e => editRow(w, { name: e.target.value })} className="h-8" /></td>
                  <td>
                    <Select value={w.branch_id ?? ""} onValueChange={v => editRow(w, { branch_id: v || null })}>
                      <SelectTrigger className="h-8 w-36"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td>
                    <Select value={w.type} onValueChange={(v) => editRow(w, { type: v as Warehouse["type"] })}>
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vehicles">مركبات</SelectItem>
                        <SelectItem value="parts">قطع غيار</SelectItem>
                        <SelectItem value="mixed">مختلط</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td><Input value={w.city ?? ""} onChange={e => editRow(w, { city: e.target.value })} className="h-8 w-28" /></td>
                  <td><Input type="number" value={w.capacity ?? ""} onChange={e => editRow(w, { capacity: e.target.value ? Number(e.target.value) : null })} className="h-8 w-24 num" dir="ltr" /></td>
                  <td><Switch checked={w.active} onCheckedChange={(v) => editRow(w, { active: v })} /></td>
                  <td>
                    <div className="flex items-center gap-1">
                      {isDirty && (
                        <Button variant="ghost" size="icon" onClick={() => saveRow(w)} className="h-7 w-7" disabled={savingId === w.id}>
                          {savingId === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 text-primary" />}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => remove(w)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={8} className="text-center text-muted-foreground py-6">لا توجد مستودعات</td></tr>}
          </tbody>
        </table>
      </Card>

      {Object.keys(dirty).length > 0 && (
        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
          <Save className="h-3 w-3" /> لديك تغييرات غير محفوظة — اضغط أيقونة الحفظ بجانب كل صف معدّل.
        </p>
      )}
    </div>
  );
}
