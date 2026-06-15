import { useState, useEffect } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Save, Building2 } from "lucide-react";
import { branchesService, type Branch } from "@/services/erp/branchesService";
import { settingsService } from "@/services/erp/settingsService";
import { toast } from "sonner";

export default function SettingsBranches() {
  const [list, setList] = useState<Branch[]>([]);
  const [multiBranch, setMultiBranch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  // مسوّدات الصفوف الجديدة غير المحفوظة (id يبدأ بـ "new-")
  const [dirty, setDirty] = useState<Record<string, Branch>>({});

  // تحميل
  useEffect(() => {
    Promise.all([
      branchesService.list(),
      settingsService.getKey("company.multi_branch_enabled"),
    ])
      .then(([branches, multi]) => {
        setList(branches);
        setMultiBranch(multi === true);
      })
      .catch(err => { console.error(err); toast.error("تعذّر تحميل الفروع"); })
      .finally(() => setLoading(false));
  }, []);

  // تبديل مفتاح تعدّد الفروع
  const toggleMulti = async (v: boolean) => {
    setMultiBranch(v);
    try {
      await settingsService.setKey("company.multi_branch_enabled", v, "boolean");
      toast.success(v ? "تم تفعيل تعدّد الفروع" : "تم تعطيل تعدّد الفروع");
    } catch (err) {
      console.error(err); toast.error("تعذّر حفظ الإعداد");
      setMultiBranch(!v); // تراجع
    }
  };

  // تتبّع تعديل صف
  const editRow = (b: Branch, patch: Partial<Branch>) => {
    const updated = { ...b, ...patch };
    setList(p => p.map(x => x.id === b.id ? updated : x));
    setDirty(d => ({ ...d, [b.id]: updated }));
  };

  // حفظ صف (إنشاء إن جديد، تعديل إن موجود)
  const saveRow = async (b: Branch) => {
    if (!b.code.trim() || !b.name_ar.trim()) {
      toast.error("الكود والاسم مطلوبان");
      return;
    }
    setSavingId(b.id);
    try {
      if (b.id.startsWith("new-")) {
        const created = await branchesService.create({
          code: b.code, name_ar: b.name_ar, name_en: b.name_en,
          city: b.city, phone: b.phone, manager_name: b.manager_name,
          is_active: b.is_active,
        });
        setList(p => p.map(x => x.id === b.id ? created : x));
      } else {
        const updated = await branchesService.update(b.id, {
          code: b.code, name_ar: b.name_ar, name_en: b.name_en,
          city: b.city, phone: b.phone, manager_name: b.manager_name,
          is_active: b.is_active,
        });
        setList(p => p.map(x => x.id === b.id ? updated : x));
      }
      setDirty(d => { const n = { ...d }; delete n[b.id]; return n; });
      toast.success("تم حفظ الفرع");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message?.includes("duplicate") ? "كود الفرع مستخدم مسبقاً" : "تعذّر حفظ الفرع");
    } finally {
      setSavingId(null);
    }
  };

  // إضافة صف جديد (مسودّة محلية حتى الحفظ)
  const add = () => {
    const tempId = `new-${crypto.randomUUID()}`;
    const draft: Branch = {
      id: tempId, code: "", name_ar: "", name_en: null, is_main: false,
      building_no: null, street: null, district: null, city: "", postal_code: null,
      phone: "", manager_name: null, invoice_prefix: null, is_active: true,
      opened_at: null, created_at: "", updated_at: "",
    };
    setList(p => [...p, draft]);
    setDirty(d => ({ ...d, [tempId]: draft }));
  };

  // حذف فرع
  const remove = async (b: Branch) => {
    if (b.is_main) { toast.error("لا يمكن حذف الفرع الرئيسي"); return; }
    if (b.id.startsWith("new-")) {
      // مسودّة غير محفوظة — احذفها محلياً فقط
      setList(p => p.filter(x => x.id !== b.id));
      setDirty(d => { const n = { ...d }; delete n[b.id]; return n; });
      return;
    }
    if (!confirm(`حذف الفرع "${b.name_ar}"؟`)) return;
    try {
      await branchesService.remove(b.id);
      setList(p => p.filter(x => x.id !== b.id));
      toast.success("تم حذف الفرع");
    } catch (err: any) {
      console.error(err); toast.error(err?.message || "تعذّر حذف الفرع");
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="الفروع" subtitle="جارٍ التحميل…" />
        <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </div>
    );
  }

  // عند تعطيل التعدّد، نعرض الفرع الرئيسي فقط
  const visibleList = multiBranch ? list : list.filter(b => b.is_main);

  return (
    <div>
      <PageHeader title="الفروع" subtitle="إدارة فروع الشركة" actions={
        multiBranch ? (
          <Button variant="outline" onClick={add} size="sm"><Plus className="h-3.5 w-3.5 me-1" />إضافة فرع</Button>
        ) : null
      } />

      {/* مفتاح تعدّد الفروع */}
      <Card className="p-4 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">تعدّد الفروع</Label>
              <p className="text-xs text-muted-foreground">
                {multiBranch
                  ? "الشركة تعمل بعدّة فروع — يمكنك إضافة وإدارة الفروع."
                  : "الشركة تعمل بفرع واحد (الرئيسي). فعّل الخيار لإضافة فروع."}
              </p>
            </div>
          </div>
          <Switch checked={multiBranch} onCheckedChange={toggleMulti} />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الكود</th><th>الاسم</th><th>المدينة</th><th>الهاتف</th><th>المدير</th><th>نشط</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visibleList.map((b) => {
              const isDirty = !!dirty[b.id];
              return (
                <tr key={b.id}>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <Input value={b.code} onChange={e => editRow(b, { code: e.target.value })} className="h-8 font-mono" disabled={b.is_main} />
                      {b.is_main && <Badge variant="secondary" className="text-[10px] whitespace-nowrap">رئيسي</Badge>}
                    </div>
                  </td>
                  <td><Input value={b.name_ar} onChange={e => editRow(b, { name_ar: e.target.value })} className="h-8" /></td>
                  <td><Input value={b.city ?? ""} onChange={e => editRow(b, { city: e.target.value })} className="h-8" /></td>
                  <td><Input value={b.phone ?? ""} onChange={e => editRow(b, { phone: e.target.value })} className="h-8" dir="ltr" /></td>
                  <td><Input value={b.manager_name ?? ""} onChange={e => editRow(b, { manager_name: e.target.value })} className="h-8" /></td>
                  <td><Switch checked={b.is_active} onCheckedChange={(v) => editRow(b, { is_active: v })} /></td>
                  <td>
                    <div className="flex items-center gap-1">
                      {isDirty && (
                        <Button variant="ghost" size="icon" onClick={() => saveRow(b)} className="h-7 w-7" disabled={savingId === b.id}>
                          {savingId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 text-primary" />}
                        </Button>
                      )}
                      {!b.is_main && (
                        <Button variant="ghost" size="icon" onClick={() => remove(b)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visibleList.length && <tr><td colSpan={7} className="text-center text-muted-foreground py-6">لا توجد فروع</td></tr>}
          </tbody>
        </table>
      </Card>

      {multiBranch && Object.keys(dirty).length > 0 && (
        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
          <Save className="h-3 w-3" /> لديك تغييرات غير محفوظة — اضغط أيقونة الحفظ بجانب كل صف معدّل.
        </p>
      )}
    </div>
  );
}
