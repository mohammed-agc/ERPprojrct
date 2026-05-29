/**
 * UAT Test Environment helpers.
 *
 * `resetTransactional()` clears all transactional ERP localStorage envelopes
 * (purchasing, allocations, sales, inventory, treasury, costing, governance,
 * productivity, account overlays) WITHOUT touching master data:
 *   - sarat.masterdata.vehicle_catalog.v1
 *   - sarat.masterdata.vehicle_colors.v1
 *   - sarat.masterdata.products.v1
 * Master data auto-seeds on first read and stays intact.
 *
 * Suppliers/customers live in `sarat.purchasing.v1` and `sarat.sales.v1`
 * respectively; on clear they auto re-seed via each service's seed() with the
 * required defaults (Toyota Distributor, Hyundai Distributor, ...).
 */

const UAT_FLAG_KEY = "sarat.uat.enabled.v1";

/** Transactional localStorage keys cleared by the UAT reset. */
export const UAT_TRANSACTIONAL_KEYS = [
  "sarat.purchasing.v1",
  "sarat.allocations.v1",
  "sarat.sales.v1",
  "sarat.inventory.v1",
  "sarat.treasury.v1",
  "erp.costing.v1",
  "sarat.governance.v1",
  "sarat.erp.productivity.v1",
  "sarat.erp.accounts.overlay.v1",
] as const;

/** Master/config keys that MUST be preserved. */
export const UAT_PRESERVED_KEYS = [
  "sarat.masterdata.vehicle_catalog.v1",
  "sarat.masterdata.vehicle_colors.v1",
  "sarat.masterdata.products.v1",
  "sarat.erprole.v1",
] as const;

export function isUatMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(UAT_FLAG_KEY) === "1";
}

export function setUatMode(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) localStorage.setItem(UAT_FLAG_KEY, "1");
  else localStorage.removeItem(UAT_FLAG_KEY);
  window.dispatchEvent(new CustomEvent("uat-mode-change", { detail: on }));
}

/**
 * Clear transactional data only. Master data, users, roles, company/tax
 * settings, and UI preferences are preserved.
 * Returns the list of keys actually removed.
 */
export function resetTransactional(): string[] {
  if (typeof window === "undefined") return [];
  const removed: string[] = [];
  for (const k of UAT_TRANSACTIONAL_KEYS) {
    if (localStorage.getItem(k) !== null) {
      localStorage.removeItem(k);
      removed.push(k);
    }
  }
  setUatMode(true);
  return removed;
}
