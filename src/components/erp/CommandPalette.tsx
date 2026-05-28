import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { COMMANDS, productivityService, type SearchItem, type Command as Cmd } from "@/services/erp/productivity";
import {
  Search, ArrowLeftRight, ArrowDownCircle, ArrowUpCircle, FilePlus2, UserPlus, Car, Wallet,
  Calculator, History, Clock, FileText, LayoutDashboard, Vault, Shield, ClipboardCheck, FileSearch, Activity
} from "lucide-react";

const CMD_ICONS: Record<string, any> = {
  new_invoice: FilePlus2, new_receipt: ArrowDownCircle, new_payment: ArrowUpCircle,
  new_journal: Calculator, new_contact: UserPlus, new_vehicle: Car, new_transfer: ArrowLeftRight,
  go_dashboard: LayoutDashboard, go_treasury: Vault, go_approvals: ClipboardCheck,
  go_audit: FileSearch, go_activity: Activity,
};

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  useEffect(() => { if (!open) setQ(""); }, [open]);

  const results: SearchItem[] = useMemo(() => productivityService.search(q), [q]);
  const recents = productivityService.recentSearches();
  const recentActions = productivityService.recentActions();

  const run = (cmd: Cmd) => {
    productivityService.pushRecentAction(cmd.id);
    if (cmd.to) navigate(cmd.to);
    cmd.action?.();
    onOpenChange(false);
  };
  const open_ = (it: SearchItem) => {
    productivityService.pushRecentSearch(q);
    navigate(it.to);
    onOpenChange(false);
  };

  const grouped = COMMANDS.reduce<Record<string, Cmd[]>>((acc, c) => {
    (acc[c.group] = acc[c.group] || []).push(c); return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="p-0 max-w-2xl overflow-hidden">
        <Command shouldFilter={false} className="rounded-lg border-0">
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="ابحث عن صفحة، عملية، أو نفّذ أمراً... (Ctrl+K)"
            className="h-12 text-sm"
          />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>لا توجد نتائج مطابقة</CommandEmpty>

            {q && results.length > 0 && (
              <CommandGroup heading="نتائج البحث">
                {results.map(r => (
                  <CommandItem key={r.id} onSelect={() => open_(r)} className="gap-2">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1">{r.title}</span>
                    <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!q && recentActions.length > 0 && (
              <>
                <CommandGroup heading="الأحدث">
                  {recentActions.map(c => {
                    const Icon = CMD_ICONS[c.id] || History;
                    return (
                      <CommandItem key={`rec_${c.id}`} onSelect={() => run(c)} className="gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{c.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {!q && recents.length > 0 && (
              <>
                <CommandGroup heading="عمليات بحث سابقة">
                  {recents.map(r => (
                    <CommandItem key={`rs_${r}`} onSelect={() => setQ(r)} className="gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{r}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {Object.entries(grouped).map(([group, cmds]) => (
              <CommandGroup key={group} heading={group}>
                {cmds.map(c => {
                  const Icon = CMD_ICONS[c.id] || FileText;
                  return (
                    <CommandItem key={c.id} onSelect={() => run(c)} className="gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1">{c.label}</span>
                      {c.shortcut && <CommandShortcut>⌥{c.shortcut}</CommandShortcut>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="border-t px-3 py-2 text-[10px] text-muted-foreground flex items-center justify-between bg-muted/30">
            <span>↑↓ للتنقل · ↵ للتنفيذ · Esc للإغلاق</span>
            <span>SARAT ERP · لوحة الأوامر</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
