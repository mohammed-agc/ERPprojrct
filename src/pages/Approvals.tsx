import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/erp/EmptyState";
import {
  governanceService, type ApprovalRequest, type ApprovalStatus, type ApprovalEntityType,
  approvalStatusLabel, approvalStatusTone, entityTypeLabel,
} from "@/services/erp/governance";
import { fmtSAR } from "@/lib/erpFormat";
import { Check, X, Send, Search, RotateCw, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  /** Restrict to journals or treasury (vouchers/transfers/adjustments/reversals). */
  scope: "journal" | "treasury";
}

export default function ApprovalsPage({ scope }: Props) {
  const title = scope === "journal" ? "اعتمادات قيود اليومية" : "اعتمادات الخزينة";
  const subtitle = scope === "journal"
    ? "مراجعة واعتماد قيود اليومية قبل الترحيل"
    : "اعتماد سندات الصرف والتحويلات والتسويات والعكس";

  const allowedTypes: ApprovalEntityType[] = scope === "journal"
    ? ["journal"]
    : ["voucher", "transfer", "adjustment", "reversal"];

  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [status, setStatus] = useState<ApprovalStatus | "all">("pending_approval");
  const [type, setType] = useState<ApprovalEntityType | "all">("all");
  const [q, setQ] = useState("");
  const [historyOf, setHistoryOf] = useState<ApprovalRequest | null>(null);
  const [rejectOf, setRejectOf] = useState<ApprovalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    const all = await governanceService.listApprovals({ status, type });
    setRows(all.filter(a => allowedTypes.includes(a.entity_type)));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, type, scope]);

  const filtered = useMemo(() => {
    const t = q.trim();
    return rows.filter(r => !t || r.entity_ref.includes(t) || r.entity_label.includes(t) || r.requester.includes(t));
  }, [rows, q]);

  const counts = useMemo(() => ({
    pending: rows.filter(r => r.status === "pending_approval").length,
    approved: rows.filter(r => r.status === "approved").length,
    rejected: rows.filter(r => r.status === "rejected").length,
    posted: rows.filter(r => r.status === "posted").length,
  }), [rows]);

  const approve = async (id: string) => { await governanceService.approve(id); toast.success("تم الاعتماد"); load(); };
  const post = async (id: string) => { await governanceService.post(id); toast.success("تم الترحيل"); load(); };
  const submitReject = async () => {
    if (!rejectOf) return;
    if (!rejectReason.trim()) return toast.error("اكتب سبب الرفض");
    await governanceService.reject(rejectOf.id, rejectReason.trim());
    toast.success("تم الرفض");
    setRejectOf(null); setRejectReason(""); load();
  };

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} sticky
        actions={<Button size="sm" variant="ghost" onClick={load}><RotateCw className="h-3.5 w-3.5" /></Button>}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <KPI label="بانتظار الاعتماد" value={counts.pending} tone="text-amber-600" />
        <KPI label="معتمد" value={counts.approved} tone="text-blue-600" />
        <KPI label="مرفوض" value={counts.rejected} tone="text-rose-600" />
        <KPI label="مُرحَّل" value={counts.posted} tone="text-emerald-600" />
      </div>

      {/* Filters */}
      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">الحالة</Label>
          <Select value={status} onValueChange={v => setStatus(v as ApprovalStatus | "all")}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="pending_approval">بانتظار الاعتماد</SelectItem>
              <SelectItem value="approved">معتمد</SelectItem>
              <SelectItem value="rejected">مرفوض</SelectItem>
              <SelectItem value="posted">مُرحَّل</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {scope === "treasury" && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs">النوع</Label>
            <Select value={type} onValueChange={v => setType(v as ApprovalEntityType | "all")}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="voucher">سند</SelectItem>
                <SelectItem value="transfer">تحويل</SelectItem>
                <SelectItem value="adjustment">تسوية</SelectItem>
                <SelectItem value="reversal">عكس / إلغاء</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <Label className="text-xs">بحث</Label>
          <div className="relative">
            <Search className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="h-8 pr-8" placeholder="الرقم / الوصف / مقدم الطلب"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>المرجع</th><th>النوع</th><th>الوصف</th><th>التاريخ</th>
              <th className="text-left">المبلغ</th><th>مقدم الطلب</th><th>المراجع</th>
              <th>الحالة</th><th className="text-left">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <EmptyState inTable colSpan={9} title="لا توجد طلبات اعتماد" />}
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="font-mono text-xs">{r.entity_ref}</td>
                <td className="text-xs">{entityTypeLabel[r.entity_type]}</td>
                <td className="font-medium">{r.entity_label}</td>
                <td className="num text-xs">{r.date}</td>
                <td className="num text-left font-semibold">{fmtSAR(r.amount)}</td>
                <td className="text-xs">{r.requester}</td>
                <td className="text-xs">{r.reviewer ?? "—"}</td>
                <td>
                  <Badge variant="outline" className={cn("text-[10px]", approvalStatusTone[r.status])}>
                    {approvalStatusLabel[r.status]}
                  </Badge>
                  {r.status === "rejected" && r.rejection_reason && (
                    <div className="text-[10px] text-rose-600 mt-0.5">{r.rejection_reason}</div>
                  )}
                </td>
                <td className="text-left">
                  <div className="flex justify-end gap-1">
                    {r.status === "pending_approval" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700 border-emerald-300"
                          onClick={() => approve(r.id)}>
                          <Check className="h-3 w-3 ml-1" /> اعتماد
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-rose-700 border-rose-300"
                          onClick={() => setRejectOf(r)}>
                          <X className="h-3 w-3 ml-1" /> رفض
                        </Button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => post(r.id)}>
                        <Send className="h-3 w-3 ml-1" /> ترحيل
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setHistoryOf(r)}>
                      <History className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reject dialog */}
      <Dialog open={!!rejectOf} onOpenChange={o => !o && (setRejectOf(null), setRejectReason(""))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض طلب الاعتماد</DialogTitle>
            <DialogDescription>{rejectOf?.entity_ref} — {rejectOf?.entity_label}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">سبب الرفض</Label>
            <Textarea rows={4} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="اذكر السبب بوضوح للأرشيف..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOf(null)}>إلغاء</Button>
            <Button onClick={submitReject} variant="destructive">رفض</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyOf} onOpenChange={o => !o && setHistoryOf(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>سجل الاعتماد</DialogTitle>
            <DialogDescription>{historyOf?.entity_ref} — {historyOf?.entity_label}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 max-h-80 overflow-auto">
            {historyOf?.history.map((h, i) => (
              <li key={i} className="border rounded p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{h.action}</span>
                  <span className="text-[10px] text-muted-foreground">{h.at.slice(0, 16).replace("T", " ")}</span>
                </div>
                <div className="text-xs text-muted-foreground">{h.actor}</div>
                {h.note && <div className="text-xs mt-1">{h.note}</div>}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("font-bold text-2xl", tone)}>{value}</div>
    </div>
  );
}
