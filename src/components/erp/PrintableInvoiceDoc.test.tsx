/**
 * Layout / visual regression tests for the approved Invoice Template v1.0.
 *
 * These tests guard the print rules that cannot be expressed in a pure unit
 * test of a single function — they assert the *rendered DOM* the browser
 * print engine will paginate, across multiple invoice sizes:
 *
 *   1. ERP internal refs (PR / PO / ALC / ALC-CONF / PI / SO / DN / SI) MUST
 *      NEVER appear in the printable document.
 *   2. The items table MUST expose a real <thead> with the approved 9 columns,
 *      because `thead { display: table-header-group }` is what makes the
 *      header repeat on every printed page.
 *   3. Every line item must render exactly one <tr> in <tbody> — verifies
 *      natural flow works for 1, 25, and 120 vehicles (multi-page).
 *   4. Financial Summary and Signature footer MUST carry the `avoid-break`
 *      class so they are not split across pages.
 *   5. VIN column must remain visible (bold, dir="ltr").
 *
 * Combined with the print-CSS contract test below, these checks fail the
 * build the moment a regression sneaks in.
 */
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrintableInvoiceDoc, type InvoiceLine } from "./PrintableInvoiceDoc";

const ERP_REF_TOKENS = [
  "PR-", "PO-", "ALC-", "ALCC-", "ALC-CONF", "PINV-",
  "SO-", "DN-", "INV-EXAMPLE",
  "مراجع ERP",
];

const APPROVED_HEADERS = [
  "م",
  "رقم الهيكل VIN",
  "وصف المنتج / الخدمة",
  "اللون",
  "سنة الموديل",
  "السعر الأساسي",
  "الخصم",
  "الضريبة",
  "الإجمالي",
];

function makeItems(n: number): InvoiceLine[] {
  return Array.from({ length: n }, (_, i) => ({
    vin: `JTNB11HK1S30${String(i).padStart(4, "0")}`,
    description: `تويوتا كامري LE — وحدة ${i + 1}`,
    color: i % 2 ? "أبيض لؤلؤي" : "أسود",
    model_year: 2025,
    base_price: 120_000,
    discount: 5_000,
    vat_pct: 15,
  }));
}

function renderInvoice(itemCount: number) {
  return render(
    <PrintableInvoiceDoc
      variant="sales"
      statusKind="paid"
      statusLabel="مدفوعة"
      invoice_no="INV-2025-001234"
      invoice_date="01-01-2025"
      supply_date="01-01-2025"
      branch="معرض الرياض الرئيسي"
      payment_method="تحويل بنكي"
      seller={{
        name: "شركة معرض الخليج العربي للسيارات",
        cr_number: "1010XXXXXX",
        vat_number: "300XXXXXXXXXXX",
        address: "الرياض",
        contact: "+966 11 234 5678",
      }}
      buyer={{
        name: "عبد الله بن عبد العزيز",
        cr_number: "1010XXXXXX",
        vat_number: "300XXXXXXXXXXX",
        address: "جدة",
        contact: "+966 50 123 4567",
      }}
      items={makeItems(itemCount)}
      totalVehicleValue={120_000 * itemCount}
      totalDiscounts={5_000 * itemCount}
      netBeforeVat={115_000 * itemCount}
      vatAmount={17_250 * itemCount}
      finalTotal={132_250 * itemCount}
    />
  );
}

describe("PrintableInvoiceDoc — approved template v1.0 layout contract", () => {
  describe.each([
    { label: "1 vehicle (single page)", count: 1 },
    { label: "25 vehicles (~2 pages)", count: 25 },
    { label: "120 vehicles (~5 pages)", count: 120 },
  ])("$label", ({ count }) => {
    it("never prints ERP internal references", () => {
      const { container } = renderInvoice(count);
      const text = container.textContent ?? "";
      for (const token of ERP_REF_TOKENS) {
        expect(
          text.includes(token),
          `ERP ref "${token}" leaked into printable document`
        ).toBe(false);
      }
    });

    it("renders a real <thead> with the 9 approved columns (drives print header repeat)", () => {
      const { container } = renderInvoice(count);
      const tables = container.querySelectorAll("table.erp-table");
      // The items table is the first .erp-table inside the print area.
      const items = tables[0];
      expect(items).toBeTruthy();

      const thead = items.querySelector("thead");
      expect(thead, "items table must have <thead> for header repetition").toBeTruthy();

      const ths = Array.from(thead!.querySelectorAll("th")).map(
        (th) => (th.textContent ?? "").trim()
      );
      expect(ths).toEqual(APPROVED_HEADERS);
    });

    it(`renders all ${count} item rows in <tbody> for natural pagination`, () => {
      const { container } = renderInvoice(count);
      const tbody = container.querySelector("table.erp-table tbody")!;
      const rows = within(tbody as HTMLElement).getAllByRole("row");
      expect(rows).toHaveLength(count);
    });

    it("keeps VIN visible (bold, ltr) on every row", () => {
      const { container } = renderInvoice(count);
      const vinCells = container.querySelectorAll(
        'table.erp-table tbody td[dir="ltr"]'
      );
      expect(vinCells.length).toBe(count);
      vinCells.forEach((cell) => {
        expect(cell.className).toMatch(/font-bold/);
        expect((cell.textContent ?? "").trim().length).toBeGreaterThan(0);
      });
    });

    it("keeps Financial Summary and Signatures together (avoid-break)", () => {
      const { container } = renderInvoice(count);
      const summary = Array.from(
        container.querySelectorAll(".avoid-break")
      ).filter((el) => (el.textContent ?? "").includes("الملخص المالي"));
      expect(summary.length).toBeGreaterThan(0);

      const footer = container.querySelector("footer");
      expect(footer).toBeTruthy();
      expect(footer!.className).toMatch(/avoid-break/);
    });
  });
});

describe("Print CSS contract (src/index.css)", () => {
  const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");
  // Isolate the @media print block so we don't accidentally match screen rules.
  const printBlockMatch = css.match(/@media\s+print\s*\{([\s\S]*?)\n\}\s*\n\s*@media\s+screen/);
  const printCss = printBlockMatch ? printBlockMatch[1] : "";

  it("exposes a @media print block", () => {
    expect(printCss.length).toBeGreaterThan(0);
  });

  it("forces <thead> to repeat as a table-header-group on every page", () => {
    expect(printCss).toMatch(/thead\s*\{[^}]*display:\s*table-header-group\s*!important/);
  });

  it("allows tables to break across pages naturally", () => {
    expect(printCss).toMatch(/table\s*\{[^}]*page-break-inside:\s*auto\s*!important/);
    expect(printCss).toMatch(/tbody\s*\{[^}]*break-inside:\s*auto\s*!important/);
  });

  it("keeps individual rows from splitting mid-row", () => {
    expect(printCss).toMatch(/tr\s+\{[^}]*break-inside:\s*avoid\s*!important/);
  });

  it("honors .avoid-break / .keep-together for grouped sections", () => {
    expect(printCss).toMatch(/\.avoid-break,\s*\.keep-together\s*\{[^}]*break-inside:\s*avoid\s*!important/);
  });

  it("only renders the portaled print host while printing", () => {
    expect(printCss).toMatch(/body\s*>\s*\*:not\(\.doc-print-host\)\s*\{\s*display:\s*none\s*!important/);
  });

  it("preserves repeated thead fill color across pages", () => {
    expect(printCss).toMatch(/\.erp-table\s+thead[^{]*\{[^}]*print-color-adjust:\s*exact\s*!important/);
  });
});
