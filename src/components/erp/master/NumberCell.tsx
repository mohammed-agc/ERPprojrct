import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  /** Display thousands separators (e.g. unit price). */
  currency?: boolean;
  /** Limit to integer values. */
  integer?: boolean;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
  /** Width in characters (CSS ch). Falls back to className width if provided. */
  width?: number;
}

/**
 * ERP numeric cell — no spinners, keyboard-first, right-aligned.
 * Currency mode renders thousands separators on blur and parses on the fly.
 */
export function NumberCell({
  value, onChange, placeholder, currency, integer, min, max,
  className, disabled, width,
}: Props) {
  const [text, setText] = useState<string>(formatOut(value, currency));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatOut(value, currency));
  }, [value, currency, focused]);

  const commit = (raw: string) => {
    const cleaned = raw.replace(/[^\d.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") { onChange(undefined); return; }
    let n = Number(cleaned);
    if (Number.isNaN(n)) { onChange(undefined); return; }
    if (integer) n = Math.trunc(n);
    if (min !== undefined && n < min) n = min;
    if (max !== undefined && n > max) n = max;
    onChange(n);
  };

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      disabled={disabled}
      value={focused ? text : formatOut(value, currency)}
      placeholder={placeholder}
      onFocus={(e) => { setFocused(true); setText(value === undefined ? "" : String(value)); e.currentTarget.select(); }}
      onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
      onBlur={() => { setFocused(false); }}
      className={cn(
        "h-8 w-full px-2 text-xs text-right num bg-background border border-border rounded",
        "focus:outline-none focus:ring-1 focus:ring-primary no-spin",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      style={width ? { width: `${width}ch` } : undefined}
    />
  );
}

function formatOut(v: number | undefined, currency?: boolean) {
  if (v === undefined || v === null || Number.isNaN(v)) return "";
  if (currency) return v.toLocaleString("en-US");
  return String(v);
}
