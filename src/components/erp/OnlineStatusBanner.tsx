import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sticky offline banner — appears when network is lost,
 * stays for 2.5s with a confirmation chip when restored.
 */
export function OnlineStatusBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const onUp = () => { setOnline(true); setShowRestored(true); setTimeout(() => setShowRestored(false), 2500); };
    const onDown = () => { setOnline(false); setShowRestored(false); };
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  if (online && !showRestored) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className={cn(
        "fixed top-2 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shadow-md border animate-fade-in",
        online
          ? "bg-success/10 text-success border-success/30"
          : "bg-destructive/10 text-destructive border-destructive/30"
      )}
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {online ? "تم استعادة الاتصال" : "لا يوجد اتصال — يعمل النظام بوضع محدود"}
    </div>
  );
}
