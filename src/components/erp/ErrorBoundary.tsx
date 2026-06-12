import React from "react";
import { AlertOctagon, RotateCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface State { hasError: boolean; error?: Error; }
interface Props { children: React.ReactNode; scope?: "app" | "page"; }

/**
 * ERP error boundary — graceful degradation with retry + home actions.
 * Use scope="page" for per-route safety (preserves shell), "app" for root.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    const isPage = this.props.scope === "page";

    return (
      <div dir="rtl" className={isPage ? "p-6" : "min-h-screen flex items-center justify-center p-6 bg-background"}>
        <div className="max-w-md w-full bg-card border border-destructive/30 rounded-lg p-6 text-center space-y-3 shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertOctagon className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-base font-bold text-foreground">حدث خطأ غير متوقع</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            تعذّر عرض هذا الجزء من النظام. يمكنك المحاولة مجدداً أو العودة للرئيسية.
          </p>
          {this.state.error?.message && (
            <pre className="text-[11.5px] bg-muted p-2 rounded text-left overflow-auto max-h-24 text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2 justify-center pt-2">
            <Button size="sm" variant="outline" onClick={this.reset}>
              <RotateCw className="h-3.5 w-3.5 ml-1" /> المحاولة مجدداً
            </Button>
            <Button size="sm" onClick={() => { window.location.href = "/"; }}>
              <Home className="h-3.5 w-3.5 ml-1" /> الرئيسية
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
