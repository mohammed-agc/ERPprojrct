import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Search, Check, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { productsService, type Product, type ProductCategory, PRODUCT_CATEGORY_LABEL } from "@/services/erp/masterData";

interface Props {
  value: string | null;
  onChange: (product: Product) => void;
  /** Restrict picker to a specific category (role-based). null = show all. */
  category?: ProductCategory | null;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * ERP product picker — role/department-aware.
 *
 *  - Automotive dept → vehicles
 *  - Spare Parts dept → parts
 *  - Maintenance dept → services
 *
 * Pass `category` to filter; omit/null to show all.
 */
export function ProductPicker({ value, onChange, category, disabled, placeholder = "اختر منتجاً..." }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<ProductCategory | "all">(category ?? "all");

  // When a category is locked by role, ignore activeCat tabs
  const effectiveCat: ProductCategory | "all" = category ?? activeCat;

  const allProducts = useMemo(() => productsService.list().filter(p => p.active), [open]);
  const filtered = useMemo(() => {
    let list = allProducts;
    if (effectiveCat !== "all") list = list.filter(p => p.category === effectiveCat);
    const t = q.trim().toLowerCase();
    if (t) list = list.filter(p =>
      p.name.toLowerCase().includes(t) ||
      p.code.toLowerCase().includes(t) ||
      (p.brand ?? "").toLowerCase().includes(t) ||
      (p.model ?? "").toLowerCase().includes(t)
    );
    return list.slice(0, 50);
  }, [allProducts, effectiveCat, q]);

  const selected = allProducts.find(p => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button"
          className={cn(
            "w-full h-8 px-2 flex items-center justify-between gap-2 text-xs rounded border",
            selected ? "border-border bg-background" : "border-dashed border-border bg-muted/20",
            "hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-primary text-right",
            disabled && "opacity-60 cursor-not-allowed"
          )}>
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.code} · ${selected.name}` : placeholder}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[480px] max-w-[92vw]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="بحث عن منتج..." className="flex-1 bg-transparent outline-none text-xs" />
        </div>
        {!category && (
          <div className="flex gap-1 px-2 py-1.5 border-b border-border text-[11px]">
            {(["all", "vehicle", "part", "service"] as const).map(c => (
              <button key={c} onClick={() => setActiveCat(c)}
                className={cn("px-2 py-0.5 rounded", activeCat === c ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
                {c === "all" ? "الكل" : PRODUCT_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        )}
        <div className="max-h-72 overflow-auto">
          {filtered.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8 px-4">
              <Package className="h-5 w-5 mx-auto mb-2 opacity-40" />
              لا توجد منتجات. أضفها من قائمة الأصناف الرئيسية.
            </div>
          )}
          {filtered.map(p => {
            const isSel = p.id === value;
            return (
              <div key={p.id} onClick={() => { onChange(p); setOpen(false); }}
                className={cn("cursor-pointer px-3 py-2 text-xs border-b border-border/40 hover:bg-accent/60",
                  isSel && "bg-primary/10")}>
                <div className="flex items-center gap-2">
                  {isSel && <Check className="h-3 w-3 text-primary shrink-0" />}
                  <span className="font-mono text-muted-foreground">{p.code}</span>
                  <span className="font-semibold truncate">{p.name}</span>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-0.5 pr-5">
                  <span className="px-1 rounded bg-muted">{PRODUCT_CATEGORY_LABEL[p.category]}</span>
                  {p.brand && <span>{p.brand}</span>}
                  {p.year && <span>{p.year}</span>}
                  {p.default_unit_price ? <span className="font-mono">{p.default_unit_price.toLocaleString()} ر.س</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
