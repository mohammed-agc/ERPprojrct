import { cn } from "@/lib/utils";

interface Props {
  rows?: number;
  columns?: number;
  className?: string;
}

/**
 * ERP-density loading skeleton for tables.
 * Matches `.erp-table` row height (h-9) and 1.5 padding.
 */
export function TableSkeleton({ rows = 8, columns = 5, className }: Props) {
  return (
    <div className={cn("animate-pulse", className)} aria-busy="true" aria-live="polite">
      <div className="bg-[hsl(var(--table-header))] h-8 flex items-center gap-3 px-3 border-b border-[hsl(var(--table-border))]">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-3 bg-muted-foreground/20 rounded flex-1 max-w-[120px]" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="h-9 flex items-center gap-3 px-3 border-b border-[hsl(var(--table-border))]">
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="h-2.5 bg-muted-foreground/15 rounded flex-1"
              style={{ maxWidth: `${50 + ((r * 7 + c * 13) % 50)}%` }}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">جارٍ تحميل البيانات</span>
    </div>
  );
}
