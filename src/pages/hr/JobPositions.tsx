/**
 * JobPositions — إدارة المسميات الوظيفية
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Briefcase, Edit, Trash2, Save, Search } from "lucide-react";

const LEVEL_LABEL: Record<string, string> = {
  executive: "تنفيذي",
  manager: "مدير",
  senior: "أول",
  junior: "مبتدئ",
  entry: "حديث التخرج",
};

const LEVEL_COLOR: Record<string, string> = {
  executive: "bg-purple-500/10 text-purple-700 border-purple-300",
  manager: "bg-blue-500/10 text-blue-700 border-blue-300",
  senior: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  junior: "bg-amber-500/10 text-amber-700 border-amber-300",
  entry: "bg-slate-500/10 text-slate-700 border-slate-300",
};

const NITAQAT_LABEL: Record<string, string> = {
  platinum: "بلاتيني",
  green: "أخضر",
  yellow: "أصفر",
  red: "أحمر",
};

export default function JobPositions() {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("job_positions")
      .select("*")
      .order("level")
      .order("title_ar");
    if (error) toast.error(error.message);
    else setPositions(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = positions;
    if (levelFilter !== "all") list = list.filter(p => p.level === levelFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(p =>
        p.code.toLowerCase().includes(s) ||
        p.title_ar.includes(search) ||
        (p.title_en?.toLowerCase().includes(s) ?? false)
      );
    }
    return list;
  }, [positions, search, levelFilter]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`حذف المنصب "${title}"؟`)) return;
    const { error } = await supabase.from("job_positions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    load();
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6" />
            المسميات الوظيفية
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {positions.length} مسمى وظيفي · متوافق مع نطاقات السعودة
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 ml-2" /> منصب جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
            </div>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المستويات</SelectItem>
                <SelectItem value="executive">تنفيذي</SelectItem>
                <SelectItem value="manager">مدير</SelectItem>
                <SelectItem value="senior">أول</SelectItem>
                <SelectItem value="junior">مبتدئ</SelectItem>
                <SelectItem value="entry">حديث التخرج</SelectItem>
              </SelectContent>
            </Select>
            <div className="self-center text-sm text-muted-foreground">عرض {filtered.length} من {positions.length}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/60 z-10">
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>المسمى العربي</TableHead>
                <TableHead>الإنجليزي</TableHead>
                <TableHead>المستوى</TableHead>
                <TableHead>نطاقات</TableHead>
                <TableHead>السعودة</TableHead>
                <TableHead>أدنى راتب</TableHead>
                <TableHead>أعلى راتب</TableHead>
                <TableHead className="w-20">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.code}</code></TableCell>
                  <TableCell className="font-medium">{p.title_ar}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.title_en ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={LEVEL_COLOR[p.level] ?? ""}>
                      {LEVEL_LABEL[p.level] ?? p.level}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.nitaqat_category ? NITAQAT_LABEL[p.nitaqat_category] : "—"}</TableCell>
                  <TableCell>
                    {p.is_saudization_eligible ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700">يحتسب</Badge>
                    ) : (
                      <Badge variant="outline">لا</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{p.min_salary?.toLocaleString('en-US') ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{p.max_salary?.toLocaleString('en-US') ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setDialogOpen(true); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id, p.title_ar)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dialogOpen && (
        <PositionDialog
          position={editing}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function PositionDialog({ position, open, onClose, onSaved }: any) {
  const isEdit = !!position;
  const [code, setCode] = useState(position?.code ?? "");
  const [titleAr, setTitleAr] = useState(position?.title_ar ?? "");
  const [titleEn, setTitleEn] = useState(position?.title_en ?? "");
  const [level, setLevel] = useState(position?.level ?? "junior");
  const [nitaqat, setNitaqat] = useState(position?.nitaqat_category ?? "green");
  const [isSaudization, setIsSaudization] = useState(position?.is_saudization_eligible ?? true);
  const [minSalary, setMinSalary] = useState(position?.min_salary ?? 0);
  const [maxSalary, setMaxSalary] = useState(position?.max_salary ?? 0);
  const [description, setDescription] = useState(position?.description ?? "");

  const handleSave = async () => {
    if (!code.trim() || !titleAr.trim()) { toast.error("الكود والمسمى العربي مطلوبان"); return; }
    const payload = {
      code: code.trim().toUpperCase(),
      title_ar: titleAr.trim(),
      title_en: titleEn.trim() || null,
      level,
      nitaqat_category: nitaqat,
      is_saudization_eligible: isSaudization,
      min_salary: Number(minSalary) || null,
      max_salary: Number(maxSalary) || null,
      description: description.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from("job_positions").update(payload).eq("id", position.id)
      : await supabase.from("job_positions").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(isEdit ? "تم الحفظ" : "تم الإنشاء");
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل المسمى" : "مسمى وظيفي جديد"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">الكود *</label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="POS-001" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">المستوى</label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="executive">تنفيذي</SelectItem>
                  <SelectItem value="manager">مدير</SelectItem>
                  <SelectItem value="senior">أول</SelectItem>
                  <SelectItem value="junior">مبتدئ</SelectItem>
                  <SelectItem value="entry">حديث التخرج</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">المسمى بالعربي *</label>
            <Input value={titleAr} onChange={e => setTitleAr(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">المسمى بالإنجليزي</label>
            <Input value={titleEn} onChange={e => setTitleEn(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">تصنيف نطاقات</label>
              <Select value={nitaqat} onValueChange={setNitaqat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="platinum">بلاتيني</SelectItem>
                  <SelectItem value="green">أخضر</SelectItem>
                  <SelectItem value="yellow">أصفر</SelectItem>
                  <SelectItem value="red">أحمر</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isSaudization} onChange={e => setIsSaudization(e.target.checked)} />
                يحتسب في السعودة
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">أدنى راتب</label>
              <Input type="number" value={minSalary} onChange={e => setMinSalary(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">أعلى راتب</label>
              <Input type="number" value={maxSalary} onChange={e => setMaxSalary(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">الوصف</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave}><Save className="h-4 w-4 ml-2" /> {isEdit ? "حفظ" : "إنشاء"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
