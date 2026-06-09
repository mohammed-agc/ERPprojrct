/**
 * AccountDetermination — شاشة تحديد الحسابات (مستوى SAP)
 * يديرها المحاسب لربط مفاتيح العمليات بالحسابات تلقائياً
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Plus, Trash2, Save, Settings, AlertCircle, CheckCircle2 } from "lucide-react";

type DeterminationKey = {
  key_code: string;
  name_ar: string;
  name_en: string | null;
  category: string;
  account_type: string;
  description: string | null;
  uses_product: boolean;
  uses_payment: boolean;
  sort_order: number;
};

type AccountRow = {
  id: string;
  code: string;
  name_ar: string;
  type: string;
};

type AccountDetermination = {
  id: string;
  determination_key: string;
  account_id: string;
  product_type: string | null;
  payment_method: string | null;
  is_default: boolean;
  active: boolean;
  description: string | null;
  account?: { code: string; name_ar: string };
};

const CATEGORY_LABEL: Record<string, string> = {
  sales: "المبيعات",
  purchases: "المشتريات",
  treasury: "الخزينة",
  cogs: "تكلفة المبيعات",
  adjustment: "التسويات",
  inventory: "المخزون",
  tax: "الضرائب",
};

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  new_vehicle: "مركبة جديدة",
  used_vehicle: "مركبة مستعملة",
  part: "قطعة غيار",
  service: "خدمة",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "نقدي",
  bank: "تحويل بنكي",
  transfer: "تحويل",
  card: "شبكة/بطاقة",
  pos: "نقاط البيع",
};

export default function AccountDetermination() {
  const [keys, setKeys] = useState<DeterminationKey[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [determinations, setDeterminations] = useState<AccountDetermination[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("sales");
  const [editingKey, setEditingKey] = useState<DeterminationKey | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keysRes, accountsRes, determinationsRes] = await Promise.all([
        supabase.from("determination_keys").select("*").order("sort_order"),
        supabase.from("accounts").select("id, code, name_ar, type").eq("is_posting", true).eq("is_archived", false).order("code"),
        supabase.from("account_determinations").select("*, account:accounts(code, name_ar)").eq("active", true).order("determination_key"),
      ]);
      setKeys((keysRes.data ?? []) as DeterminationKey[]);
      setAccounts((accountsRes.data ?? []) as AccountRow[]);
      setDeterminations((determinationsRes.data ?? []) as AccountDetermination[]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => {
    const set = new Set(keys.map(k => k.category));
    return Array.from(set);
  }, [keys]);

  const filteredKeys = useMemo(
    () => keys.filter(k => k.category === activeCategory),
    [keys, activeCategory]
  );

  const getDeterminationsForKey = (keyCode: string) =>
    determinations.filter(d => d.determination_key === keyCode);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            تحديد الحسابات (Account Determination)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ربط مفاتيح العمليات المحاسبية بالحسابات المناسبة — مستوى SAP S/4HANA
          </p>
        </div>
        <Badge variant="outline" className="text-base px-3 py-1">
          {keys.length} مفتاح · {determinations.length} ربط
        </Badge>
      </div>

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${categories.length}, 1fr)` }}>
          {categories.map(cat => (
            <TabsTrigger key={cat} value={cat}>
              {CATEGORY_LABEL[cat] ?? cat}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map(cat => (
          <TabsContent key={cat} value={cat} className="space-y-4">
            {filteredKeys.map(key => {
              const keyDeterminations = getDeterminationsForKey(key.key_code);
              return (
                <Card key={key.key_code}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded">{key.key_code}</code>
                          {key.name_ar}
                        </CardTitle>
                        {key.description && (
                          <p className="text-sm text-muted-foreground mt-1">{key.description}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => { setEditingKey(key); setDialogOpen(true); }}
                      >
                        <Plus className="h-4 w-4 ml-2" /> إضافة ربط
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {keyDeterminations.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground text-sm flex items-center justify-center gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                        لا يوجد ربط — استخدم زر "إضافة ربط"
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>الحساب</TableHead>
                            {key.uses_product && <TableHead>نوع المنتج</TableHead>}
                            {key.uses_payment && <TableHead>طريقة الدفع</TableHead>}
                            <TableHead>افتراضي</TableHead>
                            <TableHead className="w-20">إجراء</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {keyDeterminations.map(d => (
                            <TableRow key={d.id}>
                              <TableCell>
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded ml-2">
                                  {d.account?.code}
                                </code>
                                {d.account?.name_ar}
                              </TableCell>
                              {key.uses_product && (
                                <TableCell>
                                  {d.product_type ? (
                                    <Badge variant="outline">{PRODUCT_TYPE_LABEL[d.product_type] ?? d.product_type}</Badge>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              )}
                              {key.uses_payment && (
                                <TableCell>
                                  {d.payment_method ? (
                                    <Badge variant="outline">{PAYMENT_METHOD_LABEL[d.payment_method] ?? d.payment_method}</Badge>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              )}
                              <TableCell>
                                {d.is_default ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-300">
                                    <CheckCircle2 className="h-3 w-3 ml-1" /> افتراضي
                                  </Badge>
                                ) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    if (!confirm("هل أنت متأكد من حذف هذا الربط؟")) return;
                                    const { error } = await supabase.from("account_determinations").delete().eq("id", d.id);
                                    if (error) { toast.error(error.message); return; }
                                    toast.success("تم الحذف");
                                    load();
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>

      {editingKey && (
        <AddDeterminationDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditingKey(null); }}
          determinationKey={editingKey}
          accounts={accounts}
          onSaved={load}
        />
      )}
    </div>
  );
}

function AddDeterminationDialog({
  open, onClose, determinationKey, accounts, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  determinationKey: DeterminationKey;
  accounts: AccountRow[];
  onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [productType, setProductType] = useState<string>("none");
  const [paymentMethod, setPaymentMethod] = useState<string>("none");
  const [isDefault, setIsDefault] = useState(false);
  const [description, setDescription] = useState("");

  const filteredAccounts = useMemo(
    () => accounts.filter(a => a.type === determinationKey.account_type),
    [accounts, determinationKey.account_type]
  );

  const handleSave = async () => {
    if (!accountId) { toast.error("يجب اختيار حساب"); return; }
    const { error } = await supabase.from("account_determinations").insert({
      determination_key: determinationKey.key_code,
      account_id: accountId,
      product_type: productType === "none" ? null : productType,
      payment_method: paymentMethod === "none" ? null : paymentMethod,
      is_default: isDefault,
      description: description.trim() || null,
      active: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحفظ");
    onSaved();
    onClose();
    setAccountId("");
    setProductType("none");
    setPaymentMethod("none");
    setIsDefault(false);
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة ربط جديد: {determinationKey.name_ar}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium mb-1 block">الحساب *</label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="اختر حساب..." /></SelectTrigger>
              <SelectContent>
                {filteredAccounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              يُعرض فقط حسابات نوع: {determinationKey.account_type}
            </p>
          </div>

          {determinationKey.uses_product && (
            <div>
              <label className="text-sm font-medium mb-1 block">نوع المنتج</label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— أي نوع —</SelectItem>
                  <SelectItem value="new_vehicle">مركبة جديدة</SelectItem>
                  <SelectItem value="used_vehicle">مركبة مستعملة</SelectItem>
                  <SelectItem value="part">قطعة غيار</SelectItem>
                  <SelectItem value="service">خدمة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {determinationKey.uses_payment && (
            <div>
              <label className="text-sm font-medium mb-1 block">طريقة الدفع</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— أي طريقة —</SelectItem>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="bank">تحويل بنكي</SelectItem>
                  <SelectItem value="transfer">تحويل</SelectItem>
                  <SelectItem value="card">شبكة/بطاقة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="isDefault" className="text-sm">
              اجعله الافتراضي (يُستخدم عند عدم تطابق المعايير)
            </label>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">وصف (اختياري)</label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="وصف توضيحي..."
            />
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
