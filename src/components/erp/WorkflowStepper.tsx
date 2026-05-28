import { Check } from "lucide-react";
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
 * Renders compact pill-chain. No animations, predictable.
 */
export function WorkflowStepper({ steps, current, cancelled }: Props) {
  const currentIdx = steps.findIndex(s => s.key === current);

  return (
    <div className="flex items-stretch w-full overflow-x-auto" role="list" aria-label="مراحل سير العمل">
      {steps.map((s, i) => {
        const isDone = !cancelled && i < currentIdx;
        const isActive = !cancelled && i === currentIdx;
        const isPending = !cancelled && i > currentIdx;

        return (
          <div
            key={s.key}
            role="listitem"
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-xs font-medium border whitespace-nowrap shrink-0",
              // RTL chevron via clip-path on both sides (except first/last)
              "border-border",
              isDone && "bg-success/10 text-success border-success/30",
              isActive && "bg-primary text-primary-foreground border-primary",
              isPending && "bg-muted/40 text-muted-foreground",
              cancelled && "bg-destructive/10 text-destructive border-destructive/30",
              i === 0 && "rounded-r-md",
              i === steps.length - 1 && "rounded-l-md",
            )}
          >
            <span className={cn(
              "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border",
              isDone && "bg-success text-success-foreground border-success",
              isActive && "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/40",
              isPending && "bg-background border-border text-muted-foreground",
            )}>
              {isDone ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
