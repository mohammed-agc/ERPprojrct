import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { productivityService, type ActivityEntry } from "@/services/erp/productivity";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { cn } from "@/lib/utils";

const GROUPS: { id: ActivityEntry["group"] | "all"; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "accounting", label: "محاسبة" },
  { id: "treasury", label: "خزينة" },
  { id: "sales", label: "مبيعات" },
  { id: "approvals", label: "اعتمادات" },
  { id: "inventory", label: "مخزون" },
  { id: "system", label: "نظام" },
];

const TONE: Record<ActivityEntry["group"], string> = {
  accounting: "bg-indigo-500/10 text-indigo-600",
  treasury: "bg-emerald-500/10 text-emerald-600",
  sales: "bg-sky-500/10 text-sky-600",
  approvals: "bg-amber-500/10 text-amber-600",
  inventory: "bg-slate-500/10 text-slate-600",
  system: "bg-zinc-500/10 text-zinc-600",
};

export default function ActivityFeed() {
  const [filter, setFilter] = useState<ActivityEntry["group"] | "all">("all");
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    setItems(productivityService.activity(filter === "all" ? undefined : { group: filter }));
  }, [filter]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> مركز النشاطات
          </h1>
          <p className="text-xs text-muted-foreground">عرض موحّد لجميع العمليات التشغيلية في النظام</p>
        </div>
      </div>

      <Card className="p-2 flex flex-wrap gap-1.5">
        {GROUPS.map(g => (
          <button
            key={g.id}
            onClick={() => setFilter(g.id)}
            className={cn(
              "px-3 py-1 rounded-full text-xs border transition",
              filter === g.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted border-transparent text-muted-foreground"
            )}
          >
            {g.label}
          </button>
        ))}
      </Card>

      <Card className="divide-y">
        {items.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">لا توجد نشاطات في هذا التصنيف</div>
        ) : items.map(it => (
          <div key={it.id} className="p-4 hover:bg-muted/30 flex items-start gap-3">
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", TONE[it.group])}>
              <Activity className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{it.title}</div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <Badge variant="outline" className={cn("text-[10px]", TONE[it.group])}>
                  {GROUPS.find(g => g.id === it.group)?.label}
                </Badge>
                {it.user && <span>· {it.user}</span>}
                <span>·</span>
                <span>{safeRelative(it.at)}</span>
              </div>
            </div>
            {it.to && (
              <Button variant="ghost" size="sm" onClick={() => navigate(it.to!)}>
                <ExternalLink className="h-3.5 w-3.5 ml-1" /> فتح
              </Button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

function safeRelative(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: arSA }); }
  catch { return iso; }
}
