import { useEffect, useState } from "react";
import { Bell, AlertTriangle, AlertCircle, Info, Check, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { productivityService, type Notification } from "@/services/erp/productivity";
import { useNavigate } from "react-router-dom";

const SEV_STYLES = {
  info: { icon: Info, ring: "ring-sky-400/40", dot: "bg-sky-500", text: "text-sky-600" },
  warning: { icon: AlertTriangle, ring: "ring-amber-400/40", dot: "bg-amber-500", text: "text-amber-600" },
  critical: { icon: AlertCircle, ring: "ring-rose-400/40", dot: "bg-rose-500", text: "text-rose-600" },
} as const;

export function NotificationsCenter() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const navigate = useNavigate();

  const reload = () => productivityService.notifications().then(setNotifs);
  useEffect(() => { reload(); }, []);
  useEffect(() => { if (open) reload(); }, [open]);

  const unread = notifs.filter(n => !n.read).length;
  const critical = notifs.filter(n => n.severity === "critical" && !n.read).length;

  const go = (n: Notification) => {
    productivityService.markRead(n.id);
    if (n.to) navigate(n.to);
    setOpen(false);
    reload();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-8 w-8 p-0" title="الإشعارات">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className={cn(
              "absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center",
              critical > 0 ? "bg-rose-500" : "bg-amber-500"
            )}>{unread > 9 ? "9+" : unread}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-semibold">الإشعارات</div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-[11px]"
              onClick={() => { productivityService.markAllRead(notifs.map(n => n.id)); reload(); }}>
              <Check className="h-3 w-3 ml-1" /> قراءة الكل
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-[420px]">
          {notifs.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">لا توجد إشعارات</div>
          ) : (
            <ul className="divide-y">
              {notifs.map(n => {
                const s = SEV_STYLES[n.severity];
                const Icon = s.icon;
                return (
                  <li key={n.id} className={cn("p-3 hover:bg-muted/40 transition", !n.read && "bg-muted/20")}>
                    <div className="flex items-start gap-2">
                      <div className={cn("h-7 w-7 rounded-full ring-2 flex items-center justify-center shrink-0", s.ring)}>
                        <Icon className={cn("h-3.5 w-3.5", s.text)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {!n.read && <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />}
                          <div className="text-xs font-semibold truncate">{n.title}</div>
                        </div>
                        {n.body && <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</div>}
                        <div className="flex items-center gap-1 mt-1.5">
                          {n.to && (
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => go(n)}>
                              <ExternalLink className="h-3 w-3 ml-1" /> فتح
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                            onClick={() => { productivityService.dismiss(n.id); reload(); }}>
                            <X className="h-3 w-3 ml-1" /> تجاهل
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
