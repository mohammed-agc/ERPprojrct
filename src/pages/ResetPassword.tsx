import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase auto-handles the recovery token from the URL hash and emits PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also allow flow if user already has a session from the recovery link.
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (password !== confirm) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error("فشل التحديث: " + error.message); return; }
    toast.success("تم تحديث كلمة المرور");
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted to-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">تعيين كلمة مرور جديدة</h1>
        </div>
        <div className="bg-card border border-border rounded-lg shadow-sm p-6">
          {!ready ? (
            <p className="text-sm text-muted-foreground text-center">
              يتم التحقق من رابط الاستعادة... إذا لم تصل من رابط البريد، أعد طلب الاستعادة.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="p1">كلمة المرور الجديدة</Label>
                <Input id="p1" type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p2">تأكيد كلمة المرور</Label>
                <Input id="p2" type="password" minLength={6} value={confirm} onChange={e => setConfirm(e.target.value)} required dir="ltr" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "جاري الحفظ..." : "حفظ كلمة المرور"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
