import { useState, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Eye, Printer, FileDown } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface Props {
  /** Rendered printable document (e.g. <PrintablePurchaseDoc … />) */
  doc: ReactNode;
  /** Compact button variant for header areas */
  size?: "sm" | "default";
}

/**
 * Unified Preview / Print / Export PDF action bar.
 * - Preview  → opens dialog showing the printable doc
 * - Print    → opens dialog, then triggers window.print()
 * - PDF      → same flow; user picks "Save as PDF" in the browser dialog
 *
 * The printable area uses the `.print-area` class from PrintLayout, so global
 * `@media print` rules already scope the page output correctly.
 */
export function DocPrintActions({ doc, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);

  const triggerPrint = () => {
    setOpen(true);
    // wait for dialog mount before invoking the browser print dialog
    setTimeout(() => window.print(), 350);
  };

  return (
    <>
      <div className="flex items-center gap-2 print:hidden">
        <Button size={size} variant="outline" onClick={() => setOpen(true)}>
          <Eye className="h-3.5 w-3.5 ml-1" /> معاينة
        </Button>
        <Button size={size} variant="outline" onClick={triggerPrint}>
          <Printer className="h-3.5 w-3.5 ml-1" /> طباعة
        </Button>
        <Button size={size} variant="outline" onClick={triggerPrint}>
          <FileDown className="h-3.5 w-3.5 ml-1" /> PDF
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir="rtl"
          className="max-w-5xl max-h-[92vh] overflow-y-auto p-4 print:max-w-none print:max-h-none print:p-0 print:overflow-visible print:shadow-none print:border-0"
        >
          <VisuallyHidden asChild>
            <DialogTitle>معاينة المستند</DialogTitle>
          </VisuallyHidden>
          <div className="flex items-center justify-end gap-2 mb-2 print:hidden">
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
