/**
 * EmployeeDialog — إضافة/تعديل موظف
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, User, Briefcase, FileText, DollarSign } from "lucide-react";

type Props = {
  employee: any | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function EmployeeDialog({ employee, open, onClose, onSaved }: Props) {
  const isEdit = !!employee;
  const [saving, setSaving] = useState(false);
  const [positions, setPositions] = useState<any[]>([]);
  const [contractTypes, setContractTypes] = useState<any[]>([]);
  
  // البيانات الشخصية
  const [firstNameAr, setFirstNameAr] = useState("");
  const [middleNameAr, setMiddleNameAr] = useState("");
  const [lastNameAr, setLastNameAr] = useState("");
  const [firstNameEn, setFirstNameEn] = useState("");
  const [lastNameEn, setLastNameEn] = useState("");
  const [gender, setGender] = useState("male");
  const [dob, setDob] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("single");
  const [nationality, setNationality] = useState("سعودي");
  const [religion, setReligion] = useState("");
  
  // الهوية
  const [nationalId, setNationalId] = useState("");
  const [iqamaNo, setIqamaNo] = useState("");
  const [iqamaExpiry, setIqamaExpiry] = useState("");
  const [passportNo, setPassportNo] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("");
  
  // الاتصال
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  
  // الوظيفة
  const [positionId, setPositionId] = useState("");
  const [hireDate, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [contractType, setContractType] = useState("permanent");
  const [basicSalary, setBasicSalary] = useState(0);
  const [status, setStatus] = useState("active");
  
  // البنك
  const [bankIban, setBankIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [gosiNo, setGosiNo] = useState("");
  
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [posRes, ctRes] = await Promise.all([
        supabase.from("job_positions").select("id, code, title_ar, level").eq("active", true).order("title_ar"),
        supabase.from("contract_types").select("code, name_ar").eq("active", true),
      ]);
      setPositions(posRes.data ?? []);
      setContractTypes(ctRes.data ?? []);
    })();
    
    if (employee) {
      setFirstNameAr(employee.first_name_ar ?? "");
      setMiddleNameAr(employee.middle_name_ar ?? "");
      setLastNameAr(employee.last_name_ar ?? "");
      setFirstNameEn(employee.first_name_en ?? "");
      setLastNameEn(employee.last_name_en ?? "");
      setGender(employee.gender ?? "male");
      setDob(employee.date_of_birth ?? "");
      setMaritalStatus(employee.marital_status ?? "single");
      setNationality(employee.nationality ?? "سعودي");
      setReligion(employee.religion ?? "");
      setNationalId(employee.national_id ?? "");
      setIqamaNo(employee.iqama_no ?? "");
      setIqamaExpiry(employee.iqama_expiry ?? "");
      setPassportNo(employee.passport_no ?? "");
      setPassportExpiry(employee.passport_expiry ?? "");
      setMobile(employee.mobile ?? "");
      setEmail(employee.email ?? "");
      setCity(employee.city ?? "");
      setAddress(employee.address ?? "");
      setPositionId(employee.position_id ?? "");
      setHireDate(employee.hire_date ?? new Date().toISOString().slice(0, 10));
      setContractType(employee.contract_type ?? "permanent");
      setBasicSalary(employee.basic_salary ?? 0);
      setStatus(employee.status ?? "active");
      setBankIban(employee.bank_iban ?? "");
      setBankName(employee.bank_name ?? "");
      setGosiNo(employee.gosi_no ?? "");
      setNotes(employee.notes ?? "");
    } else {
      // reset
      setFirstNameAr(""); setMiddleNameAr(""); setLastNameAr("");
      setFirstNameEn(""); setLastNameEn("");
      setGender("male"); setDob(""); setMaritalStatus("single");
      setNationality("سعودي"); setReligion("");
      setNationalId(""); setIqamaNo(""); setIqamaExpiry("");
      setPassportNo(""); setPassportExpiry("");
      setMobile(""); setEmail(""); setCity(""); setAddress("");
      setPositionId(""); setHireDate(new Date().toISOString().slice(0, 10));
      setContractType("permanent"); setBasicSalary(0); setStatus("active");
      setBankIban(""); setBankName(""); setGosiNo("");
      setNotes("");
    }
  }, [open, employee]);

  const handleSave = async () => {
    if (!firstNameAr.trim() || !lastNameAr.trim()) {
      toast.error("الاسم الأول والأخير بالعربية مطلوبان");
      return;
    }
    if (!mobile.trim()) {
      toast.error("رقم الجوال مطلوب");
      return;
    }
    if (!hireDate) {
      toast.error("تاريخ التعيين مطلوب");
      return;
    }
    
    setSaving(true);
    try {
      const payload: any = {
        first_name_ar: firstNameAr.trim(),
        middle_name_ar: middleNameAr.trim() || null,
        last_name_ar: lastNameAr.trim(),
        first_name_en: firstNameEn.trim() || null,
        last_name_en: lastNameEn.trim() || null,
        gender,
        date_of_birth: dob || null,
        marital_status: maritalStatus,
        nationality: nationality.trim(),
        religion: religion.trim() || null,
        national_id: nationalId.trim() || null,
        iqama_no: iqamaNo.trim() || null,
        iqama_expiry: iqamaExpiry || null,
        passport_no: passportNo.trim() || null,
        passport_expiry: passportExpiry || null,
        mobile: mobile.trim(),
        email: email.trim() || null,
        city: city.trim() || null,
        address: address.trim() || null,
        position_id: positionId || null,
        hire_date: hireDate,
        contract_type: contractType,
        basic_salary: Number(basicSalary) || 0,
        status,
        bank_iban: bankIban.trim() || null,
        bank_name: bankName.trim() || null,
        gosi_no: gosiNo.trim() || null,
        notes: notes.trim() || null,
      };
      
      if (isEdit) {
        const { error } = await supabase.from("employees").update(payload).eq("id", employee.id);
        if (error) throw error;
        toast.success("تم حفظ التغييرات");
      } else {
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw error;
        toast.success("تم إنشاء الموظف");
      }
      
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `تعديل: ${employee.full_name_ar}` : "موظف جديد"}
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="personal"><User className="h-4 w-4 ml-1" /> شخصية</TabsTrigger>
            <TabsTrigger value="identity"><FileText className="h-4 w-4 ml-1" /> الهوية</TabsTrigger>
            <TabsTrigger value="job"><Briefcase className="h-4 w-4 ml-1" /> الوظيفة</TabsTrigger>
            <TabsTrigger value="financial"><DollarSign className="h-4 w-4 ml-1" /> مالية</TabsTrigger>
          </TabsList>

          {/* بيانات شخصية */}
          <TabsContent value="personal" className="space-y-3 pt-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">الاسم الأول *</label>
                <Input value={firstNameAr} onChange={e => setFirstNameAr(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">الأوسط</label>
                <Input value={middleNameAr} onChange={e => setMiddleNameAr(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">الأخير *</label>
                <Input value={lastNameAr} onChange={e => setLastNameAr(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">First Name (English)</label>
                <Input value={firstNameEn} onChange={e => setFirstNameEn(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Last Name (English)</label>
                <Input value={lastNameEn} onChange={e => setLastNameEn(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">الجنس *</label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">ذكر</SelectItem>
                    <SelectItem value="female">أنثى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">تاريخ الميلاد</label>
                <Input type="date" value={dob} onChange={e => setDob(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">الحالة الاجتماعية</label>
                <Select value={maritalStatus} onValueChange={setMaritalStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">أعزب</SelectItem>
                    <SelectItem value="married">متزوج</SelectItem>
                    <SelectItem value="divorced">مطلق</SelectItem>
                    <SelectItem value="widowed">أرمل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">الجنسية *</label>
                <Input value={nationality} onChange={e => setNationality(e.target.value)} placeholder="سعودي" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">الديانة</label>
                <Input value={religion} onChange={e => setReligion(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">رقم الجوال *</label>
                <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="05XXXXXXXX" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">البريد الإلكتروني</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">المدينة</label>
                <Input value={city} onChange={e => setCity(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">العنوان</label>
              <Input value={address} onChange={e => setAddress(e.target.value)} />
            </div>
          </TabsContent>

          {/* الهوية */}
          <TabsContent value="identity" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">رقم الهوية الوطنية (للسعوديين)</label>
                <Input value={nationalId} onChange={e => setNationalId(e.target.value)} maxLength={10} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">رقم الإقامة (للوافدين)</label>
                <Input value={iqamaNo} onChange={e => setIqamaNo(e.target.value)} maxLength={10} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">تاريخ انتهاء الإقامة</label>
                <Input type="date" value={iqamaExpiry} onChange={e => setIqamaExpiry(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">رقم الجواز</label>
                <Input value={passportNo} onChange={e => setPassportNo(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">تاريخ انتهاء الجواز</label>
              <Input type="date" value={passportExpiry} onChange={e => setPassportExpiry(e.target.value)} />
            </div>
          </TabsContent>

          {/* الوظيفة */}
          <TabsContent value="job" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">المسمى الوظيفي</label>
                <Select value={positionId} onValueChange={setPositionId}>
                  <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent>
                    {positions.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.title_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">تاريخ التعيين *</label>
                <Input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">نوع العقد</label>
                <Select value={contractType} onValueChange={setContractType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {contractTypes.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.name_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">الحالة</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="on_leave">في إجازة</SelectItem>
                    <SelectItem value="suspended">موقوف</SelectItem>
                    <SelectItem value="terminated">مفصول</SelectItem>
                    <SelectItem value="resigned">مستقيل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* المالية */}
          <TabsContent value="financial" className="space-y-3 pt-3">
            <div>
              <label className="text-sm font-medium mb-1 block">الراتب الأساسي (ر.س)</label>
              <Input type="number" value={basicSalary} onChange={e => setBasicSalary(Number(e.target.value))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">اسم البنك</label>
                <Input value={bankName} onChange={e => setBankName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">IBAN</label>
                <Input value={bankIban} onChange={e => setBankIban(e.target.value)} placeholder="SA..." />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">رقم التأمينات الاجتماعية</label>
              <Input value={gosiNo} onChange={e => setGosiNo(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">ملاحظات</label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 ml-2" />
            {saving ? "جاري الحفظ..." : isEdit ? "حفظ التغييرات" : "إنشاء"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
