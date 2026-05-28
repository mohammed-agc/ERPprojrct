import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErpRole, ROLE_LABELS } from "@/lib/erpPermissions";
import { UserCog } from "lucide-react";

interface Props {
  value: ErpRole;
  onChange: (r: ErpRole) => void;
}

/**
 * Mock role switcher — frontend simulation only.
 * Future: replaced by real authenticated role from backend.
 */
export function RoleSwitcher({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">الدور:</span>
      <Select value={value} onValueChange={(v) => onChange(v as ErpRole)}>
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ROLE_LABELS) as ErpRole[]).map((r) => (
            <SelectItem key={r} value={r} className="text-xs">
              {ROLE_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
