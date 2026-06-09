/**
 * Communications — مركز التواصل الإلكتروني
 * إدارة القوالب، المزودين، وسجل الرسائل
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { 
  Mail, MessageSquare, MessageCircle, Settings, FileText, Send, 
  Plus, Edit, CheckCircle2, XCircle, AlertCircle, Eye, Search,
} from "lucide-react";

type Template = {
  id: string;
  template_code: string;
  name_ar: string;
  channel: string;
  category: string;
  subject: string | null;
  body_template: string;
  variables: any;
  language: string;
  active: boolean;
};

type Provider = {
  id: string;
  provider_code: string;
  name_ar: string;
  channel: string;
  from_address: string | null;
  from_name: string | null;
  api_key: string | null;
  api_secret: string | null;
  is_default: boolean;
  active: boolean;
  config: any;
};

type MessageLog = {
  id: string;
  channel: string;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  subject: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
};

const CHANNEL_ICON: Record<string, any> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageCircle,
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "بريد إلكتروني",
  sms: "رسالة نصية",
  whatsapp: "واتساب",
};

const CHANNEL_COLOR: Record<string, string> = {
  email: "bg-blue-500/10 text-blue-700 border-blue-300",
  sms: "bg-amber-500/10 text-amber-700 border-amber-300",
  whatsapp: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد الإرسال",
  sent: "مُرسل",
  delivered: "مُستلم",
  failed: "فشل",
  bounced: "مرتجع",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700",
  sent: "bg-blue-500/10 text-blue-700",
  delivered: "bg-emerald-500/10 text-emerald-700",
  failed: "bg-rose-500/10 text-rose-700",
  bounced: "bg-orange-500/10 text-orange-700",
};

export default function Communications() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("templates");
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<Template | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, provRes, logsRes] = await Promise.all([
        supabase.from("message_templates").select("*").order("channel").order("category"),
        supabase.from("communication_providers").select("*").order("channel"),
        supabase.from("message_logs").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      setTemplates((tplRes.data ?? []) as Template[]);
      setProviders((provRes.data ?? []) as Provider[]);
      setLogs((logsRes.data ?? []) as MessageLog[]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => ({
    total_templates: templates.length,
    active_providers: providers.filter(p => p.active).length,
    total_providers: providers.length,
    sent_messages: logs.filter(l => l.status === 'sent' || l.status === 'delivered').length,
    failed_messages: logs.filter(l => l.status === 'failed').length,
  }), [templates, providers, logs]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Send className="h-6 w-6" />
            مركز التواصل الإلكتروني
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة قوالب الرسائل، مزودي الخدمة، وسجل الرسائل المُرسلة
          </p>
        </div>
      </div>

      {/* الإحصائيات */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total_templates}</div>
            <div className="text-sm text-muted-foreground">قوالب الرسائل</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.active_providers}</div>
            <div className="text-sm text-muted-foreground">مزودين مفعّلين</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total_providers}</div>
            <div className="text-sm text-muted-foreground">إجمالي المزودين</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.sent_messages}</div>
            <div className="text-sm text-muted-foreground">رسائل مُرسلة</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-rose-600">{stats.failed_messages}</div>
            <div className="text-sm text-muted-foreground">رسائل فاشلة</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="templates">
            <FileText className="h-4 w-4 ml-2" /> القوالب
          </TabsTrigger>
          <TabsTrigger value="providers">
            <Settings className="h-4 w-4 ml-2" /> المزودين
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Send className="h-4 w-4 ml-2" /> سجل الرسائل
          </TabsTrigger>
        </TabsList>

        {/* ─── تبويب القوالب ─── */}
        <TabsContent value="templates" className="space-y-3">
          {['email', 'sms', 'whatsapp'].map(channel => {
            const Icon = CHANNEL_ICON[channel];
            const channelTemplates = templates.filter(t => t.channel === channel);
            return (
              <Card key={channel}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    {CHANNEL_LABEL[channel]}
                    <Badge variant="outline">{channelTemplates.length} قالب</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الكود</TableHead>
                        <TableHead>الاسم</TableHead>
                        <TableHead>الفئة</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead className="w-32">إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channelTemplates.map(t => (
                        <TableRow key={t.id}>
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.template_code}</code>
                          </TableCell>
                          <TableCell>{t.name_ar}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{t.category}</Badge>
                          </TableCell>
                          <TableCell>
                            {t.active ? (
                              <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-300">
                                <CheckCircle2 className="h-3 w-3 ml-1" /> مفعّل
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                معطّل
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setViewingTemplate(t)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingTemplate(t)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ─── تبويب المزودين ─── */}
        <TabsContent value="providers" className="space-y-3">
          {['email', 'sms', 'whatsapp'].map(channel => {
            const Icon = CHANNEL_ICON[channel];
            const channelProviders = providers.filter(p => p.channel === channel);
            return (
              <Card key={channel}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    مزودي {CHANNEL_LABEL[channel]}
                    <Badge variant="outline">{channelProviders.length} مزود</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>المزود</TableHead>
                        <TableHead>من</TableHead>
                        <TableHead>API Key</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead className="w-32">إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channelProviders.map(p => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{p.name_ar}</div>
                              <code className="text-xs text-muted-foreground">{p.provider_code}</code>
                            </div>
                          </TableCell>
                          <TableCell>
                            {p.from_address ? (
                              <div className="text-sm">
                                <div>{p.from_name}</div>
                                <div className="text-muted-foreground text-xs">{p.from_address}</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.api_key ? (
                              <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-300">
                                <CheckCircle2 className="h-3 w-3 ml-1" /> مُكوّن
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                <XCircle className="h-3 w-3 ml-1" /> غير مُكوّن
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.active ? (
                              <Badge className="bg-emerald-500/10 text-emerald-700">مفعّل</Badge>
                            ) : (
                              <Badge variant="outline">معطّل</Badge>
                            )}
                            {p.is_default && (
                              <Badge variant="outline" className="mr-1 text-xs">افتراضي</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => setEditingProvider(p)}>
                              <Settings className="h-3.5 w-3.5 ml-1" /> إعدادات
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ─── تبويب سجل الرسائل ─── */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">آخر 100 رسالة</CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Send className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>لم يتم إرسال أي رسائل بعد</p>
                  <p className="text-sm mt-1">ستظهر هنا كل الرسائل المُرسلة عبر النظام</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>القناة</TableHead>
                      <TableHead>المستلم</TableHead>
                      <TableHead>الموضوع</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(log => {
                      const Icon = CHANNEL_ICON[log.channel];
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">
                            {new Date(log.created_at).toLocaleString('en-GB')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={CHANNEL_COLOR[log.channel]}>
                              <Icon className="h-3 w-3 ml-1" /> {CHANNEL_LABEL[log.channel]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div>{log.recipient_name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">
                                {log.recipient_email ?? log.recipient_phone}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{log.subject ?? "—"}</TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLOR[log.status]}>
                              {STATUS_LABEL[log.status]}
                            </Badge>
                            {log.error_message && (
                              <div className="text-xs text-rose-600 mt-1">{log.error_message}</div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Template */}
      {viewingTemplate && (
        <Dialog open={!!viewingTemplate} onOpenChange={v => !v && setViewingTemplate(null)}>
          <DialogContent dir="rtl" className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{viewingTemplate.name_ar}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">الكود:</span> <code>{viewingTemplate.template_code}</code></div>
                <div><span className="text-muted-foreground">القناة:</span> {CHANNEL_LABEL[viewingTemplate.channel]}</div>
                <div><span className="text-muted-foreground">الفئة:</span> {viewingTemplate.category}</div>
                <div><span className="text-muted-foreground">اللغة:</span> {viewingTemplate.language === 'ar' ? 'عربي' : 'English'}</div>
              </div>
              {viewingTemplate.subject && (
                <div>
                  <label className="text-sm font-medium">الموضوع:</label>
                  <div className="p-2 bg-muted rounded mt-1 text-sm">{viewingTemplate.subject}</div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium">محتوى الرسالة:</label>
                <div className="p-3 bg-muted rounded mt-1 text-sm whitespace-pre-wrap">{viewingTemplate.body_template}</div>
              </div>
              <div>
                <label className="text-sm font-medium">المتغيرات المتاحة:</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(viewingTemplate.variables as string[] ?? []).map(v => (
                    <code key={v} className="text-xs bg-blue-500/10 text-blue-700 px-2 py-0.5 rounded">
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Provider */}
      {editingProvider && (
        <ProviderDialog
          provider={editingProvider}
          onClose={() => setEditingProvider(null)}
          onSaved={load}
        />
      )}

      {/* Edit Template */}
      {editingTemplate && (
        <TemplateDialog
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function ProviderDialog({
  provider, onClose, onSaved,
}: { provider: Provider; onClose: () => void; onSaved: () => void }) {
  const [apiKey, setApiKey] = useState(provider.api_key ?? "");
  const [apiSecret, setApiSecret] = useState(provider.api_secret ?? "");
  const [fromAddress, setFromAddress] = useState(provider.from_address ?? "");
  const [fromName, setFromName] = useState(provider.from_name ?? "");
  const [active, setActive] = useState(provider.active);
  const [isDefault, setIsDefault] = useState(provider.is_default);

  const handleSave = async () => {
    const { error } = await supabase.from("communication_providers").update({
      api_key: apiKey.trim() || null,
      api_secret: apiSecret.trim() || null,
      from_address: fromAddress.trim() || null,
      from_name: fromName.trim() || null,
      active, is_default: isDefault,
    }).eq("id", provider.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحفظ");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إعدادات {provider.name_ar}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div className="p-3 bg-blue-500/10 border border-blue-300 rounded text-sm">
            <div className="font-medium">معلومات المزود</div>
            <div className="text-xs text-muted-foreground mt-1">
              الكود: <code>{provider.provider_code}</code><br/>
              القناة: {CHANNEL_LABEL[provider.channel]}
            </div>
            {provider.config?.docs && (
              <a href={provider.config.docs} target="_blank" className="text-xs text-blue-600 hover:underline">
                توثيق المزود ↗
              </a>
            )}
          </div>
          
          <div>
            <label className="text-sm font-medium mb-1 block">API Key</label>
            <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk_..." />
          </div>
          
          {provider.channel !== 'email' && (
            <div>
              <label className="text-sm font-medium mb-1 block">API Secret (إن وُجد)</label>
              <Input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} />
            </div>
          )}
          
          {provider.channel === 'email' && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">عنوان المرسل (From)</label>
                <Input value={fromAddress} onChange={e => setFromAddress(e.target.value)} placeholder="noreply@yourdomain.com" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">اسم المرسل</label>
                <Input value={fromName} onChange={e => setFromName(e.target.value)} />
              </div>
            </>
          )}
          
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              مفعّل
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
              افتراضي لقناة {CHANNEL_LABEL[provider.channel]}
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({
  template, onClose, onSaved,
}: { template: Template; onClose: () => void; onSaved: () => void }) {
  const [nameAr, setNameAr] = useState(template.name_ar);
  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState(template.body_template);
  const [active, setActive] = useState(template.active);

  const handleSave = async () => {
    const { error } = await supabase.from("message_templates").update({
      name_ar: nameAr.trim(),
      subject: subject.trim() || null,
      body_template: body,
      active,
      updated_at: new Date().toISOString(),
    }).eq("id", template.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحفظ");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>تعديل القالب: {template.template_code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div>
            <label className="text-sm font-medium mb-1 block">الاسم</label>
            <Input value={nameAr} onChange={e => setNameAr(e.target.value)} />
          </div>
          {template.channel === 'email' && (
            <div>
              <label className="text-sm font-medium mb-1 block">الموضوع</label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1 block">المحتوى</label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className="font-mono text-sm" />
          </div>
          <div className="text-xs text-muted-foreground">
            المتغيرات المتاحة: {(template.variables as string[] ?? []).map(v => `{{${v}}}`).join(', ')}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            مفعّل
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
