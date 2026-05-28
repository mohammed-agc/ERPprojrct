import { AlertCircle, Loader2, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ------------ Loading ------------ */
export function LoadingState({
  label = "جاري التحميل...",
  inTable, colSpan = 1, className,
}: { label?: string; inTable?: boolean; colSpan?: number; className?: string }) {
  const body = (
    <div className={cn("flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm", className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
  return inTable ? (<tr><td colSpan={colSpan}>{body}</td></tr>) : body;
}

/* ------------ Error ------------ */
export function ErrorState({
  title = "تعذّر تحميل البيانات",
  message, onRetry, inTable, colSpan = 1, className,
}: {
  title?: string; message?: string; onRetry?: () => void;
  inTable?: boolean; colSpan?: number; className?: string;
}) {
  const body = (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-8 text-center", className)}>
      <AlertCircle className="h-6 w-6 text-destructive" />
      <div className="text-sm font-medium">{title}</div>
      {message && <div className="text-xs text-muted-foreground max-w-md">{message}</div>}
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="mt-1">
          <RotateCw className="h-3.5 w-3.5 ml-1" /> إعادة المحاولة
        </Button>
      )}
    </div>
  );
  return inTable ? (<tr><td colSpan={colSpan}>{body}</td></tr>) : body;
}

/* ------------ Permission denied ------------ */
export function PermissionDeniedState({
  title = "لا تملك صلاحية الوصول",
  message = "هذا الإجراء خارج نطاق صلاحياتك الحالية.",
  className,
}: { title?: string; message?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-10 text-center border border-dashed border-border rounded-lg bg-muted/20", className)}>
      <Lock className="h-6 w-6 text-muted-foreground" />
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground max-w-md">{message}</div>
    </div>
  );
}

/* ------------ Workflow rejection (transactional) ------------ */
export function WorkflowRejectionNote({ reason }: { reason: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded border border-warning/40 bg-warning/10 text-xs">
      <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
      <span>{reason}</span>
    </div>
  );
}
