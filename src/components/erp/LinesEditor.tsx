import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fmtSAR, type ItemKind } from "@/services/erp/purchasing";
import {
  vehicleCatalogService, colorsService,
  type ProductCategory,
} from "@/services/erp/masterData";
import { CascadeSelect } from "./master/CascadeSelect";
import { NumberCell } from "./master/NumberCell";
import { ColorCell } from "./master/ColorCell";
import { ProductPicker } from "./ProductPicker";

/* ===== Public draft shape — superset of purchasing.LineItem input fields ===== */
/* ===== Public draft shape — superset of purchasing.LineItem input fields ===== */
export interface LineDraft {
  kind: ItemKind;                       // vehicle | part
  product_id?: string; product_code?: string;
  description: string;
  manufacturer_id?: string; manufacturer?: string;
  model_id?: string; model?: string;
  trim_id?: string; trim?: string;
  brand?: string;
  year?: number;
  color_id?: string; color_name?: string; color_hex?: string;
  qty: number;
  unit_cost: number;
  vat_pct: number;
  /** internal: true once user has edited description by hand */
  _descTouched?: boolean;
}

export const emptyLine = (): LineDraft => ({
  kind: "vehicle",
  description: "",
  qty: 1,
  unit_cost: 0,
  vat_pct: 15,
});

interface Props {
  items: LineDraft[];
  onChange: (items: LineDraft[]) => void;
  /** Restrict product picker / line type to this category. */
  lockedCategory?: ProductCategory | null;
  /** Show pre-VAT, VAT and grand total summary. */
  showTotals?: boolean;
}

