/**
 * AccountDialog — create / edit ERP chart-of-account entry.
 *
 * Frontend operational contract. Writes through `accountOverlay`.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { accountOverlay, type AccountTypeKey } from "@/lib/accountOverlay";
import type { AccountRow } from "@/services/erp/accounting";
import { accountTypeLabel } from "@/lib/erpFormat";
import { AlertTriangle, Lightbulb } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  mode: "create" | "edit";
  accounts: (AccountRow & { meta?: any })[];
  /** When editing: the account being edited. When creating-child: pre-selected parent. */
  target?: AccountRow & { meta?: any };
  parentHint?: AccountRow & { meta?: any };
}

const types: AccountTypeKey[] = ["asset", "liability", "equity", "revenue", "expense"];

export function AccountDialog({ open, onClose, onSaved, mode, accounts, target, parentHint }: Props) {
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [type, setType] = useState<AccountTypeKey>("asset");
  const [parentId, setParentId] = useState<string>("");
  const [isPosting, setIsPosting] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [vatApplicable, setVatApplicable] = useState(false);
  const [costCenterApplicable, setCostCenterApplicable] = useState(false);
  const [notes, setNotes] = useState("");

  // hydrate
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && target) {
      setCode(target.code);
      setNameAr(target.name_ar);
      setNameEn(target.name_en ?? "");
      setType(target.type);
      const parent = accountOverlay.inferParent(target.code, accounts.filter(a => a.id !== target.id));
      setParentId(parent?.id ?? "");
      setIsPosting(target.meta?.is_posting ?? true);
      setIsActive(target.is_active);
      setVatApplicable(!!target.meta?.vat_applicable);
      setCostCenterApplicable(!!target.meta?.cost_center_applicable);
      setNotes(target.meta?.notes ?? "");
    } else {
      setCode(parentHint ? parentHint.code : "");
      setNameAr(""); setNameEn("");
      setType(parentHint?.type ?? "asset");
      setParentId(parentHint?.id ?? "");
      setIsPosting(true); setIsActive(true);
      setVatApplicable(false); setCostCenterApplicable(false);
      setNotes("");
    }
  }, [open, mode, target, parentHint]);

  const parent = useMemo(() => accounts.find(a => a.id === parentId) ?? null, [parentId, accounts]);

  // sync type from parent
  useEffect(() => {
    if (parent && mode === "create") setType(parent.type);
  }, [parent, mode]);

  const childCount = useMemo(() => {
    if (mode !== "edit" || !target) return 0;
    return accounts.filter(a => a.id !== target.id && a.code.length > target.code.length && a.code.startsWith(target.code)).length;
  }, [accounts, target, mode]);

  // validations
  const codeError = useMemo(() => {
    if (mode === "edit") return null;
    if (!code) return null;
    return accountOverlay.validateCode(code, accounts);
  }, [code, accounts, mode]);

  const parentMismatch = parent && parent.type !== type;
  const postingUnderHeader = mode === "create" && parent && childCount === 0 && !isPosting && false;
  const editPostingBlocked = mode === "edit" && childCount > 0 && isPosting;

  const canSave = !!nameAr.trim()
    && (mode === "edit" || (!!code && !codeError))
    && !parentMismatch
    && !editPostingBlocked;

  async function handleSave() {
    if (!canSave) return;
    if (mode === "create") {
      const parentSorted = accounts.filter(a => code.trim().startsWith(a.code) && a.code !== code.trim()).sort((a, b) => b.code.length - a.code.length)[0];
      const { error: insErr } = await supabase.from("accounts").insert({
        code: code.trim(), name_ar: nameAr.trim(), name_en: nameEn.trim() || null, type,
        nature: (type === "asset" || type === "expense") ? "debit" : "credit",
        is_posting: isPosting, is_vat: vatApplicable, cost_center: costCenterApplicable,
        is_archived: !isActive, notes: notes.trim() || null,
        level: code.length - 1, parent_id: parentSorted?.id ?? null,
      });
      if (insErr) { toast.error(insErr.message); return; }
      toast.success("تم إنشاء الحساب");
    } else if (target) {
      const { error: updErr } = await supabase.from("accounts").update({
        name_ar: nameAr.trim(), name_en: nameEn.trim() || null,
        is_archived: !isActive, is_posting: isPosting, is_vat: vatApplicable,
        cost_center: costCenterApplicable, notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", target.id);
      if (updErr) { toast.error(updErr.message); return; }
      toast.success("تم حفظ التغييرات");
    }
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "حساب جديد" : `تعديل: ${target?.code} — ${target?.name_ar}`}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-12 gap-3">
          {/* Parent */}
          <div className="col-span-12">
            <Label className="text-xs">الحساب الأب</Label>
            <Select value={parentId || "_none"} onValueChange={v => setParentId(v === "_none" ? "" : v)}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="بدون (حساب جذري)" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="_none">— بدون أب (جذر) —</SelectItem>
                {accounts
                  .filter(a => mode === "create" || a.id !== target?.id)
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono text-xs ml-2">{a.code}</span> {a.name_ar}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {parent && mode === "create" && (
              <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <Lightbulb className="h-3 w-3" /> سيتم وراثة النوع ({accountTypeLabel[parent.type]}) من الأب.
              </div>
            )}
          </div>

          {/* Code */}
          <div className="col-span-4">
            <Label className="text-xs">الكود</Label>
            <Input
              className="h-9 mt-1 font-mono"
              value={code}
              disabled={mode === "edit"}
              onChange={e => setCode(e.target.value)}
              placeholder={parent ? `${parent.code}…` : "1101"}
            />
            {codeError && (
              <div className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {codeError}
              </div>
            )}
          </div>

          {/* Type */}
          <div className="col-span-4">
            <Label className="text-xs">النوع</Label>
            <Select value={type} onValueChange={v => setType(v as AccountTypeKey)} disabled={!!parent && mode === "create"}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {types.map(t => <SelectItem key={t} value={t}>{accountTypeLabel[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            {parentMismatch && (
              <div className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> نوع الحساب يجب أن يطابق نوع الأب.
              </div>
            )}
          </div>

          {/* Active */}
          <div className="col-span-4 flex items-end">
            <div className="flex items-center justify-between w-full border rounded-md px-3 h-9">
              <Label className="text-xs">نشط</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          {/* Names */}
          <div className="col-span-6">
            <Label className="text-xs">الاسم (عربي) *</Label>
            <Input className="h-9 mt-1" value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder="مثال: الصندوق الرئيسي" />
          </div>
          <div className="col-span-6">
            <Label className="text-xs">الاسم (English)</Label>
            <Input className="h-9 mt-1" dir="ltr" value={nameEn} onChange={e => setNameEn(e.target.value)} placeholder="e.g. Main Cash" />
          </div>

          {/* Flags */}
          <div className="col-span-12 grid grid-cols-3 gap-2">
            <div className="border rounded-md px-3 py-2 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">حساب ترحيل</div>
                <div className="text-[10px] text-muted-foreground">يستقبل قيود مباشرة</div>
              </div>
              <Switch checked={isPosting} onCheckedChange={setIsPosting} disabled={childCount > 0} />
            </div>
            <div className="border rounded-md px-3 py-2 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">يتأثر بالضريبة</div>
                <div className="text-[10px] text-muted-foreground">VAT applicable</div>
              </div>
              <Switch checked={vatApplicable} onCheckedChange={setVatApplicable} />
            </div>
            <div className="border rounded-md px-3 py-2 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">مركز تكلفة</div>
                <div className="text-[10px] text-muted-foreground">Cost-center applicable</div>
              </div>
              <Switch checked={costCenterApplicable} onCheckedChange={setCostCenterApplicable} />
            </div>
          </div>

          {editPostingBlocked && (
            <div className="col-span-12 text-[11px] text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> لا يمكن تحويل حساب أب ({childCount} حساب فرعي) إلى حساب ترحيل.
            </div>
          )}

          {/* Notes */}
          <div className="col-span-12">
            <Label className="text-xs">ملاحظات</Label>
            <Textarea className="mt-1" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {mode === "create" ? "إنشاء" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




