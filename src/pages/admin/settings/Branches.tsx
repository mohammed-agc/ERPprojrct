import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { adminSettings, type Branch } from "@/services/erp/adminSettings";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function SettingsBranches() {
  const [list, setList] = useState<Branch[]>(() => adminSettings.get().branches);

  const save = () => { adminSettings.saveBranches(list); toast.success("تم حفظ الفروع"); };
  const add = () => setList(p => [...p, { id: crypto.randomUUID(), code: "", name_ar: "", city: "", phone: "", is_active: true }]);
  const update = (i: number, patch: Partial<Branch>) => setList(p => p.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  const remove = (i: number) => setList(p => p.filter((_, idx) => idx !== i));

  return (
    <div>
      <PageHeader title="الفروع" subtitle="إدارة فروع الشركة" actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={add} size="sm"><Plus className="h-3.5 w-3.5 me-1" />إضافة فرع</Button>
          <Button onClick={save} size="sm">حفظ</Button>
        </div>
      } />
      <Card className="p-0 overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr><th>الكود</th><th>الاسم</th><th>المدينة</th><th>الهاتف</th><th>نشط</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((b, i) => (
              <tr key={b.id}>
                <td><Input value={b.code} onChange={e => update(i, { code: e.target.value })} className="h-8 font-mono" /></td>
                <td><Input value={b.name_ar} onChange={e => update(i, { name_ar: e.target.value })} className="h-8" /></td>
                <td><Input value={b.city} onChange={e => update(i, { city: e.target.value })} className="h-8" /></td>
                <td><Input value={b.phone} onChange={e => update(i, { phone: e.target.value })} className="h-8" dir="ltr" /></td>
                <td><Switch checked={b.is_active} onCheckedChange={(v) => update(i, { is_active: v })} /></td>
                <td><Button variant="ghost" size="icon" onClick={() => remove(i)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="text-center text-muted-foreground py-6">لا توجد فروع</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
