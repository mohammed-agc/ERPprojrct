import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CascadeOption {
  id: string;
  label: string;        // primary display
  sublabel?: string;    // secondary (e.g. Arabic name)
}

interface Props {
  value: string | null | undefined;
  options: CascadeOption[];
  onChange: (opt: CascadeOption) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyHint?: string;
  /** Width class for the trigger button */
  className?: string;
}

/**
 * Compact searchable combobox optimised for ERP line entry.
 * Keyboard-first: opens on focus/Enter, type to filter, Enter to select.
 */
export function CascadeSelect({
  value, options, onChange, placeholder = "—", disabled,
  emptyHint, className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => options.find(o => o.id === value), [options, value]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);
  useEffect(() => { if (!open) setQ(""); }, [open]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(t) || (o.sublabel ?? "").toLowerCase().includes(t)
    );
  }, [options, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "w-full h-8 px-2 flex items-center justify-between gap-1.5 text-xs rounded border bg-background",
            "hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-primary",
            selected ? "border-border" : "border-dashed border-border text-muted-foreground",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
        >
          <span className={cn("truncate text-right flex-1", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[240px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث..."
            className="flex-1 bg-transparent outline-none text-xs"
          />
        </div>
        <div className="max-h-64 overflow-auto">
          {filtered.length === 0 && (
            <div className="text-center text-[11px] text-muted-foreground py-6">
              {emptyHint ?? "لا توجد نتائج"}
            </div>
          )}
          {filtered.map(o => {
            const isSel = o.id === value;
            return (
              <div
                key={o.id}
                onClick={() => { onChange(o); setOpen(false); }}
                className={cn(
                  "cursor-pointer px-2 py-1.5 text-xs hover:bg-accent flex items-center gap-2",
                  isSel && "bg-primary/10"
                )}
              >
                {isSel && <Check className="h-3 w-3 text-primary" />}
                <span className="flex-1 truncate">{o.label}</span>
                {o.sublabel && (
                  <span className="text-[10px] text-muted-foreground truncate">{o.sublabel}</span>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
