import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle, ArrowRight, CheckCircle2, FileSearch, PackageCheck, Plus, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  purchasingService, RECV_LABEL, RECV_TONE, INSP_LABEL, INSP_TONE,
  DISCREPANCY_LABEL, DISCREPANCY_TONE, fmtDate,
  type DiscrepancyKind,
} from "@/services/erp/purchasing";
import { inventoryService } from "@/services/erp/inventory";
import { GRNReceiptDialog } from "@/components/erp/GRNReceiptDialog";
import { DocGovernancePanel } from "@/components/erp/DocGovernancePanel";
import { makeAudit, type AuditEntry, type ErpGovRole } from "@/services/erp/erpRoles";
import { getPoVehicleUnits, groupUnitsByPoLine, type PoVehicleUnit } from "@/lib/poVehicleUnits";

export default function GRNDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [tick, setTick] = useState(0);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const grn = useMemo(() => purchasingService.getGRN(id), [id, tick]);
  const po = useMemo(() => grn ? purchasingService.getPO(grn.po_id) : undefined, [grn, tick]);
  const supplier = po ? purchasingService.getSupplier(po.supplier_id) : undefined;
  const progress = grn ? purchasingService.poReceivingProgress(grn.po_id) : null;
  const warehouses = inventoryService.listWarehouses();
  const invoice = grn?.invoice_id ? purchasingService.getPurchaseInvoice(grn.invoice_id) : undefined;
  const vehicleUnits = useMemo(() => po ? getPoVehicleUnits(po.id) : [], [po, tick]);
  const unitsByLine = useMemo(() => groupUnitsByPoLine(vehicleUnits), [vehicleUnits]);

  // discrepancy form
  const [discKind, setDiscKind] = useState<DiscrepancyKind>("missing");
  const [discLine, setDiscLine] = useState<string>("");
  const [discQty, setDiscQty] = useState<number>(0);
  const [discNotes, setDiscNotes] = useState<string>("");

  // warehouse assignment
  const [whId, setWhId] = useState<string>(grn?.warehouse_id || "");
  const [yard, setYard] = useState<string>(grn?.yard || "");

  if (!grn) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">
        إشعار الاستلام غير موجود — <Link to="/grn/list" className="text-primary">رجوع للقائمة</Link>
      </div>
    );
  }

  const refresh = () => setTick(t => t + 1);
  const discrepancies = grn.discrepancies ?? [];
  const lineCondIssues = grn.items.filter(i => i.condition !== "ok").length;

  function addDisc() {
    if (discQty <= 0 && discKind !== "supplier_issue" && discKind !== "wrong_item") {
      toast.error("أدخل الكمية"); return;
    }
    purchasingService.addDiscrepancy(grn!.id, {
      kind: discKind, line_id: discLine || undefined,
      qty: discQty || undefined, notes: discNotes || undefined,
    });
    setDiscQty(0); setDiscNotes("");
    toast.success("تم تسجيل الفرق");
    refresh();
  }

  function assign() {
    const wh = warehouses.find(w => w.id === whId);
    if (!wh) { toast.error("اختر المستودع"); return; }
    purchasingService.assignWarehouse(grn!.id, { warehouse: wh.name, warehouse_id: wh.id, yard });
    toast.success("تم تحديث الموقع");
    refresh();
  }

  function complete() {
    if (grn!.items.length === 0) { toast.error("لا توجد كميات مستلمة"); return; }
    purchasingService.completeGRN(grn!.id);
    toast.success("تم إقفال الاستلام");
    refresh();
  }

  function handoff() {
    purchasingService.handoffToInspection(grn!.id);
    toast.success("تم تحويل الإشعار للفحص");
    refresh();
  }

  function cancel() {
    purchasingService.cancelGRN(grn!.id);
    toast.warning("تم إلغاء الإشعار");
    refresh();
  }

  return (
    <div>
      <PageHeader
        title={`${grn.code} — إشعار استلام`}
        subtitle={
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Badge className={RECV_TONE[grn.status]}>{RECV_LABEL[grn.status]}</Badge>
            <Badge className={INSP_TONE[grn.inspection_status]}>الفحص: {INSP_LABEL[grn.inspection_status]}</Badge>
            <span className="text-muted-foreground">PO:</span>
            <Link to="/purchasing/orders" className="font-mono text-primary hover:underline">{po?.code}</Link>
            {invoice && (<>
              <span className="text-muted-foreground">· فاتورة:</span>
              <Link to="/purchasing/invoices" className="font-mono text-primary hover:underline">{invoice.code}</Link>
            </>)}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            {(grn.status === "draft" || grn.status === "partial" || grn.status === "receiving" || grn.status === "pending") && (
              <>
                <Button size="sm" onClick={() => setReceiveOpen(true)}>
                  <PackageCheck className="h-4 w-4 ml-1" /> تسجيل استلام
                </Button>
                <Button size="sm" variant="outline" onClick={complete}>
                  <CheckCircle2 className="h-4 w-4 ml-1" /> إقفال الاستلام
                </Button>
                <Button size="sm" variant="ghost" onClick={cancel}>
                  <X className="h-4 w-4 ml-1" /> إلغاء
                </Button>
              </>
            )}
            {(grn.status === "received" || grn.status === "with_discrepancy") && (
              <Button size="sm" onClick={handoff}>
                <FileSearch className="h-4 w-4 ml-1" /> إرسال للفحص
              </Button>
            )}
            {grn.status === "awaiting_inspection" && (
              <Link to="/purchasing/inspection">
                <Button size="sm" variant="outline">
                  <ArrowRight className="h-4 w-4 ml-1" /> فتح الفحص
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {receiveOpen && (
        <GRNReceiptDialog
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          grn={grn}
          onRecorded={refresh}
        />
      )}

      {/* Header info */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <Info label="المورد" value={supplier?.name ?? "—"} />
        <Info label="الفرع" value={grn.branch ?? po?.branch_destination ?? "—"} />
        <Info label="المستلم" value={grn.receiver} />
        <Info label="تاريخ الاستلام" value={fmtDate(grn.received_at)} />
        <Info label="المستودع" value={grn.warehouse || "—"} />
        <Info label="الساحة / Bin" value={grn.yard || "—"} />
        <Info label="مرجع الشحنة" value={grn.shipment_ref || "—"} />
        <Info label="آخر تحديث" value={fmtDate(grn.completed_at || grn.handoff_at || grn.created_at)} />
      </div>

      {/* PO progress */}
      {progress && (
        <Card className="mb-4">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">تقدم استلام أمر الشراء</div>
              <div className="text-xs text-muted-foreground num">
                {progress.receivedQty} / {progress.orderedQty} وحدة · المتبقي {progress.remainingQty}
              </div>
            </div>
            <div className="h-2 bg-muted rounded overflow-hidden mb-3">
              <div className="h-full bg-primary" style={{ width: `${progress.pct}%` }} />
            </div>
            <table className="erp-table">
              <thead>
                <tr><th>الصنف</th><th>النوع</th><th>المطلوب</th><th>المستلم</th><th>المتبقي</th></tr>
              </thead>
              <tbody>
                {progress.lines.map(l => (
                  <tr key={l.line_id}>
                    <td className="text-xs">{l.description}</td>
                    <td className="text-xs">{l.kind === "vehicle" ? "مركبة" : "قطعة"}</td>
                    <td className="num text-xs">{l.ordered}</td>
                    <td className="num text-xs font-semibold">{l.received}</td>
                    <td className="num text-xs">{l.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* Received items */}
        <Card className="col-span-2">
          <CardContent className="p-3">
            <div className="text-sm font-semibold mb-2">العناصر المستلمة في هذا الإشعار</div>
            <table className="erp-table">
              <thead>
                <tr><th>الصنف</th><th>الكمية</th><th>الحالة</th><th>Bin</th><th>التحقق</th></tr>
              </thead>
              <tbody>
                {grn.items.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-6 text-xs">لم تُسجَّل كميات بعد</td></tr>
                )}
                {grn.items.map((it, i) => {
                  const line = po?.items.find(l => l.id === it.line_id);
                  return (
                    <tr key={i}>
                      <td className="text-xs">{line?.description ?? it.line_id}</td>
                      <td className="num text-xs">{it.qty}</td>
                      <td className="text-xs">
                        {it.condition === "ok" ? <Badge variant="outline">سليم</Badge>
                          : <Badge className="bg-destructive/10 text-destructive border border-destructive/40">
                              {it.condition === "damaged" ? "تالف"
                                : it.condition === "missing" ? "ناقص"
                                : it.condition === "wrong_item" ? "صنف خاطئ" : "زائد"}
                            </Badge>}
                      </td>
                      <td className="text-xs font-mono">{it.bin || "—"}</td>
                      <td className="text-[10px] text-muted-foreground">
                        {it.vin_pending && <span className="mr-1">VIN معلق</span>}
                        {it.chassis_verified && <span className="mr-1 text-success">شاسيه ✓</span>}
                        {it.sku_verified && <span className="mr-1 text-success">SKU ✓</span>}
                        {it.barcode_verified && <span className="mr-1 text-success">باركود ✓</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Warehouse assignment */}
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="text-sm font-semibold">تخصيص الموقع</div>
            <div>
              <Label className="text-xs">المستودع</Label>
              <Select value={whId} onValueChange={setWhId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الساحة / Bin</Label>
              <Input className="h-9" value={yard} onChange={e => setYard(e.target.value)} placeholder="YARD-A-014" />
            </div>
            <Button size="sm" className="w-full" onClick={assign}>تحديث الموقع</Button>
            <div className="text-[11px] text-warning bg-warning/5 border border-warning/30 rounded p-2 mt-2">
              ⓘ الاستلام لا يُنشئ مخزوناً بعد. المخزون الفعلي يُنشأ بعد اعتماد الفحص.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Discrepancies */}
      <Card className="mb-4">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-warning" /> الفروقات والملاحظات
            </div>
            <div className="text-[11px] text-muted-foreground">
              {discrepancies.length} مسجل · {lineCondIssues} على مستوى البند
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 mb-3">
            <Select value={discKind} onValueChange={(v) => setDiscKind(v as DiscrepancyKind)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DISCREPANCY_LABEL) as DiscrepancyKind[]).map(k =>
                  <SelectItem key={k} value={k}>{DISCREPANCY_LABEL[k]}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Select value={discLine} onValueChange={setDiscLine}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="البند (اختياري)" /></SelectTrigger>
              <SelectContent>
                {po?.items.map(l => <SelectItem key={l.id} value={l.id}>{l.description.slice(0, 32)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" className="h-9 num" placeholder="الكمية" value={discQty || ""}
              onChange={e => setDiscQty(parseInt(e.target.value || "0", 10) || 0)} />
            <Textarea rows={1} className="text-xs col-span-1" placeholder="ملاحظات"
              value={discNotes} onChange={e => setDiscNotes(e.target.value)} />
            <Button size="sm" onClick={addDisc}><Plus className="h-4 w-4 ml-1" /> إضافة فرق</Button>
          </div>

          {discrepancies.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-4">لا توجد فروقات مسجلة</div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr><th>النوع</th><th>البند</th><th>الكمية</th><th>الملاحظات</th><th>التاريخ</th></tr>
              </thead>
              <tbody>
                {discrepancies.map(d => {
                  const line = po?.items.find(l => l.id === d.line_id);
                  return (
                    <tr key={d.id}>
                      <td><Badge className={DISCREPANCY_TONE[d.kind]}>{DISCREPANCY_LABEL[d.kind]}</Badge></td>
                      <td className="text-xs">{line?.description ?? "—"}</td>
                      <td className="num text-xs">{d.qty ?? "—"}</td>
                      <td className="text-xs">{d.notes ?? "—"}</td>
                      <td className="text-xs">{fmtDate(d.reported_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Timeline + Governance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-3">
            <div className="text-sm font-semibold mb-2">المخطط الزمني</div>
            <ul className="text-xs space-y-1.5">
              <Tl when={grn.created_at} label="تم إنشاء الإشعار" by={grn.receiver} />
              {grn.items.length > 0 && <Tl when={grn.received_at} label={`سجلت ${grn.items.length} عناصر استلام`} by={grn.receiver} />}
              {grn.completed_at && <Tl when={grn.completed_at} label="إقفال الاستلام" />}
              {grn.handoff_at && <Tl when={grn.handoff_at} label="إرسال للفحص" />}
            </ul>
          </CardContent>
        </Card>

        {(() => {
          const audit: AuditEntry[] = [
            makeAudit({ role: "receiving", action: "إنشاء إشعار الاستلام", to_status: "draft", actor: grn.receiver }),
            ...(grn.items.length > 0 ? [makeAudit({ role: "receiving", action: `تسجيل ${grn.items.length} عنصر استلام`, actor: grn.receiver })] : []),
            ...(grn.completed_at ? [makeAudit({ role: "receiving", action: "إقفال الاستلام", to_status: grn.status, actor: grn.receiver })] : []),
            ...(grn.handoff_at ? [makeAudit({ role: "receiving", action: "إرسال للفحص", to_status: "awaiting_inspection", actor: grn.receiver })] : []),
            ...((discrepancies.length > 0) ? [makeAudit({ role: "receiving", action: `تسجيل ${discrepancies.length} فرق` })] : []),
          ];
          const responsibleRole: ErpGovRole =
            grn.status === "awaiting_inspection" ? "inspection" :
            grn.status === "received" || grn.status === "with_discrepancy" ? "receiving" :
            "receiving";
          const nextActions: any[] = [];
          if (grn.status === "draft" || grn.status === "partial" || grn.status === "receiving" || grn.status === "pending") {
            nextActions.push({ label: "تسجيل استلام", role: "receiving", onClick: () => setReceiveOpen(true) });
            nextActions.push({ label: "إقفال", role: "receiving", onClick: complete, variant: "outline" });
          }
          if (grn.status === "received" || grn.status === "with_discrepancy") {
            nextActions.push({ label: "إرسال للفحص", role: "receiving", onClick: handoff });
          }
          if (grn.status === "awaiting_inspection") {
            nextActions.push({ label: "فتح الفحص", role: "inspection", onClick: () => nav("/purchasing/inspection") });
          }
          return (
            <DocGovernancePanel
              status={RECV_LABEL[grn.status]}
              statusTone={RECV_TONE[grn.status]}
              responsibleRole={responsibleRole}
              previous={po ? { kind: "po", id: po.id, code: po.code } : undefined}
              audit={audit}
              nextActions={nextActions}
            />
          );
        })()}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card rounded p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium truncate">{value}</div>
    </div>
  );
}

function Tl({ when, label, by }: { when?: string; label: string; by?: string }) {
  if (!when) return null;
  return (
    <li className="flex items-center gap-2">
      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
      <span className="text-muted-foreground w-32">{fmtDate(when)}</span>
      <span>{label}</span>
      {by && <span className="text-muted-foreground">— {by}</span>}
    </li>
  );
}
