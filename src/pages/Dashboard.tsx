import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Car, Users, Receipt, Calculator } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface Stat { label: string; value: string | number; icon: any; hint?: string; }

export default function Dashboard() {
  const { profile, department } = useAuth();
  const [stats, setStats] = useState<Stat[]>([]);

  useEffect(() => {
    (async () => {
      const [v, c, o, j] = await Promise.all([
        supabase.from("vehicles").select("id, status", { count: "exact", head: false }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("sales_orders").select("id, total", { count: "exact", head: false }),
        supabase.from("journal_entries").select("id", { count: "exact", head: true }),
      ]);
      const available = (v.data ?? []).filter((x: any) => x.status === "available").length;
      const totalSales = (o.data ?? []).reduce((s: number, x: any) => s + Number(x.total || 0), 0);
      setStats([
        { label: "المركبات المتوفرة", value: available, icon: Car, hint: `من إجمالي ${v.count ?? 0}` },
        { label: "العملاء", value: c.count ?? 0, icon: Users },
        { label: "إجمالي المبيعات", value: totalSales.toLocaleString("ar-SA", { maximumFractionDigits: 2 }) + " ر.س", icon: Receipt, hint: `${o.count ?? 0} طلب` },
        { label: "قيود اليومية", value: j.count ?? 0, icon: Calculator },
      ]);
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title={`مرحباً، ${profile?.full_name ?? ""}`}
        subtitle={department?.name_ar ? `لوحة معلومات قسم ${department.name_ar}` : "لوحة المعلومات العامة"}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-medium">{s.label}</div>
                  <div className="text-2xl font-bold text-foreground mt-1 num">{s.value}</div>
                  {s.hint && <div className="text-[11px] text-muted-foreground mt-1">{s.hint}</div>}
                </div>
                <div className="h-9 w-9 rounded-md bg-accent text-accent-foreground flex items-center justify-center">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="font-semibold text-foreground mb-3">سير العمل في النظام</h3>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>• إنشاء عميل وتسجيل بياناته الضريبية</li>
            <li>• إضافة مركبة بمواصفاتها الكاملة (VIN، موديل، سنة)</li>
            <li>• إنشاء أمر بيع وإضافة بنوده القابلة للتحرير</li>
            <li>• تأكيد الأمر وإصدار فاتورة ضريبية مع QR ZATCA</li>
            <li>• ترحيل القيد المحاسبي تلقائياً (مدين/دائن)</li>
          </ol>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="font-semibold text-foreground mb-3">ضريبة القيمة المضافة</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            النظام يطبّق ضريبة القيمة المضافة السعودية بنسبة <span className="font-semibold text-foreground">15%</span> تلقائياً
            على بنود البيع، ويفصلها في حسابات منفصلة (مدخلات / مستحقة) وفقاً لمتطلبات
            هيئة الزكاة والضريبة والجمارك.
          </p>
        </div>
      </div>
    </div>
  );
}
