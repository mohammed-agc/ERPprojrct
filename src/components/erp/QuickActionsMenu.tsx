import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FilePlus2, ArrowDownCircle, ArrowUpCircle, Calculator, UserPlus, Car, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const ITEMS = [
  { label: "فاتورة", icon: FilePlus2, to: "/invoices?new=1" },
  { label: "سند قبض", icon: ArrowDownCircle, to: "/treasury/receipts?new=1" },
  { label: "سند صرف", icon: ArrowUpCircle, to: "/treasury/payments?new=1" },
  { label: "قيد يومية", icon: Calculator, to: "/journals?new=1" },
  { label: "تحويل خزينة", icon: ArrowLeftRight, to: "/treasury/transfers?new=1" },
  { sep: true } as const,
  { label: "جهة اتصال", icon: UserPlus, to: "/contacts?new=1" },
  { label: "مركبة", icon: Car, to: "/vehicles?new=1" },
];

export function QuickActionsMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" />
          إنشاء سريع
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent dir="rtl" align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px]">العمليات السريعة</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ITEMS.map((it, i) => {
          if ("sep" in it) return <DropdownMenuSeparator key={`s${i}`} />;
          const Icon = it.icon;
          return (
            <DropdownMenuItem key={it.to} onClick={() => navigate(it.to)} className="gap-2 text-xs">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {it.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
