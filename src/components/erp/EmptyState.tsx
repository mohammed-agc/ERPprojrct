import { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface Props {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  colSpan?: number;
  inTable?: boolean;
}

/**
 * Consistent empty-state for ERP lists and tables.
 */
export function EmptyState({ title = "لا توجد بيانات", description, icon, action, colSpan, inTable }: Props) {
  const body = (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <div className="text-muted-foreground">{icon ?? <Inbox className="h-7 w-7" />}</div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && <div className="text-xs text-muted-foreground max-w-xs">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
  if (inTable) {
    return (
      <tr>
        <td colSpan={colSpan ?? 100}>{body}</td>
      </tr>
    );
  }
  return body;
}
