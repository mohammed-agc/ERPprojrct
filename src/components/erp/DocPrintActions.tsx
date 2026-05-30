import { useState, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Eye, Printer, FileDown } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface Props {
  /** Rendered printable document (e.g. <PrintableInvoiceDoc … />) */
  doc: ReactNode;
  /** Compact button variant for header areas */
  size?: "sm" | "default";
}

/**
 * Unified Preview / Print / Export PDF action bar.
 *
 * SINGLE SOURCE OF TRUTH:
 *   The same `doc` node drives Preview, Print and PDF.
 *
 * Strategy:
 *   - Preview → Radix Dialog (on-screen only, print:hidden).
 *   - Print / PDF → an always-mounted copy portaled directly to <body> as a
 *     top-level node (`.doc-print-host`). On screen it is positioned off-canvas;
 *     on print, global CSS hides every other top-level body child via
 *     `display:none` and lets the host flow naturally — so tables paginate,
 *     thead repeats, and no trailing blank pages appear.
 *
 *   Portaling avoids transformed ancestors (Radix Dialog, layout wrappers)
 *   which would otherwise turn `.print-area` into a clipped absolute box.
 */
export function DocPrintActions({ doc, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <>
      <div className="flex items-center gap-2 print:hidden">
        <Button size={size} variant="outline" onClick={() => setOpen(true)}>
          <Eye className="h-3.5 w-3.5 ml-1" /> معاينة
        </Button>
        <Button size={size} variant="outline" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5 ml-1" /> طباعة
        </Button>
        <Button size={size} variant="outline" onClick={() => window.print()}>
          <FileDown className="h-3.5 w-3.5 ml-1" /> PDF
        </Button>
      </div>

      {mounted &&
        createPortal(
          <div aria-hidden className="doc-print-host">
            {doc}
          </div>,
          document.body
        )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir="rtl"
          className="max-w-5xl max-h-[92vh] overflow-y-auto p-4 print:hidden"
        >
          <VisuallyHidden asChild>
            <DialogTitle>معاينة المستند</DialogTitle>
          </VisuallyHidden>
          <div className="flex items-center justify-end gap-2 mb-2">
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 ml-1" /> طباعة
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <FileDown className="h-3.5 w-3.5 ml-1" /> تصدير PDF
            </Button>
          </div>
          {doc}
        </DialogContent>
      </Dialog>
    </>
  );
}
