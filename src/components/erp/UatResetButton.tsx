import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { UatResetDialog } from "./UatResetDialog";

export function UatResetButton() {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  if (!isAdmin) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-[12px] border-amber-500/60 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
        onClick={() => setOpen(true)}
        title="تهيئة بيئة الاختبار — Administrator فقط"
      >
        <FlaskConical className="h-3.5 w-3.5" />
        تهيئة بيئة الاختبار
      </Button>
      <UatResetDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
