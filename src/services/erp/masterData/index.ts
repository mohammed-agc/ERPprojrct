/**
 * Master Data Services — singletons consumed by ALL ERP modules
 * (Purchasing, Sales, Inventory, Workshop, Spare Parts).
 *
 * To migrate to Supabase later, implement the repository contracts in
 * `./types.ts` against the `products` and `vehicle_colors` tables and swap
 * the singletons below. No UI changes required.
 */
import { localStorageProductsRepo } from "./productsRepo";
import { localStorageColorsRepo } from "./colorsRepo";
import type { ProductCategory } from "./types";

export const productsService = localStorageProductsRepo;
export const colorsService = localStorageColorsRepo;

export * from "./types";

/** Derive product category from a free-text department label (Arabic). */
export function categoryFromDepartment(dept?: string): ProductCategory | null {
  if (!dept) return null;
  const d = dept.trim();
  if (/قطع|سبير|spare/i.test(d)) return "part";
  if (/ورش|صيانة|خدم|service|workshop/i.test(d)) return "service";
  if (/مبيع|إدار|مركب|sales|vehicle/i.test(d)) return "vehicle";
  return null;
}
