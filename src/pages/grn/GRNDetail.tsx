import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, FileSearch } from "lucide-react";
import { toast } from "sonner";
import {
  getGRN, inspectionForGRN, createInspectionFromGRN,
  GRN_LABEL, GRN_TONE, fmtDate,
} from "@/services/erp/receivingDb";
import { supabase } from "@/integrations/supabase/client";

export default function GRNDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const grnQ = useQuery({ queryKey: ["grn", id], queryFn: () => getGRN(id), enabled: !!id });
  const inspQ = useQuery({ queryKey: ["insp-for-grn", id], queryFn: () => inspectionForGRN(id), enabled: !!id });

  const createInsp = useMutation({
    mutationFn: () => createInspectionFromGRN(id),
    onSuccess: (ins) => {
      toast.success(`تم إنشاء سجل الفحص ${ins.insp_no}`);
      qc.invalidateQueries({ queryKey: ["insp-for-grn", id] });
      qc.invalidateQueries({ queryKey: ["inspections"] });
      nav(`/purchasing/inspection/${ins.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = grnQ.data;
  const insp = inspQ.data;
  const metaQ = useQuery({
    queryKey: ["grn-meta", id],
    queryFn: async () => {
      if (!data?.header) return null;
      const g = data.header;
      const [shp, alc, sup, po] = await Promise.all([
        g.shipment_id ? supabase.from("shipments").select("shipment_no").eq("id", g.shipment_id).maybeSingle() : Promise.resolve(null),
        g.allocation_id ? supabase.from("allocations").select("alloc_no").eq("id", g.allocation_id).maybeSingle() : Promise.resolve(null),
        g.supplier_id ? supabase.from("suppliers").select("name").eq("id", g.supplier_id).maybeSingle() : Promise.resolve(null),
        g.po_id ? supabase.from("purchase_orders").select("po_no").eq("id", g.po_id).maybeSingle() : Promise.resolve(null),
      ]);
      return {
        shipment_no:   shp?.data?.shipment_no,
        alloc_no:      alc?.data?.alloc_no,
        supplier_name: sup?.data?.name,
        po_no:         po?.data?.po_no,
      };
    },
    enabled: !!data,
  });
  const meta = metaQ.data;
  const totals = useMemo(() => {
    const lines = data?.lines ?? [];
    return {
      lines: lines.length,
      ok: lines.filter(l => l.condition === "ok").length,
      damaged: lines.filter(l => l.condition !== "ok").length,
      total: lines.reduce((s, l) => s + Number(l.unit_cost || 0), 0),
    };
  }, [data]);

  if (grnQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">جارٍ التحميل...</div>;
  if (!data) return (
    <div className="py-10 text-center text-muted-foreground text-sm">
      مذكرة الاستلام غير موجودة — <Link to="/grn/list" className="text-primary">رجوع</Link>
    </div>
  );

  const { header: g, lines } = data;

  return (
    <div>
      <PageHeader
        title={`${g.grn_no} — مذكرة استلام`}
        subtitle={
          <div className="flex items-center gap-2 text-xs">
            <Badge className={GRN_TONE[g.status]}>{GRN_LABEL[g.status]}</Badge>
            <span className="text-muted-foreground">الشحنة:</span>
            <span className="font-mono">{(g as any).shipment?.shipment_no ?? meta?.shipment_no ?? meta?.shipment_no ?? g.shipment_id?.slice(0,8)}</span>
            <span className="text-muted-foreground">· التخصيص:</span>
            <span className="font-mono">{(g as any).allocation?.alloc_no ?? meta?.alloc_no ?? meta?.alloc_no ?? g.allocation_id?.slice(0,8)}</span>
          </div>
        }
        actions={
          insp ? (
            <Link to={`/purchasing/inspection/${insp.id}`}>
              <Button size="sm" variant="outline">
                <ArrowRight className="h-4 w-4 ml-1" /> فتح الفحص {insp.insp_no}
              </Button>
            </Link>
          ) : (g.status === "received" ? (
            <Button size="sm" onClick={() => createInsp.mutate()} disabled={createInsp.isPending}>
              <FileSearch className="h-4 w-4 ml-1" /> إرسال للفحص
            </Button>
          ) : null)
        }
      />

      <div className="grid grid-cols-4 gap-2 mb-4">
        <Info label="عدد البنود" value={String(totals.lines)} />
        <Info label="سليم" value={String(totals.ok)} />
        <Info label="فروقات" value={String(totals.damaged)} />
        <Info label="إجمالي التكلفة" value={totals.total.toLocaleString("en-US", { minimumFractionDigits: 2 })} />
      </div>

      <Card className="mb-3">
        <CardContent className="p-3 grid grid-cols-4 gap-3 text-xs">
          <div><div className="text-[10px] text-muted-foreground">المستودع</div><div>{g.warehouse ?? "—"}</div></div>
          <div><div className="text-[10px] text-muted-foreground">تاريخ الاستلام</div><div>{fmtDate(g.received_at)}</div></div>
          <div><div className="text-[10px] text-muted-foreground">المورد</div><div className="font-mono text-[11px]">{(g as any).supplier?.name ?? meta?.supplier_name ?? meta?.supplier_name ?? g.supplier_id?.slice(0,8)}</div></div>
          <div><div className="text-[10px] text-muted-foreground">أمر الشراء</div><div className="font-mono text-[11px]">{(g as any).po?.po_no ?? meta?.po_no ?? meta?.po_no ?? g.po_id?.slice(0,8)}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b border-border font-semibold text-sm">بنود الاستلام</div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>#</th><th>VIN</th><th>الموديل</th><th>السنة</th><th>اللون</th>
                <th>المحرك</th><th>التكلفة</th><th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted-foreground py-6 text-xs">لا توجد بنود</td></tr>
              )}
              {lines.map(l => (
                <tr key={l.id}>
                  <td className="num text-xs">{l.line_no}</td>
                  <td className="font-mono text-[11px]" dir="ltr">{l.vin}</td>
                  <td className="text-xs">{l.brand} {l.model}</td>
                  <td className="num text-xs">{l.year ?? "—"}</td>
                  <td className="text-xs">{l.color ?? "—"}</td>
                  <td className="font-mono text-[10px]" dir="ltr">{l.engine_no ?? "—"}</td>
                  <td className="num text-xs">{Number(l.unit_cost).toLocaleString("en-US")}</td>
                  <td className="text-xs">
                    {l.condition === "ok"
                      ? <Badge variant="outline">سليم</Badge>
                      : <Badge className="bg-destructive/10 text-destructive border border-destructive/40">{l.condition}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {g.notes && (
        <div className="mt-3 bg-card border border-border rounded-lg p-3 text-xs">
          <div className="text-[10px] text-muted-foreground mb-1">ملاحظات</div>
          <div className="bg-muted/30 rounded p-2">{g.notes}</div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-2.5">
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm font-semibold num">{value}</div>
    </div>
  );
}
