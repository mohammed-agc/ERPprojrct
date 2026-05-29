/**
 * Global ERP Master Data — shared across Purchasing, Sales, Inventory, Workshop, Spare Parts.
 *
 * Types only. Storage is abstracted behind repositories (see ./productsRepo, ./colorsRepo)
 * so the active implementation can swap from localStorage → Supabase tables without
 * touching any UI. Future tables expected: `products`, `vehicle_colors`.
 */

export type ProductCategory = "vehicle" | "part" | "service";

export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  vehicle: "مركبات",
  part: "قطع غيار",
  service: "خدمات",
};

/**
 * Product = catalogue entry (model-level). NEVER includes per-unit fields like
 * VIN, color, engine number — those live on Vehicle/Allocation/Inventory unit
 * records. One Product may correspond to hundreds of physical VIN units.
 */
export interface Product {
  id: string;
  code: string;            // e.g. PRD-V-0001, PRD-P-0001, PRD-S-0001
  name: string;            // "Toyota Camry GL 2025"
  category: ProductCategory;
  brand?: string;          // vehicles & parts
  model?: string;          // vehicles & parts
  year?: number;           // vehicles
  default_unit_price?: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VehicleColor {
  id: string;
  code: string;            // CLR-0001
  name_ar: string;         // "أبيض لؤلؤي"
  name_en?: string;        // "Pearl White"
  hex?: string;            // "#F5F5F5"
  active: boolean;
  created_at: string;
}

/* ============================ Repository contracts ============================ */

export interface ProductsRepository {
  list(): Product[];
  listByCategory(category: ProductCategory): Product[];
  get(id: string): Product | undefined;
  create(input: Omit<Product, "id" | "code" | "created_at" | "updated_at" | "active"> & { active?: boolean }): Product;
  update(id: string, patch: Partial<Omit<Product, "id" | "created_at">>): Product | undefined;
  toggleActive(id: string): Product | undefined;
}

export interface ColorsRepository {
  list(): VehicleColor[];
  listActive(): VehicleColor[];
  get(id: string): VehicleColor | undefined;
  create(input: Omit<VehicleColor, "id" | "code" | "created_at" | "active"> & { active?: boolean }): VehicleColor;
  update(id: string, patch: Partial<Omit<VehicleColor, "id" | "created_at">>): VehicleColor | undefined;
  toggleActive(id: string): VehicleColor | undefined;
}
