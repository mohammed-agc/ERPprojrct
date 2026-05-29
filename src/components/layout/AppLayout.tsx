import { ReactNode, Suspense, useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Search, Command as CommandIcon } from "lucide-react";
import { CommandPalette } from "@/components/erp/CommandPalette";
import { NotificationsCenter } from "@/components/erp/NotificationsCenter";
import { ActivityCenter } from "@/components/erp/ActivityCenter";
import { QuickActionsMenu } from "@/components/erp/QuickActionsMenu";
import { FavoritesMenu } from "@/components/erp/FavoritesMenu";
import { ShortcutsDialog } from "@/components/erp/ShortcutsDialog";
import { ErrorBoundary } from "@/components/erp/ErrorBoundary";
import { OnlineStatusBanner } from "@/components/erp/OnlineStatusBanner";
import { UatBanner } from "@/components/erp/UatBanner";
import { UatResetButton } from "@/components/erp/UatResetButton";
export default function AppLayout({ children }: { children?: ReactNode }) {
  const { user, loading, profile, department, signOut, roles } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <UatBanner />
        <header className="h-12 bg-card border-b border-border flex items-center justify-between px-3 sticky top-0 z-10 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden md:flex items-center gap-2 h-8 w-[280px] px-2.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-xs text-muted-foreground transition"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-right">بحث شامل، عمليات، تنقل...</span>
              <kbd className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded border bg-background text-[10px] font-mono">
                <CommandIcon className="h-2.5 w-2.5" />K
              </kbd>
            </button>
            <div className="text-xs text-muted-foreground hidden lg:block truncate">
              {department ? <>القسم: <span className="text-foreground font-medium">{department.name_ar}</span></> : <span className="text-warning">لم يتم تعيين قسم</span>}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <UatResetButton />
            <QuickActionsMenu />
            <div className="h-5 w-px bg-border mx-1" />
            <FavoritesMenu />
            <ActivityCenter />
            <NotificationsCenter />
            <ShortcutsDialog />
            <div className="h-5 w-px bg-border mx-1" />
            <div className="text-sm text-left hidden sm:block">
              <div className="font-medium text-foreground leading-tight text-xs">{profile?.full_name || user.email}</div>
              <div className="text-[10px] text-muted-foreground">{roles.join(" • ") || "موظف"}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} title="تسجيل الخروج" aria-label="تسجيل الخروج" className="h-8 w-8 p-0">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6 animate-fade-in">
          <ErrorBoundary scope="page">
            <Suspense fallback={
              <div className="flex items-center justify-center py-20" aria-busy="true">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              {children ?? <Outlet />}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <OnlineStatusBanner />
    </div>
  );
}
