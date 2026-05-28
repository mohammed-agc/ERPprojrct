import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** make the header sticky to the top of the scroll area */
  sticky?: boolean;
}
export function PageHeader({ title, subtitle, actions, sticky }: Props) {
  return (
    <div
      className={cn(
        "flex items-end justify-between gap-4 mb-4 pb-3 border-b border-border",
        sticky && "sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 -mx-6 px-6 pt-3 mb-3",
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-foreground leading-tight truncate">{title}</h1>
        {subtitle && <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
