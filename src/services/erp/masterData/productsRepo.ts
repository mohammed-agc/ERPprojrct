import type { Product, ProductCategory, ProductsRepository } from "./types";

const LS_KEY = "sarat.masterdata.products.v1";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const isoNow = () => new Date().toISOString();

function seed(): Product[] {
  const now = isoNow();
  const mk = (p: Partial<Product> & Pick<Product, "code" | "name" | "category">): Product => ({
    id: uid("prd"), active: true, created_at: now, updated_at: now, ...p,
  } as Product);
  return [
    mk({ code: "PRD-V-0001", name: "Toyota Camry GL 2025", category: "vehicle", brand: "Toyota", model: "Camry GL", year: 2025, default_unit_price: 105_000 }),
    mk({ code: "PRD-V-0002", name: "Toyota Camry LE 2025", category: "vehicle", brand: "Toyota", model: "Camry LE", year: 2025, default_unit_price: 92_000 }),
    mk({ code: "PRD-V-0003", name: "Toyota Hilux DLX 2026", category: "vehicle", brand: "Toyota", model: "Hilux DLX", year: 2026, default_unit_price: 138_000 }),
    mk({ code: "PRD-V-0004", name: "Toyota Land Cruiser 2026", category: "vehicle", brand: "Toyota", model: "Land Cruiser GXR", year: 2026, default_unit_price: 295_000 }),
    mk({ code: "PRD-V-0005", name: "Hyundai Tucson 2026", category: "vehicle", brand: "Hyundai", model: "Tucson", year: 2026, default_unit_price: 88_000 }),
    mk({ code: "PRD-V-0006", name: "Nissan Patrol 2026", category: "vehicle", brand: "Nissan", model: "Patrol Platinum", year: 2026, default_unit_price: 245_000 }),

    mk({ code: "PRD-P-0001", name: "طقم تيل فرامل أمامي - Toyota", category: "part", brand: "Toyota", model: "Camry/Corolla", default_unit_price: 180 }),
    mk({ code: "PRD-P-0002", name: "قرص فرامل أمامي - Hyundai", category: "part", brand: "Hyundai", model: "Tucson", default_unit_price: 240 }),
    mk({ code: "PRD-P-0003", name: "طقم جير كامل", category: "part", brand: "Toyota", model: "Camry", default_unit_price: 12_500 }),
    mk({ code: "PRD-P-0004", name: "فلتر زيت", category: "part", brand: "Universal", default_unit_price: 25 }),

    mk({ code: "PRD-S-0001", name: "تغيير زيت محرك", category: "service", default_unit_price: 150 }),
    mk({ code: "PRD-S-0002", name: "فحص دوري شامل", category: "service", default_unit_price: 350 }),
    mk({ code: "PRD-S-0003", name: "صيانة فرامل", category: "service", default_unit_price: 280 }),
  ];
}

function load(): Product[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Product[];
  } catch {}
  const s = seed();
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
  return s;
}
function save(items: Product[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {}
}

function nextCode(items: Product[], cat: ProductCategory): string {
  const prefix = cat === "vehicle" ? "PRD-V-" : cat === "part" ? "PRD-P-" : "PRD-S-";
  const max = items
    .filter(p => p.code.startsWith(prefix))
    .map(p => parseInt(p.code.slice(prefix.length), 10))
    .filter(n => !Number.isNaN(n))
    .reduce((m, n) => Math.max(m, n), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export const localStorageProductsRepo: ProductsRepository = {
  list() { return load().slice().sort((a, b) => a.name.localeCompare(b.name, "ar")); },
  listByCategory(category) { return this.list().filter(p => p.category === category && p.active); },
  get(id) { return load().find(p => p.id === id); },

  create(input) {
    const items = load();
    const product: Product = {
      id: uid("prd"),
      code: nextCode(items, input.category),
      name: input.name,
      category: input.category,
      brand: input.brand,
      model: input.model,
      year: input.year,
      default_unit_price: input.default_unit_price,
      active: input.active ?? true,
      created_at: isoNow(),
      updated_at: isoNow(),
    };
    items.unshift(product);
    save(items);
    return product;
  },

  update(id, patch) {
    const items = load();
    const idx = items.findIndex(p => p.id === id);
    if (idx < 0) return undefined;
    items[idx] = { ...items[idx], ...patch, id: items[idx].id, created_at: items[idx].created_at, updated_at: isoNow() };
    save(items);
    return items[idx];
  },

  toggleActive(id) {
    const items = load();
    const p = items.find(x => x.id === id);
    if (!p) return undefined;
    p.active = !p.active; p.updated_at = isoNow();
    save(items);
    return p;
  },
};
