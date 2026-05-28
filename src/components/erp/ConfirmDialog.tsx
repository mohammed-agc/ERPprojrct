import { ReactNode, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  /** when set, user must type this word to confirm */
  requireText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning";
  onConfirm: () => void | Promise<void>;
}

/**
 * Destructive-action confirmation with optional type-to-confirm.
 * Standard pattern for delete/reverse/post operations.
 */
export function ConfirmDialog({
  trigger, title, description, requireText, confirmLabel = "تأكيد", cancelLabel = "إلغاء",
  tone = "danger", onConfirm,
}: Props) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const disabled = busy || (requireText ? val.trim() !== requireText : false);
  const toneColor = tone === "danger" ? "text-destructive" : "text-amber-600";

  return (
    <AlertDialog onOpenChange={(o) => { if (!o) { setVal(""); setBusy(false); } }}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className={cn("h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0", tone === "danger" ? "bg-destructive/10" : "bg-amber-500/10")}>
              {tone === "danger" ? <Trash2 className={cn("h-4 w-4", toneColor)} /> : <AlertTriangle className={cn("h-4 w-4", toneColor)} />}
            </div>
            <div className="flex-1">
              <AlertDialogTitle className="text-right text-sm">{title}</AlertDialogTitle>
              {description && <AlertDialogDescription className="text-right text-xs mt-1">{description}</AlertDialogDescription>}
            </div>
          </div>
        </AlertDialogHeader>
        {requireText && (
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">
              للتأكيد، اكتب: <span className="font-mono font-bold text-foreground">{requireText}</span>
            </label>
            <Input value={val} onChange={(e) => setVal(e.target.value)} className="h-8 text-sm" autoFocus />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="text-xs">{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try { await onConfirm(); } finally { setBusy(false); }
            }}
            className={cn("text-xs", tone === "danger" && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
          >
            {busy ? "جارٍ التنفيذ..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
