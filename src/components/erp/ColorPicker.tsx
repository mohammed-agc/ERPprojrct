import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { colorsService, type VehicleColor } from "@/services/erp/masterData";

interface Props {
  value?: string | null;
  onChange: (color: VehicleColor) => void;
  disabled?: boolean;
}

/** Color picker bound to the master Vehicle Color list. No free text. */
export function ColorPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [colors, setColors] = useState<VehicleColor[]>([]);
  useEffect(() => { if (open) setColors(colorsService.listActive()); }, [open]);
  const selected = useMemo(() => colorsService.list().find(c => c.id === value), [value, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button"
          className={cn(
            "w-full h-8 px-2 flex items-center justify-between gap-2 text-xs rounded border border-border bg-background hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-primary",
            disabled && "opacity-60 cursor-not-allowed"
          )}>
          <span className="flex items-center gap-1.5 truncate">
            {selected?.hex && <span className="h-3 w-3 rounded-full border border-border" style={{ background: selected.hex }} />}
            <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.name_ar ?? "اللون"}</span>
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-1 w-[240px]">
        <div className="max-h-64 overflow-auto">
          {colors.map(c => {
            const isSel = c.id === value;
            return (
              <div key={c.id} onClick={() => { onChange(c); setOpen(false); }}
                className={cn("flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded text-xs hover:bg-accent",
                  isSel && "bg-primary/10")}>
                {c.hex && <span className="h-4 w-4 rounded-full border border-border shrink-0" style={{ background: c.hex }} />}
                <span className="flex-1 truncate">{c.name_ar}</span>
                {c.name_en && <span className="text-[10px] text-muted-foreground">{c.name_en}</span>}
                {isSel && <Check className="h-3 w-3 text-primary" />}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
