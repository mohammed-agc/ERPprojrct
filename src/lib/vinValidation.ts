/**
 * VIN (Vehicle Identification Number) validation — رقم الهيكل.
 *
 * Single source of truth for VIN governance across Purchasing, Allocation,
 * Invoicing, Inventory, and Sales. Standard automotive VIN is 17 alphanumeric
 * characters excluding the letters I, O, and Q to avoid confusion with digits.
 */

const VIN_LEN = 17;
const VIN_FORBIDDEN = /[IOQ]/i;
const VIN_ALLOWED = /^[A-HJ-NPR-Z0-9]+$/i;

export interface VinCheck {
  ok: boolean;
  reason?: string;
  normalized?: string;
}

/** Normalize: trim + uppercase. Empty/whitespace becomes "". */
export function normalizeVIN(v: string | undefined | null): string {
  return (v ?? "").replace(/\s+/g, "").toUpperCase();
}

/** Full-format VIN check (length, allowed chars, forbidden I/O/Q). */
export function validateVIN(raw: string | undefined | null): VinCheck {
  const v = normalizeVIN(raw);
  if (!v) return { ok: false, reason: "VIN مطلوب — رقم الهيكل لا يمكن أن يكون فارغاً" };
  if (v.length < VIN_LEN) return { ok: false, reason: `VIN ناقص — يجب أن يتكون من ${VIN_LEN} خانة (الحالي ${v.length})`, normalized: v };
  if (v.length > VIN_LEN) return { ok: false, reason: `VIN زائد — يجب أن يتكون من ${VIN_LEN} خانة فقط`, normalized: v };
  if (VIN_FORBIDDEN.test(v)) return { ok: false, reason: "VIN غير صالح — لا يُسمح بالأحرف I أو O أو Q", normalized: v };
  if (!VIN_ALLOWED.test(v)) return { ok: false, reason: "VIN غير صالح — يُسمح فقط بالأحرف اللاتينية والأرقام", normalized: v };
  return { ok: true, normalized: v };
}

export const VIN_LENGTH = VIN_LEN;
