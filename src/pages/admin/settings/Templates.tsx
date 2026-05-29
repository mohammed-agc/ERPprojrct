import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { adminSettings, type PrintTemplate } from "@/services/erp/adminSettings";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = {
  SI: "فاتورة بيع", PI: "فاتورة شراء", PO: "أمر شراء", GRN: "إشعار استلام", RC: "سند قبض", PY: "سند صرف",
};

export default function SettingsTemplates() {
  const [list, setList] = useState<PrintTemplate[]>(() => adminSettings.get().templates);

  const save = () => { adminSettings.saveTemplates(list); toast.success("تم حفظ قوالب الطباعة"); };
  const update = (i: number, patch: Partial<PrintTemplate>) => setList(p => p.map((t, idx) => idx === i ? { ...t, ...patch } : t));

  return (
    <div>
      <PageHeader title="قوالب الطباعة" subtitle="ترويسة وتذييل كل مستند وخيارات العرض" actions={
        <Button onClick={save} size="sm">حفظ</Button>
      } />
      <div className="space-y-3">
        {list.map((t, i) => (
          <Card key={t.doc_type} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="font-mono text-xs font-bold bg-muted px-2 py-0.5 rounded">{t.doc_type}</div>
              <div className="font-bold text-sm">{TYPE_LABELS[t.doc_type] ?? t.doc_type}</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">نص الترويسة</Label>
                <Input value={t.header_text} onChange={e => update(i, { header_text: e.target.value })} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نص التذييل</Label>
                <Input value={t.footer_text} onChange={e => update(i, { footer_text: e.target.value })} className="h-9" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={t.show_logo} onCheckedChange={v => update(i, { show_logo: v })} />
                <Label className="text-xs cursor-pointer">إظهار الشعار</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={t.show_vat} onCheckedChange={v => update(i, { show_vat: v })} />
                <Label className="text-xs cursor-pointer">إظهار رقم التسجيل الضريبي</Label>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
