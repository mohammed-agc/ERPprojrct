/* UAT: render PrintableInvoiceDoc to standalone HTML pages for chromium PDF */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrintableInvoiceDoc, type InvoiceLine } from "../src/components/erp/PrintableInvoiceDoc";

const indexCss = readFileSync(resolve(import.meta.dir, "../src/index.css"), "utf8");

function items(n: number): InvoiceLine[] {
  return Array.from({ length: n }, (_, i) => ({
    vin: `JTNB11HK1S30${String(i + 1).padStart(4, "0")}`,
    description: `تويوتا كامري LE — وحدة ${i + 1}`,
    color: i % 2 ? "أبيض لؤلؤي" : "أسود ميتاليك",
    model_year: 2025,
    base_price: 120_000,
    discount: 5_000,
    vat_pct: 15,
  }));
}

function render(n: number) {
  const list = items(n);
  const totalBase = 120_000 * n;
  const totalDisc = 5_000 * n;
  const net = totalBase - totalDisc;
  const vat = net * 0.15;
  return renderToStaticMarkup(
    <PrintableInvoiceDoc
      variant="sales"
      statusKind="paid"
      statusLabel="مدفوعة"
      invoice_no={`INV-2025-${String(n).padStart(6, "0")}`}
      invoice_date="01-01-2025"
      supply_date="01-01-2025"
      branch="معرض الرياض الرئيسي"
      payment_method="تحويل بنكي"
      seller={{
        name: "شركة معرض الخليج العربي للسيارات",
        cr_number: "1010123456",
        vat_number: "300123456789003",
        address: "طريق الملك عبدالعزيز، الرياض 12345",
        contact: "+966 11 234 5678",
      }}
      buyer={{
        name: "عبد الله بن عبد العزيز آل سعود",
        cr_number: "1010987654",
        vat_number: "300987654321003",
        address: "جدة، المملكة العربية السعودية",
        contact: "+966 50 123 4567",
      }}
      items={list}
      totalVehicleValue={totalBase}
      totalDiscounts={totalDisc}
      netBeforeVat={net}
      vatAmount={vat}
      finalTotal={net + vat}
    />
  );
}

/**
 * Bridge from Tailwind utility classes used in the doc to plain CSS so we
 * don't need to run a Tailwind build inside the UAT harness. Only the
 * classes actually used by PrintableInvoiceDoc + PrintLayout are mapped.
 */
