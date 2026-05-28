import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileText, Calendar, Truck, Receipt, User } from "lucide-react";
import { salesService, fmtDateTime } from "@/services/erp/sales";

const ICON: Record<string, any> = {
  quotation: FileText, reservation: Calendar, delivery: Truck, invoice: Receipt,
};

export default function CustomerTimeline() {
  const customers = useMemo(() => salesService.listCustomers(), []);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [q, setQ] = useState("");

  const events = useMemo(() => customerId ? salesService.customerTimeline(customerId) : [], [customerId]);
  const filteredCustomers = useMemo(() => {
    const qv = q.trim().toLowerCase();
    if (!qv) return customers;
    return customers.filter(c => c.name.toLowerCase().includes(qv));
  }, [customers, q]);

  const current = customers.find(c => c.id === customerId);

  return (
    <div>
      <PageHeader
        title="الخط الزمني للعميل"
        subtitle="عرض موحّد لكل عمليات العميل: عروض، حجوزات، تسليم، فواتير"
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Customers panel */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-9 h-9" placeholder="بحث عن عميل..." value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {filteredCustomers.map(c => (
              <button
                key={c.id}
                onClick={() => setCustomerId(c.id)}
                className={`w-full text-right px-3 py-2 border-b border-border text-sm hover:bg-accent transition-colors flex items-center gap-2 ${customerId === c.id ? "bg-accent" : ""}`}
              >
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="text-sm font-semibold">{current?.name ?? "اختر عميلاً"}</div>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="العميل" /></SelectTrigger>
              <SelectContent>
                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="p-4">
            {events.length === 0 && <div className="text-center text-muted-foreground py-12 text-sm">لا توجد عمليات لهذا العميل</div>}
            <div className="relative">
              <div className="absolute right-3 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-3">
                {events.map((e, i) => {
                  const Icon = ICON[e.kind] ?? FileText;
                  return (
                    <div key={i} className="relative pr-9">
                      <div className="absolute right-0 top-1 h-6 w-6 rounded-full bg-card border-2 border-primary flex items-center justify-center">
                        <Icon className="h-3 w-3 text-primary" />
                      </div>
                      <div className="border border-border rounded-lg p-2.5 hover:bg-accent/30 transition-colors">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold">{e.label}</span>
                          <Badge className={e.tone}>{e.ref}</Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">{fmtDateTime(e.ts)}</span>
                        </div>
                        {e.meta && <div className="text-xs text-muted-foreground">{e.meta}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