export function LinesEditor({ items, onChange, lockedCategory, showTotals = true }: Props) {
  const subtotal = items.reduce((s, i) => s + (i.qty || 0) * (i.unit_cost || 0), 0);
  const vatTotal = items.reduce((s, i) => s + (i.qty || 0) * (i.unit_cost || 0) * ((i.vat_pct || 0) / 100), 0);
  const grand = subtotal + vatTotal;

  const update = (idx: number, patch: Partial<LineDraft>) =>
    onChange(items.map((it, i) => (i === idx ? autoDescription({ ...it, ...patch }) : it)));

  const remove = (idx: number) =>
    onChange(items.length === 1 ? items : items.filter((_, i) => i !== idx));

  const add = () => {
    const k: ItemKind = lockedCategory === "part" ? "part" : "vehicle";
    onChange([...items, { ...emptyLine(), kind: k }]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">سطور الأصناف</Label>
        <Button size="sm" variant="outline" className="h-7" onClick={add}>
          <Plus className="h-3.5 w-3.5 ml-1" /> سطر جديد
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="erp-table text-[11px]">
          <thead>
            <tr>
              <th className="w-[70px]">النوع</th>
              <th className="min-w-[110px]">الصانع</th>
              <th className="min-w-[140px]">الموديل</th>
              <th className="min-w-[110px]">الفئة/الطراز</th>
              <th className="w-[80px]">السنة</th>
              <th className="w-[130px]">اللون</th>
              <th className="w-[80px]">الكمية</th>
              <th className="w-[130px]">سعر الوحدة (ر.س)</th>
              <th className="w-[80px]">ض.ق.م</th>
              <th className="w-[120px]">الإجمالي</th>
              <th className="w-[36px]"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <LineRow
                key={idx}
                it={it}
                lockedCategory={lockedCategory}
                onPatch={(p) => update(idx, p)}
                onRemove={() => remove(idx)}
                canRemove={items.length > 1}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Description preview (auto-built, editable) */}
      <div className="space-y-1">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground w-12 shrink-0">#{idx + 1}</span>
            <Input
              value={it.description}
              onChange={(e) => onChange(items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
              placeholder="الوصف يُولَّد تلقائياً من الحقول أعلاه — قابل للتعديل"
              className="h-7 text-[11px]"
            />
          </div>
        ))}
      </div>

      {showTotals && (
        <div className="flex justify-end pt-1">
          <div className="text-xs space-y-0.5 text-left">
            <div>قبل الضريبة: <span className="font-mono">{fmtSAR(subtotal)}</span></div>
            <div>الضريبة: <span className="font-mono">{fmtSAR(vatTotal)}</span></div>
            <div className="text-sm">الإجمالي: <span className="font-bold font-mono">{fmtSAR(grand)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ====================================== Row ====================================== */

function LineRow({
  it, lockedCategory, onPatch, onRemove, canRemove,
}: {
  it: LineDraft;
  lockedCategory?: ProductCategory | null;
  onPatch: (p: Partial<LineDraft>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const isVehicle = it.kind === "vehicle";

  const manufacturers = useMemo(() => vehicleCatalogService.listManufacturers(), []);
  const models = useMemo(
    () => it.manufacturer_id ? vehicleCatalogService.listModels(it.manufacturer_id) : [],
    [it.manufacturer_id],
  );
  const trims = useMemo(
    () => it.model_id ? vehicleCatalogService.listTrims(it.model_id) : [],
    [it.model_id],
  );

  const lineTotal = (it.qty || 0) * (it.unit_cost || 0) * (1 + (it.vat_pct || 0) / 100);

  return (
    <tr>
      {/* النوع */}
      <td>
        <Select
          value={it.kind}
          onValueChange={(v) => onPatch({
            kind: v as ItemKind,
            // reset vehicle-only fields when leaving vehicle
            ...(v !== "vehicle" ? {
              manufacturer_id: undefined, manufacturer: undefined,
              model_id: undefined, model: undefined,
              trim_id: undefined, trim: undefined,
              year: undefined, color_id: undefined, color_name: undefined, color_hex: undefined,
            } : {}),
          })}
          disabled={lockedCategory === "vehicle" || lockedCategory === "part"}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="vehicle">مركبة</SelectItem>
            <SelectItem value="part">قطعة/خدمة</SelectItem>
          </SelectContent>
        </Select>
      </td>

      {/* الصانع / الموديل / الفئة */}
      {isVehicle ? (
        <>
          <td>
            <CascadeSelect
              value={it.manufacturer_id}
              options={manufacturers.map(m => ({ id: m.id, label: m.name_en, sublabel: m.name_ar }))}
              onChange={(o) => onPatch({
                manufacturer_id: o.id, manufacturer: o.label,
                model_id: undefined, model: undefined,
                trim_id: undefined, trim: undefined,
              })}
              placeholder="الصانع"
            />
          </td>
          <td>
            <CascadeSelect
              value={it.model_id}
              options={models.map(m => ({ id: m.id, label: m.name }))}
              onChange={(o) => onPatch({
                model_id: o.id, model: o.label,
                trim_id: undefined, trim: undefined,
              })}
              disabled={!it.manufacturer_id}
              placeholder={it.manufacturer_id ? "الموديل" : "اختر الصانع أولاً"}
            />
          </td>
          <td>
            <CascadeSelect
              value={it.trim_id}
              options={trims.map(t => ({ id: t.id, label: t.name }))}
              onChange={(o) => onPatch({ trim_id: o.id, trim: o.label })}
              disabled={!it.model_id}
              placeholder={it.model_id ? "الفئة" : "—"}
            />
          </td>
          <td>
            <NumberCell
              value={it.year}
              onChange={(v) => onPatch({ year: v })}
              integer
              min={1990}
              max={2100}
              placeholder="2025"
            />
          </td>
          <td>
            <ColorCell
              value={it.color_id}
              onChange={(c) => onPatch({ color_id: c.id, color_name: c.name_ar, color_hex: c.hex })}
            />
          </td>
        </>
      ) : (
        <>
          <td colSpan={3}>
            <ProductPicker
              value={it.product_id ?? null}
              category={lockedCategory === "vehicle" ? null : (lockedCategory ?? null)}
              onChange={(p) => onPatch({
                product_id: p.id, product_code: p.code,
                kind: p.category === "vehicle" ? "vehicle" : "part",
                description: p.name,
                brand: p.brand, model: p.model, year: p.year,
                unit_cost: p.default_unit_price ?? it.unit_cost,
              })}
              placeholder="اختر منتجاً (قطعة/خدمة)..."
            />
          </td>
          <td className="text-center text-muted-foreground">—</td>
          <td className="text-center text-muted-foreground">—</td>
        </>
      )}

      <td>
        <NumberCell value={it.qty} onChange={(v) => onPatch({ qty: v ?? 0 })} integer min={1} />
      </td>
      <td>
        <NumberCell value={it.unit_cost} onChange={(v) => onPatch({ unit_cost: v ?? 0 })} currency min={0} />
      </td>
      <td>
        <Select value={String(it.vat_pct)} onValueChange={(v) => onPatch({ vat_pct: Number(v) })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0%</SelectItem>
            <SelectItem value="15">15%</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className={cn("num text-[12px] font-semibold")}>{fmtSAR(lineTotal)}</td>
      <td>
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 p-0 text-destructive"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label="حذف السطر"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

/* ============================== Auto description ============================== */

function autoDescription(it: LineDraft): LineDraft {
  if (it.kind !== "vehicle") return it;
  const parts = [it.manufacturer, it.model, it.trim, it.year ? String(it.year) : "", it.color_name]
    .filter(Boolean).join(" ");
  // Only overwrite when user hasn't customised, OR description matches previous auto value.
  const prev = it.description?.trim() ?? "";
  const looksAuto = prev === "" || autoMatches(prev);
  return looksAuto ? { ...it, description: parts } : it;
}

// Heuristic — description is auto if it's empty or matches the cascade-only pattern.
function autoMatches(s: string): boolean {
  // very loose: tokens are short alphanumeric + Arabic words separated by spaces
  return /^[A-Za-z0-9\u0600-\u06FF\s\-]+$/.test(s);
}

/* Helper to expose color hex on the in-memory list for color picker integration */
// (kept here so callers don't need to import colorsService just to resolve hex)
export function colorHexById(id?: string): string | undefined {
  if (!id) return undefined;
  return colorsService.list().find(c => c.id === id)?.hex;
}
