import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { toast.error("فشل تسجيل الدخول: " + error.message); return; }
    toast.success("مرحباً بك");
    navigate("/", { replace: true });
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) { toast.error("فشل إنشاء الحساب: " + error.message); return; }
    toast.success("تم إنشاء الحساب. يمكنك الدخول الآن.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted to-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">نظام ERP المتكامل</h1>
          <p className="text-sm text-muted-foreground">إدارة المركبات • قطع الغيار • الورشة • المحاسبة</p>
        </div>

        <div className="bg-card border border-border rounded-lg shadow-sm p-6">
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">تسجيل الدخول</TabsTrigger>
              <TabsTrigger value="signup">إنشاء حساب</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={onLogin} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <Input id="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required dir="ltr" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "جاري الدخول..." : "دخول"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={onSignup} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">الاسم الكامل</Label>
                  <Input id="name" value={fullName} onChange={e=>setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">البريد الإلكتروني</Label>
                  <Input id="email2" type="email" value={email} onChange={e=>setEmail(e.target.value)} required dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">كلمة المرور</Label>
                  <Input id="password2" type="password" minLength={6} value={password} onChange={e=>setPassword(e.target.value)} required dir="ltr" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "جاري الإنشاء..." : "إنشاء حساب"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  أول مستخدم يُسجَّل سيحصل تلقائياً على صلاحية المسؤول العام (Admin).
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
