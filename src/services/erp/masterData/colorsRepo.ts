import type { ColorsRepository, VehicleColor } from "./types";

const LS_KEY = "sarat.masterdata.vehicle_colors.v1";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const isoNow = () => new Date().toISOString();

function seed(): VehicleColor[] {
  const now = isoNow();
  const mk = (n: number, ar: string, en: string, hex: string): VehicleColor => ({
    id: uid("clr"), code: `CLR-${String(n).padStart(4, "0")}`,
    name_ar: ar, name_en: en, hex, active: true, created_at: now,
  });
  return [
    mk(1, "أبيض لؤلؤي", "Pearl White", "#F5F5F5"),
    mk(2, "أبيض ثلجي", "Snow White", "#FFFFFF"),
    mk(3, "أسود", "Black", "#0A0A0A"),
    mk(4, "فضي", "Silver", "#C0C0C0"),
    mk(5, "رمادي", "Gray", "#7A7A7A"),
    mk(6, "أحمر", "Red", "#B91C1C"),
    mk(7, "أزرق غامق", "Dark Blue", "#1E3A8A"),
    mk(8, "أزرق سماوي", "Sky Blue", "#3B82F6"),
    mk(9, "ذهبي", "Gold", "#D4AF37"),
    mk(10, "بني", "Brown", "#78350F"),
    mk(11, "بيج", "Beige", "#D6C7A1"),
    mk(12, "أخضر داكن", "Dark Green", "#14532D"),
  ];
}

function load(): VehicleColor[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as VehicleColor[];
  } catch {}
  const s = seed();
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
  return s;
}
function save(items: VehicleColor[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {}
}

function nextCode(items: VehicleColor[]): string {
  const max = items
    .map(c => parseInt(c.code.replace("CLR-", ""), 10))
    .filter(n => !Number.isNaN(n))
    .reduce((m, n) => Math.max(m, n), 0);
  return `CLR-${String(max + 1).padStart(4, "0")}`;
}

export const localStorageColorsRepo: ColorsRepository = {
  list() { return load().slice().sort((a, b) => a.code.localeCompare(b.code)); },
  listActive() { return this.list().filter(c => c.active); },
  get(id) { return load().find(c => c.id === id); },

  create(input) {
    const items = load();
    const color: VehicleColor = {
      id: uid("clr"),
      code: nextCode(items),
      name_ar: input.name_ar,
      name_en: input.name_en,
      hex: input.hex,
      active: input.active ?? true,
      created_at: isoNow(),
    };
    items.unshift(color);
    save(items);
    return color;
  },

  update(id, patch) {
    const items = load();
    const idx = items.findIndex(c => c.id === id);
    if (idx < 0) return undefined;
    items[idx] = { ...items[idx], ...patch, id: items[idx].id, created_at: items[idx].created_at };
    save(items);
    return items[idx];
  },

  toggleActive(id) {
    const items = load();
    const c = items.find(x => x.id === id);
    if (!c) return undefined;
    c.active = !c.active;
    save(items);
    return c;
  },
};
