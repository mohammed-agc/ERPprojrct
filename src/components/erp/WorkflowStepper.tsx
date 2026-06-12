import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkflowStep = {
  key: string;
  label: string;
};

interface Props {
  steps: WorkflowStep[];
  current: string;
  /** statuses considered "cancelled/failed" — renders as muted destructive */
  cancelled?: boolean;
}

/**
 * ERP workflow stepper — RTL-native progress indicator (Odoo/ERPNext style).
 * Compact, no animations, predictable rendering. Chevron-style flow R→L.
 */
export function WorkflowStepper({ steps, current, cancelled }: Props) {
  const currentIdx = steps.findIndex(s => s.key === current);

  return (
    <div className="flex items-stretch w-full overflow-x-auto" role="list" aria-label="مراحل سير العمل">
      {steps.map((s, i) => {
        const isDone = !cancelled && i < currentIdx;
        const isActive = !cancelled && i === currentIdx;
        const isPending = !cancelled && i > currentIdx;
        const isFirst = i === 0;
        const isLast = i === steps.length - 1;

        return (
          <div
            key={s.key}
            role="listitem"
            className={cn(
              "relative flex items-center gap-2 pr-3 pl-4 py-1.5 text-xs font-medium border-y whitespace-nowrap shrink-0 min-w-[120px]",
              isFirst && "border-r rounded-r-md pr-3",
              isLast && "border-l rounded-l-md",
              !isFirst && "-mr-2",
              isDone && "bg-success/10 text-success border-success/30",
              isActive && "bg-primary text-primary-foreground border-primary z-10",
              isPending && "bg-muted/30 text-muted-foreground border-border",
              cancelled && "bg-destructive/10 text-destructive border-destructive/30",
            )}
            style={!isLast ? { clipPath: "polygon(8px 0, 100% 0, 100% 100%, 8px 100%, 0 50%)" } : undefined}
          >
            <span className={cn(
              "h-5 w-5 rounded-full flex items-center justify-center text-[11.5px] font-bold border shrink-0",
              isDone && "bg-success text-success-foreground border-success",
              isActive && "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/40",
              isPending && "bg-background border-border text-muted-foreground",
              cancelled && "bg-destructive/20 text-destructive border-destructive/40",
            )}>
              {cancelled ? <X className="h-3 w-3" /> : isDone ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className="truncate">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
