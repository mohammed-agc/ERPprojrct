import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboColumn<T> = {
  key: string;
  header: string;
  className?: string;
  render: (item: T) => React.ReactNode;
};

interface Props<T extends { id: string }> {
  items: T[];
  value: string | null;
  onChange: (id: string, item: T) => void;
  placeholder?: string;
  disabled?: boolean;
  searchKeys: (keyof T)[];
  columns: ComboColumn<T>[];
  displayValue: (item: T) => string;
  emptyText?: string;
  /** lazy: only render first N rows until user scrolls/searches */
  pageSize?: number;
}

/**
 * ERP-grade product combobox.
 * - Keyboard-first (↑/↓/Enter/Esc), search-first, RTL-safe, lazy rendering.
 * - Borrows Odoo/ERPNext multi-column dropdown style.
 */
export function ProductCombobox<T extends { id: string }>({
  items, value, onChange, placeholder = "اختر...", disabled,
  searchKeys, columns, displayValue, emptyText = "لا توجد نتائج",
  pageSize = 30,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [visible, setVisible] = useState(pageSize);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => items.find(i => i.id === value) ?? null, [items, value]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(it =>
      searchKeys.some(k => String(it[k] ?? "").toLowerCase().includes(term))
    );
  }, [items, q, searchKeys]);

  const shown = filtered.slice(0, visible);

  useEffect(() => {
    if (open) {
      setQ(""); setActiveIdx(0); setVisible(pageSize);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, pageSize]);

  useEffect(() => { setActiveIdx(0); }, [q]);

  const pick = (it: T) => {
    onChange(it.id, it);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = shown[activeIdx];
      if (it) pick(it);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40 && visible < filtered.length) {
      setVisible(v => Math.min(v + pageSize, filtered.length));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "w-full h-8 px-2 flex items-center justify-between gap-2 text-sm rounded",
            "bg-transparent hover:bg-accent/40 border border-transparent hover:border-border",
            "focus:outline-none focus:ring-1 focus:ring-primary text-right",
            disabled && "opacity-60 cursor-not-allowed"
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? displayValue(selected) : placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0 w-[640px] max-w-[90vw]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="بحث..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div className="grid bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-1.5"
             style={{ gridTemplateColumns: columns.map(c => "minmax(0, 1fr)").join(" ") }}>
          {columns.map(c => (
            <div key={c.key} className={cn("truncate", c.className)}>{c.header}</div>
          ))}
        </div>

        <div ref={listRef} className="max-h-72 overflow-auto" onScroll={onScroll}>
          {shown.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">{emptyText}</div>
          )}
          {shown.map((it, idx) => {
            const isActive = idx === activeIdx;
            const isSelected = it.id === value;
            return (
              <div
                key={it.id}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => pick(it)}
                className={cn(
                  "grid items-center cursor-pointer px-3 py-1.5 text-sm border-b border-border/40",
                  isActive && "bg-accent/60",
                  isSelected && "bg-primary/10"
                )}
                style={{ gridTemplateColumns: columns.map(() => "minmax(0, 1fr)").join(" ") }}
              >
                {columns.map((c, ci) => (
                  <div key={c.key} className={cn("truncate flex items-center gap-1", c.className)}>
                    {ci === 0 && isSelected && <Check className="h-3 w-3 text-primary shrink-0" />}
                    {c.render(it)}
                  </div>
                ))}
              </div>
            );
          })}
          {visible < filtered.length && (
            <div className="text-center text-[11px] text-muted-foreground py-1.5 border-t border-border/40">
              عرض {visible} من {filtered.length} — مرّر للمزيد
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/30 text-[11px] text-muted-foreground">
          <span>{filtered.length} نتيجة</span>
          <span className="flex items-center gap-2">
            <kbd className="border border-border rounded px-1">↑</kbd>
            <kbd className="border border-border rounded px-1">↓</kbd>
            تنقّل ·
            <kbd className="border border-border rounded px-1">Enter</kbd>
            اختيار
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
