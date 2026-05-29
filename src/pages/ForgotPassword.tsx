import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) { toast.error("فشل الإرسال: " + error.message); return; }
    setSent(true);
    toast.success("تم إرسال رابط إعادة التعيين إلى بريدك");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted to-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">استعادة كلمة المرور</h1>
        </div>
        <div className="bg-card border border-border rounded-lg shadow-sm p-6">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-foreground">
                تم إرسال رابط إعادة تعيين كلمة المرور إلى <span className="font-mono">{email}</span>.
              </p>
              <p className="text-xs text-muted-foreground">
                افتح الرابط في الرسالة لتعيين كلمة مرور جديدة.
              </p>
              <Link to="/auth" className="text-primary text-sm underline">العودة لتسجيل الدخول</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "جاري الإرسال..." : "إرسال رابط الاستعادة"}
              </Button>
              <div className="text-center">
                <Link to="/auth" className="text-xs text-muted-foreground hover:text-foreground">العودة لتسجيل الدخول</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
