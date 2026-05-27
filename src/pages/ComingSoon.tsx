import { PageHeader } from "@/components/layout/PageHeader";
import { Construction } from "lucide-react";

export default function ComingSoon({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="bg-card border border-border rounded-lg p-12 flex flex-col items-center justify-center text-center">
        <div className="h-14 w-14 rounded-full bg-accent text-accent-foreground flex items-center justify-center mb-3">
          <Construction className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">قيد التطوير</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          {hint ?? "هذه الوحدة ستكون متاحة في المرحلة التالية من النظام. الهيكل والصلاحيات جاهزة في قاعدة البيانات."}
        </p>
      </div>
    </div>
  );
}
