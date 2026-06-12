import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { costing, type FinancialDimension, type DimensionValue, dimensionTypeLabel } from "@/services/erp/costing";
import { Plus } from "lucide-react";

export default function FinancialDimensions() {
  const [dims, setDims] = useState<FinancialDimension[]>([]);
  const [values, setValues] = useState<DimensionValue[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newVal, setNewVal] = useState({ code: "", name_ar: "" });

  const refresh = async () => {
    const d = await costing.listDimensions(); setDims(d);
    setValues(await costing.listValues());
    if (!selected && d.length) setSelected(d[0].id);
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const dim = dims.find(d => d.id === selected);
  const dimValues = useMemo(() => values.filter(v => v.dimension_id === selected), [values, selected]);

  const toggle = async (d: FinancialDimension, field: "is_active" | "is_required") => {
    await costing.saveDimension({ ...d, [field]: !d[field] });
    refresh();
  };
  const addValue = async () => {
    if (!selected || !newVal.code || !newVal.name_ar) return;
    await costing.saveValue({ id: "", dimension_id: selected, code: newVal.code, name_ar: newVal.name_ar, is_active: true });
    setNewVal({ code: "", name_ar: "" }); refresh();
  };

  return (
    <div>
      <PageHeader title="الأبعاد المالية" subtitle="أبعاد التحليل المالي متعدد المحاور (فرع، قسم، مشروع، قناة…)" sticky />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-2 bg-card border rounded-md overflow-hidden">
          <div className="bg-muted/40 px-3 py-2 text-xs font-semibold">الأبعاد المعرّفة</div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-right p-2">الاسم</th>
                <th className="text-right p-2">النوع</th>
                <th className="text-center p-2">إلزامي</th>
                <th className="text-center p-2">نشط</th>
              </tr>
            </thead>
            <tbody>
              {dims.map(d => (
                <tr key={d.id} onClick={() => setSelected(d.id)}
                    className={`border-t cursor-pointer hover:bg-muted/30 ${selected === d.id ? "bg-accent/40" : ""}`}>
                  <td className="p-2">
                    <div className="font-medium">{d.name_ar}</div>
                    <div className="text-[11.5px] text-muted-foreground font-mono">{d.code}</div>
                  </td>
                  <td className="p-2"><Badge variant="outline" className="text-[11.5px]">{dimensionTypeLabel[d.type]}</Badge></td>
                  <td className="p-2 text-center"><Switch checked={d.is_required} onCheckedChange={() => toggle(d, "is_required")} /></td>
                  <td className="p-2 text-center"><Switch checked={d.is_active} onCheckedChange={() => toggle(d, "is_active")} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-3 bg-card border rounded-md overflow-hidden">
          <div className="bg-muted/40 px-3 py-2 text-xs font-semibold flex items-center justify-between">
            <span>قيم البعد {dim ? `— ${dim.name_ar}` : ""}</span>
            <span className="text-muted-foreground">{dimValues.length} قيمة</span>
          </div>

          {dim && (
            <div className="p-2 border-b flex gap-2">
              <Input className="h-7 max-w-[120px] font-mono" placeholder="الكود" value={newVal.code}
                     onChange={e => setNewVal({ ...newVal, code: e.target.value.toUpperCase() })} />
              <Input className="h-7" placeholder="الاسم بالعربية" value={newVal.name_ar}
                     onChange={e => setNewVal({ ...newVal, name_ar: e.target.value })} />
              <Button size="sm" onClick={addValue}><Plus className="h-3.5 w-3.5 ml-1" />إضافة</Button>
            </div>
          )}

          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-right p-2 w-32">الكود</th>
                <th className="text-right p-2">الاسم</th>
                <th className="text-center p-2 w-24">نشط</th>
              </tr>
            </thead>
            <tbody>
              {dimValues.map(v => (
                <tr key={v.id} className="border-t">
                  <td className="p-2 font-mono text-xs">{v.code}</td>
                  <td className="p-2">{v.name_ar}</td>
                  <td className="p-2 text-center">
                    <Switch checked={v.is_active} onCheckedChange={async () => { await costing.saveValue({ ...v, is_active: !v.is_active }); refresh(); }} />
                  </td>
                </tr>
              ))}
              {!dimValues.length && (
                <tr><td colSpan={3} className="text-center text-muted-foreground py-6 text-xs">لا توجد قيم بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[12px] text-muted-foreground mt-3">
        ستتم ربط هذه الأبعاد بسطور قيود اليومية والفواتير لاحقاً لتمكين التحليل متعدد الأبعاد على مستوى كل حركة محاسبية.
      </div>
    </div>
  );
}
