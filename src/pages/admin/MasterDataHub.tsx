import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Database, Car, Palette, Contact2, Building2, Tag, Layers } from "lucide-react";

const CARDS = [
  { to: "/master/products", label: "كتالوج المنتجات", icon: Database, desc: "إدارة المنتجات وقطع الغيار" },
  { to: "/master/colors", label: "ألوان المركبات", icon: Palette, desc: "ألوان المركبات المعتمدة" },
  { to: "/vehicles", label: "كتالوج المركبات", icon: Car, desc: "المركبات والـ VIN والمحركات" },
  { to: "/contacts", label: "جهات الاتصال", icon: Contact2, desc: "العملاء والموردون والشركاء" },
  { to: "/customers", label: "العملاء", icon: Contact2, desc: "العملاء النشطون" },
  { to: "/organization", label: "الهيكل التنظيمي", icon: Building2, desc: "الفروع والأقسام" },
];

export default function MasterDataHub() {
  return (
    <div>
      <PageHeader title="مركز البيانات الرئيسية" subtitle="نقطة واحدة لإدارة كافة البيانات المرجعية" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.to} to={c.to}>
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer h-full">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm">{c.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.desc}</div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
