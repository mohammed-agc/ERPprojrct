import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adminSettings, type NumberSequence } from "@/services/erp/adminSettings";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = {
  PR: "طلب شراء", PO: "أمر شراء", GRN: "إشعار استلام", PI: "فاتورة شراء",
  SO: "أمر بيع", SI: "فاتورة بيع", RC: "سند قبض", PY: "سند صرف",
};

export default function SettingsSequences() {
  const [list, setList] = useState<NumberSequence[]>(() => adminSettings.get().sequences);

  const save = () => { adminSettings.saveSequences(list); toast.success("تم حفظ تسلسل المستندات"); };
  const update = (i: number, patch: Partial<NumberSequence>) => setList(p => p.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  return (
    <div>
      <PageHeader title="تسلسل المستندات" subtitle="بادئة ورقم بداية وطول الترقيم لكل نوع مستند" actions={
        <Button onClick={save} size="sm">حفظ</Button>
      } />
      <Card className="p-0 overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr><th>النوع</th><th>الوصف</th><th>البادئة</th><th>رقم البداية</th><th>طول الرقم</th><th>عيّنة</th></tr>
          </thead>
          <tbody>
            {list.map((s, i) => (
              <tr key={s.doc_type}>
                <td className="font-mono text-xs font-bold">{s.doc_type}</td>
                <td>{TYPE_LABELS[s.doc_type] ?? s.doc_type}</td>
                <td className="w-28"><Input value={s.prefix} onChange={e => update(i, { prefix: e.target.value })} className="h-8 font-mono" dir="ltr" /></td>
                <td className="w-28"><Input type="number" value={s.start} onChange={e => update(i, { start: Number(e.target.value) })} className="h-8 font-mono" dir="ltr" /></td>
                <td className="w-24"><Input type="number" value={s.length} onChange={e => update(i, { length: Number(e.target.value) })} className="h-8 font-mono" dir="ltr" /></td>
                <td className="font-mono text-xs text-muted-foreground">{s.prefix}{String(s.start).padStart(s.length, "0")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
