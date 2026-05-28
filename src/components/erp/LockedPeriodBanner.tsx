import { AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { governanceService, periodStatusLabel } from "@/services/erp/governance";

interface Props {
  date: string;
  className?: string;
  compact?: boolean;
}

/**
 * Inline governance warning shown next to date fields / row actions when the
 * target date falls inside a closed or locked accounting period. Frontend
 * advisory only — the backend will enforce actual locking.
 */
export function LockedPeriodBanner({ date, className, compact }: Props) {
  if (!date) return null;
  const r = governanceService.isDateLocked(date);
  if (!r.locked) return null;
  const isLocked = r.status === "locked";
  return (
    <div className={cn(
      "flex items-center gap-2 rounded border px-2.5 py-1.5 text-xs",
      isLocked ? "bg-rose-500/10 border-rose-300 text-rose-800" : "bg-amber-500/10 border-amber-300 text-amber-800",
      className,
    )}>
      {isLocked ? <Lock className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
      <span className="font-medium">
        {compact
          ? `الفترة ${r.period} ${periodStatusLabel[r.status!]}`
          : `لا يمكن التعديل — الفترة ${r.period} ${periodStatusLabel[r.status!]}. يلزم إعادة فتحها من الحوكمة المالية.`}
      </span>
    </div>
  );
}
