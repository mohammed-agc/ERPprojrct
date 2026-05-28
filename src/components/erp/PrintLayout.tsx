import { ReactNode } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title?: string;
  subtitle?: string;
  orgName?: string;
  vatNumber?: string;
  documentNo?: string;
  documentDate?: string;
  watermark?: string;
  showSignatures?: boolean;
  children: ReactNode;
  /** trigger to render outside the print area. defaults to a print button */
  printTrigger?: ReactNode;
}

/**
 * Saudi/Arabic-ready print/PDF wrapper for ERP documents.
 * Use inside any document page; only `.print-area` is rendered to print.
 * Pair with global print styles in index.css.
 */
export function PrintLayout({
  title, subtitle, orgName = "SARAT ERP", vatNumber,
  documentNo, documentDate, watermark, showSignatures, children, printTrigger,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 print:hidden">
        {printTrigger ?? (
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5 ml-1" /> طباعة / PDF
          </Button>
        )}
      </div>

      <div dir="rtl" className="print-area bg-card border border-border rounded-lg p-6 print:border-0 print:p-0 print:rounded-none relative">
        {watermark && (
          <div aria-hidden className="print-watermark pointer-events-none select-none absolute inset-0 flex items-center justify-center">
            <div className="text-[140px] font-black opacity-[0.06] rotate-[-25deg] tracking-widest">{watermark}</div>
          </div>
        )}

        <header className="flex items-start justify-between border-b border-border pb-4 mb-4">
          <div>
            <div className="text-lg font-bold">{orgName}</div>
            {vatNumber && <div className="text-[11px] text-muted-foreground mt-0.5">الرقم الضريبي: <span className="font-mono">{vatNumber}</span></div>}
          </div>
          <div className="text-left">
            {title && <div className="text-base font-bold">{title}</div>}
            {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
            {documentNo && <div className="text-[11px] mt-1">رقم المستند: <span className="font-mono font-semibold">{documentNo}</span></div>}
            {documentDate && <div className="text-[11px]">التاريخ: <span className="font-mono">{documentDate}</span></div>}
          </div>
        </header>

        <div className="relative z-10">{children}</div>

        {showSignatures && (
          <footer className="grid grid-cols-3 gap-6 mt-10 pt-6 border-t border-border text-[11px]">
            {["أعدّ بواسطة", "اعتمد بواسطة", "استلم بواسطة"].map(role => (
              <div key={role} className="text-center">
                <div className="h-12 border-b border-dashed border-muted-foreground/40 mb-1" />
                <div className="text-muted-foreground">{role}</div>
              </div>
            ))}
          </footer>
        )}

        <div className="hidden print:flex justify-between mt-8 text-[9px] text-muted-foreground border-t pt-2">
          <span>SARAT ERP</span>
          <span>صفحة {/* page number filled by browser via CSS */}</span>
        </div>
      </div>
    </div>
  );
}
