import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronLeft, Plus, Search, Trash2, Pencil } from "lucide-react";
import { costing, type CostCenter, type CenterKind, centerKindLabel, centerKindColor } from "@/services/erp/costing";
import { fmtCompact } from "@/lib/erpFormat";

interface TreeNode { center: CostCenter; children: TreeNode[]; }

const buildTree = (list: CostCenter[]): TreeNode[] => {
  const map = new Map<string, TreeNode>();
  list.forEach(c => map.set(c.id, { center: c, children: [] }));
  const roots: TreeNode[] = [];
  list.forEach(c => {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id)!.children.push(node);
    else roots.push(node);
  });
  return roots;
};

const emptyCenter: CostCenter = {
  id: "", code: "", name_ar: "", parent_id: null, kind: "cost", status: "active",
};

function CenterDialog({ open, onOpenChange, initial, parents, onSave }: {
  open: boolean; onOpenChange: (b: boolean) => void;
  initial: CostCenter; parents: CostCenter[]; onSave: (c: CostCenter) => void;
}) {
  const [c, setC] = useState<CostCenter>(initial);
  useEffect(() => setC(initial), [initial, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>{initial.id ? "تعديل مركز التكلفة" : "مركز تكلفة جديد"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>الكود</Label><Input value={c.code} onChange={e => setC({ ...c, code: e.target.value })} /></div>
          <div><Label>الاسم</Label><Input value={c.name_ar} onChange={e => setC({ ...c, name_ar: e.target.value })} /></div>
          <div>
            <Label>النوع</Label>
            <Select value={c.kind} onValueChange={(v: CenterKind) => setC({ ...c, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(centerKindLabel) as CenterKind[]).map(k => (
                  <SelectItem key={k} value={k}>{centerKindLabel[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الأب</Label>
            <Select value={c.parent_id ?? "__none"} onValueChange={v => setC({ ...c, parent_id: v === "__none" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— لا يوجد —</SelectItem>
                {parents.filter(p => p.id !== c.id).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.code} — {p.name_ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>المدير</Label><Input value={c.manager ?? ""} onChange={e => setC({ ...c, manager: e.target.value })} /></div>
          <div><Label>الموازنة الشهرية</Label>
            <Input type="number" value={c.budget_monthly ?? 0}
                   onChange={e => setC({ ...c, budget_monthly: Number(e.target.value) || 0 })} />
          </div>
          <div className="col-span-2">
            <Label>الحالة</Label>
            <Select value={c.status} onValueChange={(v: any) => setC({ ...c, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">غير نشط</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={() => onSave(c)}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ node, depth, query, onEdit, onDelete }: {
  node: TreeNode; depth: number; query: string;
  onEdit: (c: CostCenter) => void; onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const c = node.center;
  const matches = !query || c.name_ar.includes(query) || c.code.includes(query);
  const childMatches = node.children.some(ch => ch.center.name_ar.includes(query) || ch.center.code.includes(query));
  if (query && !matches && !childMatches) return null;

  return (
    <>
      <tr className="border-b hover:bg-muted/30">
        <td className="py-2 px-2">
          <div className="flex items-center gap-1" style={{ paddingInlineStart: depth * 16 }}>
            {node.children.length > 0 ? (
              <button onClick={() => setOpen(!open)} className="p-0.5 hover:bg-muted rounded">
                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </button>
            ) : <span className="w-4" />}
            <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
            <span className="font-medium">{c.name_ar}</span>
          </div>
        </td>
        <td className="py-2 px-2">
          <Badge variant="outline" className={`text-[10px] ${centerKindColor[c.kind]}`}>{centerKindLabel[c.kind]}</Badge>
        </td>
        <td className="py-2 px-2 text-xs">{c.manager ?? "—"}</td>
        <td className="py-2 px-2 text-xs text-left tabular-nums">{c.budget_monthly ? fmtCompact(c.budget_monthly) : "—"}</td>
        <td className="py-2 px-2">
          <Badge variant={c.status === "active" ? "default" : "secondary"} className="text-[10px]">
            {c.status === "active" ? "نشط" : "متوقف"}
          </Badge>
        </td>
        <td className="py-2 px-2">
          <div className="flex gap-1 justify-end">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </td>
      </tr>
      {open && node.children.map(ch => (
        <Row key={ch.center.id} node={ch} depth={depth + 1} query={query} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  );
}

export default function CostCenters() {
  const [list, setList] = useState<CostCenter[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = () => costing.listCenters().then(setList);
  useEffect(() => { refresh(); }, []);
  const tree = useMemo(() => buildTree(list), [list]);

  return (
    <div>
      <PageHeader
        title="مراكز التكلفة"
        subtitle="الهيكل الهرمي لمراكز الإيراد والتكلفة والدعم والفروع"
        sticky
        actions={
          <Button size="sm" onClick={() => { setEditing({ ...emptyCenter }); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 ml-1" /> مركز جديد
          </Button>
        }
      />

      <div className="bg-card border rounded-md p-2 mb-3 flex items-center gap-2 sticky top-[60px] z-10">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input className="h-7 max-w-xs" placeholder="بحث بالاسم أو الكود…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="ms-auto text-xs text-muted-foreground">{list.length} مركز</div>
      </div>

      <div className="bg-card border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="text-right py-2 px-2 font-medium">الاسم</th>
              <th className="text-right py-2 px-2 font-medium">النوع</th>
              <th className="text-right py-2 px-2 font-medium">المدير</th>
              <th className="text-left py-2 px-2 font-medium">الموازنة الشهرية</th>
              <th className="text-right py-2 px-2 font-medium">الحالة</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {tree.map(n => <Row key={n.center.id} node={n} depth={0} query={query} onEdit={c => { setEditing(c); setOpen(true); }} onDelete={async id => { await costing.deleteCenter(id); refresh(); }} />)}
          </tbody>
        </table>
      </div>

      {editing && (
        <CenterDialog
          open={open}
          onOpenChange={setOpen}
          initial={editing}
          parents={list}
          onSave={async c => { await costing.saveCenter(c); setOpen(false); refresh(); }}
        />
      )}
    </div>
  );
}
