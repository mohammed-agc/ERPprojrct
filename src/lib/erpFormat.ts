export const fmtSAR = (n: number) =>
  Number(n || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "م";
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + "ك";
  return fmtSAR(n);
};
export const accountTypeLabel: Record<string, string> = {
  asset: "أصل", liability: "التزام", equity: "حقوق ملكية", revenue: "إيراد", expense: "مصروف",
};
export const accountTypeColor: Record<string, string> = {
  asset: "bg-blue-500/10 text-blue-700 border-blue-300",
  liability: "bg-amber-500/10 text-amber-700 border-amber-300",
  equity: "bg-purple-500/10 text-purple-700 border-purple-300",
  revenue: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  expense: "bg-rose-500/10 text-rose-700 border-rose-300",
};
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const startOfYearIso = () => `${new Date().getFullYear()}-01-01`;
export const startOfMonthIso = () => {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
