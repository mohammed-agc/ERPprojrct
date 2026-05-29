/**
 * Vehicle Catalog Master Data — Manufacturer → Model → Trim
 *
 * Cascading reference data shared by ALL ERP modules (Purchasing, Sales,
 * Inventory, Allocation, Workshop, Reports). Designed as a repository so the
 * localStorage implementation can later be swapped for Supabase tables:
 *   - manufacturers          (id, code, name_en, name_ar, active)
 *   - vehicle_models         (id, manufacturer_id, name, active)
 *   - vehicle_trims          (id, model_id, name, active)
 * with no UI changes required.
 */

export interface Manufacturer {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  active: boolean;
}

export interface VehicleModel {
  id: string;
  manufacturer_id: string;
  name: string;          // full model name, e.g. "Camry", "Land Cruiser"
  active: boolean;
}

export interface VehicleTrim {
  id: string;
  model_id: string;
  name: string;          // trim/grade, e.g. "LE", "GXR", "VXR"
  active: boolean;
}

export interface VehicleCatalogRepository {
  listManufacturers(): Manufacturer[];
  listModels(manufacturerId?: string | null): VehicleModel[];
  listTrims(modelId?: string | null): VehicleTrim[];
  getManufacturer(id: string): Manufacturer | undefined;
  getModel(id: string): VehicleModel | undefined;
  getTrim(id: string): VehicleTrim | undefined;
}

const LS_KEY = "sarat.masterdata.vehicle_catalog.v1";
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

interface DB { manufacturers: Manufacturer[]; models: VehicleModel[]; trims: VehicleTrim[] }

function seed(): DB {
  const mfgs: Manufacturer[] = [
    { id: uid("mfg"), code: "TOY", name_en: "Toyota",    name_ar: "تويوتا",    active: true },
    { id: uid("mfg"), code: "LEX", name_en: "Lexus",     name_ar: "لكزس",      active: true },
    { id: uid("mfg"), code: "NIS", name_en: "Nissan",    name_ar: "نيسان",     active: true },
    { id: uid("mfg"), code: "HYU", name_en: "Hyundai",   name_ar: "هيونداي",   active: true },
    { id: uid("mfg"), code: "KIA", name_en: "Kia",       name_ar: "كيا",       active: true },
    { id: uid("mfg"), code: "FRD", name_en: "Ford",      name_ar: "فورد",      active: true },
    { id: uid("mfg"), code: "CHV", name_en: "Chevrolet", name_ar: "شيفروليه",  active: true },
    { id: uid("mfg"), code: "GMC", name_en: "GMC",       name_ar: "جي إم سي",  active: true },
  ];

  const byCode = (c: string) => mfgs.find(m => m.code === c)!.id;

  const modelsSpec: Record<string, { name: string; trims: string[] }[]> = {
    TOY: [
      { name: "Camry",        trims: ["LE", "SE", "GLE", "XLE", "Limited"] },
      { name: "Corolla",      trims: ["XLI", "GLI", "SE", "Sport"] },
      { name: "Yaris",        trims: ["Y", "Y Plus", "Sport"] },
      { name: "Hilux",        trims: ["DLX", "GLX", "GR-Sport", "Adventure"] },
      { name: "Land Cruiser", trims: ["GXR", "VXR", "VX", "GR-Sport"] },
      { name: "Prado",        trims: ["TXL", "VXL", "GXR"] },
      { name: "Fortuner",     trims: ["EXR", "VXR", "GR-Sport"] },
      { name: "Rav4",         trims: ["LE", "XLE", "Limited"] },
    ],
    LEX: [
      { name: "ES",  trims: ["300h", "350"] },
      { name: "LX",  trims: ["570", "600"] },
      { name: "RX",  trims: ["350", "500h"] },
      { name: "NX",  trims: ["250", "350h"] },
    ],
    NIS: [
      { name: "Patrol",  trims: ["XE", "SE", "LE", "Platinum", "Nismo"] },
      { name: "Sunny",   trims: ["S", "SV", "SL"] },
      { name: "Altima",  trims: ["S", "SV", "SL"] },
      { name: "X-Trail", trims: ["S", "SV", "SL"] },
      { name: "Navara",  trims: ["SE", "LE", "Platinum"] },
    ],
    HYU: [
      { name: "Tucson",  trims: ["GL", "GLS", "Smart"] },
      { name: "Elantra", trims: ["GL", "GLS", "Smart"] },
      { name: "Sonata",  trims: ["Smart", "Comfort", "Premium"] },
      { name: "Santa Fe", trims: ["Smart", "Comfort", "Premium"] },
      { name: "Accent",  trims: ["GL", "GLS"] },
    ],
    KIA: [
      { name: "Sportage", trims: ["LX", "EX", "GT-Line"] },
      { name: "Cerato",   trims: ["LX", "EX"] },
      { name: "Sorento",  trims: ["LX", "EX", "GT-Line"] },
      { name: "Pegas",    trims: ["LX", "EX"] },
    ],
    FRD: [
      { name: "F-150",     trims: ["XL", "XLT", "Lariat", "King Ranch", "Platinum", "Raptor"] },
      { name: "Explorer",  trims: ["XLT", "Limited", "Platinum"] },
      { name: "Edge",      trims: ["SE", "SEL", "Titanium"] },
      { name: "Mustang",   trims: ["EcoBoost", "GT", "Mach 1"] },
    ],
    CHV: [
      { name: "Tahoe",    trims: ["LS", "LT", "RST", "Premier", "High Country"] },
      { name: "Suburban", trims: ["LS", "LT", "RST", "Premier"] },
      { name: "Silverado",trims: ["WT", "LT", "RST", "LTZ", "High Country"] },
      { name: "Captiva",  trims: ["LS", "LT", "Premier"] },
    ],
    GMC: [
      { name: "Yukon",  trims: ["SLE", "SLT", "AT4", "Denali"] },
      { name: "Sierra", trims: ["SLE", "SLT", "AT4", "Denali"] },
      { name: "Terrain",trims: ["SLE", "SLT", "AT4", "Denali"] },
    ],
  };

  const models: VehicleModel[] = [];
  const trims: VehicleTrim[] = [];
  for (const code of Object.keys(modelsSpec)) {
    for (const m of modelsSpec[code]) {
      const model: VehicleModel = { id: uid("mdl"), manufacturer_id: byCode(code), name: m.name, active: true };
      models.push(model);
      for (const t of m.trims) {
        trims.push({ id: uid("trm"), model_id: model.id, name: t, active: true });
      }
    }
  }

  return { manufacturers: mfgs, models, trims };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {}
  const s = seed();
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
  return s;
}

export const localStorageVehicleCatalogRepo: VehicleCatalogRepository = {
  listManufacturers() {
    return load().manufacturers.filter(m => m.active)
      .sort((a, b) => a.name_en.localeCompare(b.name_en));
  },
  listModels(manufacturerId) {
    const db = load();
    return db.models
      .filter(m => m.active && (!manufacturerId || m.manufacturer_id === manufacturerId))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  listTrims(modelId) {
    const db = load();
    return db.trims
      .filter(t => t.active && (!modelId || t.model_id === modelId))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  getManufacturer(id) { return load().manufacturers.find(m => m.id === id); },
  getModel(id) { return load().models.find(m => m.id === id); },
  getTrim(id) { return load().trims.find(t => t.id === id); },
};