const bridgeCss = `
  :root {
    --background:210 20% 98%; --foreground:220 25% 15%;
    --card:0 0% 100%; --card-foreground:220 25% 15%;
    --primary:195 85% 30%; --primary-foreground:0 0% 100%;
    --secondary:210 16% 93%; --muted:210 16% 95%; --muted-foreground:215 14% 45%;
    --accent:195 70% 95%; --accent-foreground:195 85% 25%;
    --border:214 20% 88%;
    --table-header:210 20% 96%; --table-row-hover:195 70% 97%; --table-border:214 20% 90%;
    --radius:.375rem;
  }
  *,*::before,*::after { box-sizing: border-box; border: 0 solid hsl(var(--border)); }
  body { font-family:'Cairo','IBM Plex Sans Arabic',system-ui,sans-serif;
         background: hsl(var(--background)); color: hsl(var(--foreground));
         margin: 0; padding: 0; }

  /* layout primitives */
  .grid { display: grid; }
  .grid-cols-2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .grid-cols-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .grid-cols-6 { grid-template-columns: repeat(6, minmax(0,1fr)); }
  .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .md\\:grid-cols-6 { grid-template-columns: repeat(6, minmax(0,1fr)); }
  .md\\:col-start-2 { grid-column-start: 2; }
  .flex { display: flex; }
  .inline-flex { display: inline-flex; }
  .hidden { display: none; }
  .block { display: block; }
  .items-center { align-items: center; } .items-start { align-items: flex-start; } .items-baseline { align-items: baseline; }
  .justify-between { justify-content: space-between; } .justify-center { justify-content: center; } .justify-end { justify-content: flex-end; }
  .text-center { text-align: center; } .text-right { text-align: right; } .text-left { text-align: left; }
  .gap-1 { gap:.25rem; } .gap-1\\.5 { gap:.375rem; } .gap-2 { gap:.5rem; } .gap-3 { gap:.75rem; } .gap-6 { gap:1.5rem; }
  .space-y-0\\.5 > * + * { margin-top:.125rem; } .space-y-1 > * + * { margin-top:.25rem; } .space-y-3 > * + * { margin-top:.75rem; }
  .flex-1 { flex: 1 1 0%; } .flex-wrap { flex-wrap: wrap; } .shrink-0 { flex-shrink: 0; }
  .relative { position: relative; } .absolute { position: absolute; } .inset-0 { inset: 0; }
  .z-10 { z-index: 10; } .pointer-events-none { pointer-events: none; } .select-none { user-select: none; }

  /* spacing */
  .p-1 { padding:.25rem; } .p-2 { padding:.5rem; } .p-2\\.5 { padding:.625rem; } .p-3 { padding:.75rem; } .p-6 { padding:1.5rem; }
  .px-1 { padding-left:.25rem; padding-right:.25rem; } .px-1\\.5 { padding-left:.375rem; padding-right:.375rem; }
  .px-2 { padding-left:.5rem; padding-right:.5rem; } .px-3 { padding-left:.75rem; padding-right:.75rem; } .px-4 { padding-left:1rem; padding-right:1rem; }
  .py-0\\.5 { padding-top:.125rem; padding-bottom:.125rem; } .py-1 { padding-top:.25rem; padding-bottom:.25rem; }
  .py-1\\.5 { padding-top:.375rem; padding-bottom:.375rem; } .py-2 { padding-top:.5rem; padding-bottom:.5rem; } .py-3 { padding-top:.75rem; padding-bottom:.75rem; }
  .m-0 { margin: 0; } .mb-1 { margin-bottom:.25rem; } .mb-1\\.5 { margin-bottom:.375rem; } .mb-2 { margin-bottom:.5rem; } .mb-3 { margin-bottom:.75rem; } .mb-4 { margin-bottom:1rem; }
  .mt-0\\.5 { margin-top:.125rem; } .mt-1 { margin-top:.25rem; } .mt-2 { margin-top:.5rem; } .mt-4 { margin-top:1rem; } .mt-6 { margin-top:1.5rem; } .mt-8 { margin-top:2rem; } .mt-10 { margin-top:2.5rem; }
  .pt-2 { padding-top:.5rem; } .pt-3 { padding-top:.75rem; } .pt-4 { padding-top:1rem; } .pt-6 { padding-top:1.5rem; }
  .pb-4 { padding-bottom:1rem; }
  .ml-1 { margin-left:.25rem; } .ml-auto { margin-left: auto; }
  .-mx-1 { margin-left:-.25rem; margin-right:-.25rem; } .-mx-3 { margin-left:-.75rem; margin-right:-.75rem; }
  .-mb-3 { margin-bottom:-.75rem; }

  /* sizes */
  .h-9 { height: 2.25rem; } .h-12 { height: 3rem; }
  .w-16 { width: 4rem; } .h-16 { height: 4rem; }
  .w-full { width: 100%; } .min-w-\\[110px\\] { min-width: 110px; } .max-w-5xl { max-width: 64rem; }

  /* type */
  .text-\\[9px\\]{font-size:9px;line-height:1.2;} .text-\\[10px\\]{font-size:10px;line-height:1.3;}
  .text-\\[10\\.5px\\]{font-size:10.5px;line-height:1.35;} .text-\\[11px\\]{font-size:11px;line-height:1.35;}
  .text-\\[12px\\]{font-size:12px;line-height:1.4;}
  .text-xs{font-size:12px;line-height:1.4;} .text-sm{font-size:14px;line-height:1.45;}
  .text-base{font-size:16px;line-height:1.5;} .text-lg{font-size:18px;line-height:1.4;}
  .font-mono { font-family: ui-monospace, SFMono-Regular, monospace; }
  .font-medium{font-weight:500;} .font-semibold{font-weight:600;} .font-bold{font-weight:700;} .font-black{font-weight:900;}
  .opacity-70{opacity:.7;} .opacity-80{opacity:.8;} .opacity-\\[0\\.06\\]{opacity:.06;}
  .tracking-wide{letter-spacing:.025em;} .tracking-widest{letter-spacing:.1em;} .tracking-\\[0\\.2em\\]{letter-spacing:.2em;}
  .leading-none{line-height:1;} .leading-tight{line-height:1.25;}
  .whitespace-nowrap{white-space:nowrap;} .uppercase{text-transform:uppercase;}
  .tabular-nums{font-variant-numeric:tabular-nums;}
  .num{font-variant-numeric:tabular-nums;}
  .rotate-\\[-25deg\\]{transform:rotate(-25deg);}
  .translate-y-\\[-2px\\]{transform:translateY(-2px);}

  /* color + bg */
  .bg-card { background: hsl(var(--card)); }
  .bg-background { background: hsl(var(--background)); }
  .bg-muted { background: hsl(var(--muted)); }
  .bg-muted\\/60 { background: hsl(var(--muted)/.6); }
  .bg-primary { background: hsl(var(--primary)); }
  .bg-primary\\/10 { background: hsl(var(--primary)/.1); }
  .bg-amber-50 { background: #fffbeb; }
  .text-foreground { color: hsl(var(--foreground)); }
  .text-muted-foreground { color: hsl(var(--muted-foreground)); }
  .text-primary { color: hsl(var(--primary)); }
  .text-primary-foreground { color: hsl(var(--primary-foreground)); }
  .text-amber-900 { color: #78350f; }
  .border { border-width: 1px; } .border-t { border-top-width: 1px; } .border-t-2 { border-top-width: 2px; }
  .border-b { border-bottom-width: 1px; }
  .border-dashed { border-style: dashed; } .border-dotted { border-style: dotted; }
  .border-border { border-color: hsl(var(--border)); }
  .border-primary { border-color: hsl(var(--primary)); }
  .border-primary\\/30 { border-color: hsl(var(--primary)/.3); }
  .border-muted-foreground\\/40 { border-color: hsl(var(--muted-foreground)/.4); }
  .border-amber-300 { border-color: #fcd34d; } .border-amber-400\\/60 { border-color: rgba(251,191,36,.6); } .border-amber-400\\/70 { border-color: rgba(251,191,36,.7); }
  .rounded { border-radius: var(--radius); } .rounded-t { border-top-left-radius: var(--radius); border-top-right-radius: var(--radius); }
  .rounded-lg { border-radius: .5rem; }
  .overflow-hidden { overflow: hidden; }
`;

function htmlFor(body: string, label: string) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>UAT Invoice — ${label}</title>
<style>${bridgeCss}\n${indexCss}</style>
</head><body><div class="doc-print-host">${body}</div></body></html>`;
}

for (const n of [1, 25]) {
  const out = `/tmp/uat-invoice-${n}.html`;
  writeFileSync(out, htmlFor(render(n), `${n} vehicles`));
  console.log("wrote", out);
}
