import { useState, ReactNode } from "react";
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
 *   The same `doc` node (e.g. <PrintableInvoiceDoc />) drives all three modes.
 *
 *   - Preview → opens an on-screen Dialog showing the doc.
 *   - Print / PDF → fires window.print(); the browser uses the always-mounted,
 *     off-screen copy below (NOT the dialog).
 *
 * Why an off-screen copy is required:
 *   Radix DialogContent uses CSS transforms (translate-x/y) which create a new
 *   containing block. The global print CSS positions `.print-area` with
 *   `position: absolute; inset: 0` to fill the A4 page — but a transformed
 *   ancestor clips it to the dialog box (max-w-5xl, max-h-[92vh], overflow-auto).
 *   That is why preview looked correct but print/PDF rendered cropped/different.
 *
 *   The off-screen `<div>` below is mounted directly in the page (no transform
 *   ancestors), so `.print-area` correctly fills the page when printing. The
 *   Dialog is hidden on print to prevent a duplicate, clipped print-area.
 */
export function DocPrintActions({ doc, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);

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

      {/*
        Always-mounted, transform-free copy used exclusively by the print pipeline.
        Hidden on screen via fixed off-canvas positioning (NOT display:none or
        visibility:hidden — those break print). On print, the global rules
        (`body * { visibility: hidden }` + `.print-area, .print-area * { visibility: visible }`
        + `.print-area { position: absolute; inset: 0 }`) take over and render
        this copy as the full A4 document.
      */}
      <div
        aria-hidden
        className="fixed top-0 pointer-events-none"
        style={{ left: "-100000px", width: "210mm" }}
      >
        {doc}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        {/*
          Dialog is for ON-SCREEN preview only. It is hidden from print so it
          cannot produce a second (clipped) .print-area inside the transformed
          DialogContent. Without `print:hidden` here, the printed page would
          show the dialog's cropped copy instead of (or on top of) the full
          off-screen copy above.
        */}
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
