import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { productivityService, type ActivityEntry } from "@/services/erp/productivity";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { cn } from "@/lib/utils";

const GROUP_TONE: Record<ActivityEntry["group"], string> = {
  accounting: "bg-indigo-500/10 text-indigo-600 border-indigo-300/30",
  treasury: "bg-emerald-500/10 text-emerald-600 border-emerald-300/30",
  sales: "bg-sky-500/10 text-sky-600 border-sky-300/30",
  approvals: "bg-amber-500/10 text-amber-600 border-amber-300/30",
  inventory: "bg-slate-500/10 text-slate-600 border-slate-300/30",
  system: "bg-zinc-500/10 text-zinc-600 border-zinc-300/30",
};
const GROUP_LABEL: Record<ActivityEntry["group"], string> = {
  accounting: "محاسبة", treasury: "خزينة", sales: "مبيعات",
  approvals: "اعتمادات", inventory: "مخزون", system: "نظام",
};

export function ActivityCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const [filter, setFilter] = useState<ActivityEntry["group"] | "all">("all");
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const f = filter === "all" ? undefined : { group: filter };
    setItems(productivityService.activity(f));
  }, [open, filter]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="مركز النشاطات">
          <Activity className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" dir="rtl" className="w-[420px] sm:max-w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" /> مركز النشاطات
          </SheetTitle>
        </SheetHeader>
        <div className="px-3 py-2 border-b flex flex-wrap gap-1">
          {(["all", "accounting", "treasury", "sales", "approvals", "inventory", "system"] as const).map(g => (
            <button
              key={g}
              onClick={() => setFilter(g)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] border transition",
                filter === g ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted text-muted-foreground border-transparent"
              )}
            >
              {g === "all" ? "الكل" : GROUP_LABEL[g]}
            </button>
          ))}
        </div>
        <ScrollArea className="flex-1">
          {items.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">لا توجد نشاطات</div>
          ) : (
            <ol className="relative">
              {items.map((it, i) => (
                <li key={it.id} className="relative pr-6 pl-3 py-3 border-b hover:bg-muted/30">
                  <span className="absolute right-2 top-4 h-2 w-2 rounded-full bg-primary" />
                  {i < items.length - 1 && <span className="absolute right-[10px] top-6 bottom-0 w-px bg-border" />}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium leading-snug">{it.title}</div>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", GROUP_TONE[it.group])}>
                          {GROUP_LABEL[it.group]}
                        </Badge>
                        {it.user && <span>· {it.user}</span>}
                        <span>·</span>
                        <span>{safeRelative(it.at)}</span>
                      </div>
                    </div>
                    {it.to && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { navigate(it.to!); setOpen(false); }}>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </ScrollArea>
        <div className="px-3 py-2 border-t text-[10px] text-muted-foreground text-center">
          سجل النشاطات للعرض فقط · واجهة تشغيلية
        </div>
      </SheetContent>
    </Sheet>
  );
}

function safeRelative(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: arSA }); }
  catch { return iso; }
}
