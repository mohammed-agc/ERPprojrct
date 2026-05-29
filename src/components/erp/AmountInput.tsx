import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** Number of decimal places to show when not focused. Default 2. */
  decimals?: number;
}

/**
 * Shared ERP amount input — keyboard-first, no spinners.
 * - Right-aligned, tabular numerals
 * - Thousands separators on blur (e.g. 156,000.00)
 * - Raw editable number on focus
 * - No browser up/down steppers
 */
export function AmountInput({
  value, onChange, placeholder, min, max, className, disabled, id, decimals = 2,
}: Props) {
  const [text, setText] = useState<string>(formatOut(value, decimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatOut(value, decimals));
  }, [value, decimals, focused]);

  const commit = (raw: string) => {
    const cleaned = raw.replace(/,/g, "").replace(/[^\d.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") { onChange(undefined); return; }
    let n = Number(cleaned);
    if (Number.isNaN(n)) { onChange(undefined); return; }
    if (min !== undefined && n < min) n = min;
    if (max !== undefined && n > max) n = max;
    onChange(n);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      disabled={disabled}
      dir="ltr"
      value={focused ? text : formatOut(value, decimals)}
      placeholder={placeholder}
      onFocus={(e) => {
        setFocused(true);
        setText(value === undefined ? "" : String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
      onBlur={() => setFocused(false)}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums font-mono text-right",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50 no-spin",
        className,
      )}
    />
  );
}

function formatOut(v: number | undefined, decimals: number) {
  if (v === undefined || v === null || Number.isNaN(v)) return "";
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
