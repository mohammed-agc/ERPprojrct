import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SHORTCUTS: { keys: string[]; label: string; group: string }[] = [
  { keys: ["Ctrl", "K"], label: "فتح لوحة الأوامر والبحث الشامل", group: "عام" },
  { keys: ["?"], label: "عرض اختصارات لوحة المفاتيح", group: "عام" },
  { keys: ["G", "H"], label: "الذهاب إلى الرئيسية", group: "تنقل" },
  { keys: ["G", "I"], label: "الذهاب إلى الفواتير", group: "تنقل" },
  { keys: ["G", "J"], label: "الذهاب إلى قيود اليومية", group: "تنقل" },
  { keys: ["G", "T"], label: "الذهاب إلى الخزينة", group: "تنقل" },
  { keys: ["G", "A"], label: "الذهاب إلى الاعتمادات", group: "تنقل" },
  { keys: ["N"], label: "إنشاء جديد (في الشاشة الحالية)", group: "إجراءات" },
  { keys: ["E"], label: "تحرير العنصر المحدد", group: "إجراءات" },
  { keys: ["/"], label: "التركيز على البحث", group: "إجراءات" },
  { keys: ["Esc"], label: "إغلاق الحوارات والقوائم", group: "إجراءات" },
];

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const typing = tgt?.tagName === "INPUT" || tgt?.tagName === "TEXTAREA" || tgt?.isContentEditable;
      if (!typing && e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = SHORTCUTS.reduce<Record<string, typeof SHORTCUTS>>((acc, s) => {
    (acc[s.group] = acc[s.group] || []).push(s); return acc;
  }, {});

  return (
    <>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="اختصارات لوحة المفاتيح (?)" onClick={() => setOpen(true)} aria-label="اختصارات لوحة المفاتيح">
        <Keyboard className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Keyboard className="h-4 w-4" /> اختصارات لوحة المفاتيح
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-auto">
            {Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div className="text-[11.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{group}</div>
                <ul className="space-y-1">
                  {items.map((s, i) => (
                    <li key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted/40">
                      <span>{s.label}</span>
                      <span className="flex items-center gap-1">
                        {s.keys.map(k => (
                          <kbd key={k} className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded border bg-muted text-[11.5px] font-mono font-semibold">
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
