import { Button, ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PermissionResult } from "@/lib/erpPermissions";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends ButtonProps {
  permission: PermissionResult;
  /** if false (default), denied actions render disabled with tooltip. if true, denied actions are hidden. */
  hideIfDenied?: boolean;
  children: React.ReactNode;
}

/**
 * Workflow-aware action button.
 * - Allowed: normal button.
 * - Denied: disabled + tooltip explaining reason (or hidden when hideIfDenied=true).
 */
export function ActionButton({ permission, hideIfDenied, children, className, ...rest }: Props) {
  if (!permission.allowed && hideIfDenied) return null;

  if (!permission.allowed) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* span wrapper so tooltip works on disabled buttons */}
            <span className="inline-flex">
              <Button {...rest} disabled className={cn("opacity-60", className)}>
                <Lock className="h-3.5 w-3.5 ml-1 opacity-70" />
                {children}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[240px]">
            {permission.message ?? "غير متاح"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button {...rest} className={className}>
      {children}
    </Button>
  );
}
