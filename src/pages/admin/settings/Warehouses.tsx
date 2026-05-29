import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminSettings, type Warehouse } from "@/services/erp/adminSettings";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function SettingsWarehouses() {
  const settings = adminSettings.get();
  const [list, setList] = useState<Warehouse[]>(() => settings.warehouses);
  const branches = settings.branches;

  const save = () => { adminSettings.saveWarehouses(list); toast.success("تم حفظ المستودعات"); };
  const add = () => setList(p => [...p, { id: crypto.randomUUID(), code: "", name_ar: "", branch_id: branches[0]?.id ?? null, type: "mixed", is_active: true }]);
  const update = (i: number, patch: Partial<Warehouse>) => setList(p => p.map((w, idx) => idx === i ? { ...w, ...patch } : w));
  const remove = (i: number) => setList(p => p.filter((_, idx) => idx !== i));

  return (
    <div>
      <PageHeader title="المستودعات" subtitle="إدارة مستودعات الشركة (مركبات، قطع غيار، مختلط)" actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={add} size="sm"><Plus className="h-3.5 w-3.5 me-1" />إضافة مستودع</Button>
          <Button onClick={save} size="sm">حفظ</Button>
        </div>
      } />
      <Card className="p-0 overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr><th>الكود</th><th>الاسم</th><th>الفرع</th><th>النوع</th><th>نشط</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((w, i) => (
              <tr key={w.id}>
                <td><Input value={w.code} onChange={e => update(i, { code: e.target.value })} className="h-8 font-mono" /></td>
                <td><Input value={w.name_ar} onChange={e => update(i, { name_ar: e.target.value })} className="h-8" /></td>
                <td>
                  <Select value={w.branch_id ?? ""} onValueChange={v => update(i, { branch_id: v || null })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td>
                  <Select value={w.type} onValueChange={(v) => update(i, { type: v as Warehouse["type"] })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vehicles">مركبات</SelectItem>
                      <SelectItem value="parts">قطع غيار</SelectItem>
                      <SelectItem value="mixed">مختلط</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td><Switch checked={w.is_active} onCheckedChange={(v) => update(i, { is_active: v })} /></td>
                <td><Button variant="ghost" size="icon" onClick={() => remove(i)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="text-center text-muted-foreground py-6">لا توجد مستودعات</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
