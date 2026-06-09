/**
 * AccountGroups — مجموعات الحسابات (مستوى SAP FSV)
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Save, Layers, CheckCircle2, Search } from "lucide-react";

type AccountGroup = {
  id: string;
  group_code: string;
  name_ar: string;
  name_en: string | null;
  account_type: string;
  description: string | null;
  active: boolean;
};

type AccountRow = {
  id: string;
  code: string;
  name_ar: string;
  type: string;
};

type GroupMember = {
  group_id: string;
  account_id: string;
  is_default: boolean;
  account?: { code: string; name_ar: string };
};

const TYPE_LABEL: Record<string, string> = {
  asset: "أصل",
  liability: "التزام",
  equity: "حقوق ملكية",
  revenue: "إيراد",
  expense: "مصروف",
};

const TYPE_COLOR: Record<string, string> = {
  asset: "bg-blue-500/10 text-blue-700 border-blue-300",
  liability: "bg-amber-500/10 text-amber-700 border-amber-300",
  equity: "bg-purple-500/10 text-purple-700 border-purple-300",
  revenue: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  expense: "bg-rose-500/10 text-rose-700 border-rose-300",
};

export default function AccountGroups() {
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<AccountGroup | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [groupsRes, accountsRes, membersRes] = await Promise.all([
        supabase.from("account_groups").select("*").order("group_code"),
        supabase.from("accounts").select("id, code, name_ar, type").eq("is_posting", true).eq("is_archived", false).order("code"),
        supabase.from("account_group_members").select("*, account:accounts(code, name_ar)"),
      ]);
      setGroups((groupsRes.data ?? []) as AccountGroup[]);
      setAccounts((accountsRes.data ?? []) as AccountRow[]);
      setMembers((membersRes.data ?? []) as GroupMember[]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const s = search.toLowerCase();
    return groups.filter(g => 
      g.group_code.toLowerCase().includes(s) ||
      g.name_ar.includes(search) ||
      (g.name_en?.toLowerCase().includes(s) ?? false)
    );
  }, [groups, search]);

  const getMembersForGroup = (groupId: string) =>
    members.filter(m => m.group_id === groupId);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6" />
            مجموعات الحسابات (Account Groups)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تجميع الحسابات الشبيهة لتسهيل التقارير والتحديد التلقائي
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-base px-3 py-1">
            {groups.length} مجموعة · {members.length} عضو
          </Badge>
          <Button onClick={() => setNewGroupOpen(true)}>
            <Plus className="h-4 w-4 ml-2" /> مجموعة جديدة
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pr-10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredGroups.map(group => {
          const groupMembers = getMembersForGroup(group.id);
          return (
            <Card key={group.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded">{group.group_code}</code>
                      {group.name_ar}
                      <Badge variant="outline" className={TYPE_COLOR[group.account_type]}>
                        {TYPE_LABEL[group.account_type]}
                      </Badge>
                    </CardTitle>
                    {group.description && (
                      <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelectedGroup(group); setAddMemberOpen(true); }}
                  >
                    <Plus className="h-3.5 w-3.5 ml-1" /> إضافة
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {groupMembers.length === 0 ? (
                  <div className="text-center py-3 text-sm text-muted-foreground">
                    لا يوجد حسابات في هذه المجموعة
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {groupMembers.map(m => (
                      <div key={m.account_id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.account?.code}</code>
                          <span className="text-sm">{m.account?.name_ar}</span>
                          {m.is_default && (
                            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-300 h-5 text-xs">
                              <CheckCircle2 className="h-3 w-3 ml-1" /> افتراضي
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={async () => {
                            if (!confirm("إزالة هذا الحساب من المجموعة؟")) return;
                            const { error } = await supabase
                              .from("account_group_members")
                              .delete()
                              .eq("group_id", m.group_id)
                              .eq("account_id", m.account_id);
                            if (error) { toast.error(error.message); return; }
                            toast.success("تمت الإزالة");
                            load();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedGroup && (
        <AddMemberDialog
          open={addMemberOpen}
          onClose={() => { setAddMemberOpen(false); setSelectedGroup(null); }}
          group={selectedGroup}
          accounts={accounts.filter(a => a.type === selectedGroup.account_type)}
          existingMembers={getMembersForGroup(selectedGroup.id)}
          onSaved={load}
        />
      )}

      <NewGroupDialog
        open={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        onSaved={load}
      />
    </div>
  );
}

function AddMemberDialog({
  open, onClose, group, accounts, existingMembers, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  group: AccountGroup;
  accounts: AccountRow[];
  existingMembers: GroupMember[];
  onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const availableAccounts = accounts.filter(
    a => !existingMembers.some(m => m.account_id === a.id)
  );

  const handleSave = async () => {
    if (!accountId) { toast.error("يجب اختيار حساب"); return; }
    const { error } = await supabase.from("account_group_members").insert({
      group_id: group.id,
      account_id: accountId,
      is_default: isDefault,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تمت الإضافة");
    onSaved();
    onClose();
    setAccountId("");
    setIsDefault(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة حساب إلى: {group.name_ar}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium mb-1 block">الحساب *</label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="اختر حساب..." /></SelectTrigger>
              <SelectContent>
                {availableAccounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              يُعرض فقط حسابات نوع: {TYPE_LABEL[group.account_type]} (غير المضافة)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefaultMember"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="isDefaultMember" className="text-sm">
              اجعله الحساب الافتراضي للمجموعة
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 ml-2" /> حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewGroupDialog({
  open, onClose, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [groupCode, setGroupCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [accountType, setAccountType] = useState("asset");
  const [description, setDescription] = useState("");

  const handleSave = async () => {
    if (!groupCode.trim() || !nameAr.trim()) {
      toast.error("الكود والاسم العربي مطلوبان"); return;
    }
    const { error } = await supabase.from("account_groups").insert({
      group_code: groupCode.trim().toUpperCase().replace(/\s+/g, '_'),
      name_ar: nameAr.trim(),
      name_en: nameEn.trim() || null,
      account_type: accountType,
      description: description.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء المجموعة");
    onSaved();
    onClose();
    setGroupCode(""); setNameAr(""); setNameEn("");
    setAccountType("asset"); setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>مجموعة حسابات جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div>
            <label className="text-sm font-medium mb-1 block">الكود * (مثل: BANK_USD)</label>
            <Input value={groupCode} onChange={e => setGroupCode(e.target.value)} placeholder="GROUP_CODE" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">الاسم العربي *</label>
            <Input value={nameAr} onChange={e => setNameAr(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">الاسم الإنجليزي</label>
            <Input value={nameEn} onChange={e => setNameEn(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">نوع الحسابات *</label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asset">أصل</SelectItem>
                <SelectItem value="liability">التزام</SelectItem>
                <SelectItem value="equity">حقوق ملكية</SelectItem>
                <SelectItem value="revenue">إيراد</SelectItem>
                <SelectItem value="expense">مصروف</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">الوصف</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 ml-2" /> إنشاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
