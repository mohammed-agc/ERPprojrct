import { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function AppLayout({ children }: { children?: ReactNode }) {
  const { user, loading, profile, department, signOut, roles } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 bg-card border-b border-border flex items-center justify-between px-4 sticky top-0 z-10">
          <div className="text-sm text-muted-foreground">
            {department ? <span>القسم: <span className="text-foreground font-medium">{department.name_ar}</span></span> : <span className="text-warning">لم يتم تعيين قسم</span>}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-left">
              <div className="font-medium text-foreground leading-tight">{profile?.full_name || user.email}</div>
              <div className="text-[10px] text-muted-foreground">{roles.join(" • ") || "موظف"}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} title="تسجيل الخروج">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6 animate-fade-in">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
