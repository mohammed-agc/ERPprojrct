import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Power, Pencil } from "lucide-react";
import { toast } from "sonner";
import { colorsService, type VehicleColor } from "@/services/erp/masterData";

export default function ColorsMaster() {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const colors = useMemo(() => colorsService.list(), [tick]);
  const [editing, setEditing] = useState<VehicleColor | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="p-4 lg:p-6 space-y-4" dir="rtl">
      <PageHeader title="الألوان الرئيسية (Vehicle Color Master)" subtitle="قائمة موحدة للألوان — لا يُسمح بكتابة لون يدوياً في أي وثيقة" />

      <div className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{colors.length} لون</div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-3.5 w-3.5 ml-1" /> لون جديد
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table text-xs">
          <thead>
            <tr><th>الكود</th><th>اللون</th><th>الاسم (عربي)</th><th>الاسم (إنجليزي)</th><th>الكود اللوني</th><th>الحالة</th><th className="w-[100px]">إجراءات</th></tr>
          </thead>
          <tbody>
            {colors.map(c => (
              <tr key={c.id} className={!c.active ? "opacity-50" : ""}>
                <td className="font-mono">{c.code}</td>
                <td>{c.hex && <span className="inline-block h-5 w-5 rounded border border-border" style={{ background: c.hex }} />}</td>
                <td className="font-semibold">{c.name_ar}</td>
                <td>{c.name_en ?? "—"}</td>
                <td className="font-mono">{c.hex ?? "—"}</td>
                <td>{c.active ? <Badge className="bg-success/15 text-success">نشط</Badge> : <Badge variant="outline">معطّل</Badge>}</td>
                <td>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { colorsService.toggleActive(c.id); refresh(); }}><Power className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ColorDialog open={open} onOpenChange={setOpen} color={editing} onSaved={refresh} />
    </div>
  );
}

function ColorDialog({ open, onOpenChange, color, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; color: VehicleColor | null; onSaved: () => void;
}) {
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [hex, setHex] = useState("#000000");

  useMemo(() => {
    if (open) {
      setNameAr(color?.name_ar ?? "");
      setNameEn(color?.name_en ?? "");
      setHex(color?.hex ?? "#000000");
    }
  }, [open, color]);

  const submit = () => {
    if (!nameAr.trim()) return toast.error("أدخل اسم اللون بالعربية");
    if (color) {
      colorsService.update(color.id, { name_ar: nameAr.trim(), name_en: nameEn.trim() || undefined, hex });
      toast.success("تم تحديث اللون");
    } else {
      const c = colorsService.create({ name_ar: nameAr.trim(), name_en: nameEn.trim() || undefined, hex });
      toast.success(`تم إنشاء ${c.code}`);
    }
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>{color ? `تعديل ${color.code}` : "لون جديد"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-xs">
          <div><Label className="text-xs">الاسم (عربي) *</Label><Input value={nameAr} onChange={e => setNameAr(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">الاسم (إنجليزي)</Label><Input value={nameEn} onChange={e => setNameEn(e.target.value)} className="h-9" /></div>
          <div>
            <Label className="text-xs">الكود اللوني</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={hex} onChange={e => setHex(e.target.value)} className="h-9 w-12 rounded border border-border" />
              <Input value={hex} onChange={e => setHex(e.target.value)} className="h-9 flex-1 font-mono" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit}>{color ? "حفظ" : "إنشاء"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
