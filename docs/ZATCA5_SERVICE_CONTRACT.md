# ZATCA5 — XAdES Signature Engine: Service Layer Contract

> **النوع:** عقد Service Layer (TypeScript) — لا SQL. المرجع لفريق التنفيذ.
> **التاريخ:** 22/06/2026 | **المرجع:** ZATCA5_AUDIT.md.
> **القرار:** DB أنجز كل ما يحتاجه التوقيع (ZATCA1-4). هذه الوثيقة عقد التنفيذ.

## المبدأ الحاكم
```
DB (ZATCA1-4)     = Source of Truth (الهوية + السلسلة + الشهادات + الإرسال)
Service (ZATCA5)  = Cryptographic Engine (XML + التوقيع + QR + الإرسال)
Vault             = Private Keys (لا تغادر أبداً)
```

## معايير ZATCA التشفيرية (مؤكّدة، يونيو 2026)
- التوقيع: **ECDSA على منحنى secp256k1** (لا RSA — تصحيح مهمّ).
- التجزئة: SHA-256.
- مستوى التوقيع: XAdES B-B (ETSI EN 319 132-1)، enveloped.
- المحتوى الموقّع: XML كاملاً عدا UBLExtensions + Signature + QR.
- الشهادة: X.509، سلسلة كاملة حتى trust anchor في التوقيع.

---

## الخدمات الخمس (Service Contract)

### 1️⃣ XmlBuilderService
```typescript
interface XmlBuilderService {
  buildInvoiceXml(invoiceId: string): Promise<string>;  // UBL 2.1 XML
}
```
**المدخلات (من DB):**
- invoices (uuid, invoice_no, issue_timestamp, invoice_type, invoice_category, total, vat_amount)
- invoice_lines (description, quantity, unit_price, vat_pct, vat_amount, total)
- companies (name, vat_number, العنوان الكامل، CRN)
- customers (name, vat_number, العنوان)
- zatca_document_chain (icv, pih) — **من register أو قبله**

**المخرج:** UBL 2.1 XML (ProfileID, ID, UUID, IssueDate/Time, InvoiceTypeCode[388/381/383], AccountingSupplierParty, AccountingCustomerParty, InvoiceLines, TaxTotal, LegalMonetaryTotal, AdditionalDocumentReference[ICV+PIH]).

**InvoiceTypeCode (مشتقّ):** tax_invoice→388, credit_note→381, debit_note→383 + name (bitmask: standard/simplified).

---

### 2️⃣ XadesSignerService
```typescript
interface SignedXmlResult {
  signedXml: string;          // XML مع <ds:Signature> مغروس
  invoiceHash: string;        // SHA-256 (base64) — للسلسلة + QR
  ecdsaSignature: string;     // التوقيع (base64) — للـ QR
  publicKey: string;          // المفتاح العامّ — للـ QR
  certificateSignature: string; // ختم الشهادة — للـ QR
}
interface XadesSignerService {
  signXml(xml: string, credentialId: string): Promise<SignedXmlResult>;
}
```
**الخطوات:**
1. canonicalization (C14N) للمحتوى المراد توقيعه.
2. SHA-256 → invoiceHash.
3. جلب المفتاح الخاص من **Vault** (عبر credentialId → certificate_fingerprint → Vault key).
4. توقيع ECDSA (secp256k1).
5. بناء SignedProperties (signing time + cert digest).
6. بناء بنية XAdES B-B.
7. غرس <ds:Signature> في UBLExtensions.
8. استخراج (ecdsaSignature, publicKey, certificateSignature) للـ QR.

**أمان:** المفتاح الخاص من Vault فقط، لا يُخزّن، لا يُسجّل، لا يغادر الذاكرة.

---

### 3️⃣ QrTlvService
```typescript
interface QrTlvService {
  buildQrTlv(data: QrData): string;  // Base64 TLV
}
interface QrData {
  sellerName: string;        // Tag 1
  vatNumber: string;         // Tag 2
  timestamp: string;         // Tag 3 (ISO 8601)
  total: string;             // Tag 4 (مع VAT)
  vatAmount: string;         // Tag 5
  invoiceHash: string;       // Tag 6
  ecdsaSignature: string;    // Tag 7
  publicKey: string;         // Tag 8
  certificateSignature: string; // Tag 9
}
```
**الخطوات:** كل وسم = Tag(1 byte) + Length(1 byte) + Value → concatenate → Base64.
9 وسوم للفاتورة الموقّعة (Phase 2). يُكتب في invoices.qr_code (DB موجود من ZATCA1).

---

### 4️⃣ RegistrationService (يستدعي DB الموجود)
```typescript
interface RegistrationService {
  register(documentType: string, documentId: string, invoiceHash: string): Promise<RegisterResult>;
}
```
**يستدعي:** register_document_hash(type, id, hash) — **موجود (ZATCA2)**.
**يحدث في DB ذرّياً:** ICV + PIH + hash + chain row + status='reported'.
**ملاحظة التسلسل:** PIH يجب أن يكون معروفاً قبل بناء XML (Tag في AdditionalDocumentReference). فالتدفّق:
```
register أولاً (يحجز ICV+PIH) → بناء XML (مع ICV+PIH) → التوقيع → hash
```
**انظر قسم PIH Resolution Strategy أدناه — أخطر نقطة تقنية في ZATCA5.**

---

### 5️⃣ SubmissionService (يستدعي DB الموجود)
```typescript
interface SubmissionService {
  submit(documentType: string, documentId: string): Promise<SubmissionResult>;
}
```
**يختار تلقائياً:**
- invoice_type='standard' (B2B) → **Clearance API** (انتظار اعتماد ZATCA قبل التسليم).
- invoice_type='simplified' (B2C) → **Reporting API** (خلال 24 ساعة).

**Fatoora API:** gw-fatoora.zatca.gov.sa (core/simulation/developer-portal حسب environment).
**المصادقة:** Basic Auth (binary_security_token + secret المفكوك من secret_encrypted).

**بعد الاستجابة (يستدعي DB الموجود):**
1. INSERT zatca_submission_log (request/response/http_status/success/error_category) — **موجود (ZATCA3)**.
2. update_zatca_submission_status(type, id, new_status) — **موجود (ZATCA3)**.
   - نجاح Clearance → 'cleared'؛ نجاح Reporting → 'reported'؛ فشل → 'rejected'/'failed'.

---

## 🔴 PIH Resolution Strategy (أخطر نقطة تقنية)

### المشكلة
register_document_hash (ZATCA2) هو الجهة الوحيدة التي تثبّت ICV+PIH+Hash+Chain **ذرّياً**. لكن بناء XML يحتاج معرفة PIH **قبل** إنشاء XML (لأن PIH يدخل في AdditionalDocumentReference داخل XML نفسه، ويُوقّع معه). فالتوقيع غير الذرّي (Service) يجب أن يتّسق مع السلسلة الذرّية (DB).

### الخطر
لو بنى الـ Service XML بـ PIH قديم (تغيّر رأس السلسلة بين القراءة والتسجيل بسبب فاتورة متزامنة)، فالـ XML الموقّع يحمل PIH خاطئاً → السلسلة مكسورة.

### الاستراتيجية (Optimistic Concurrency)
```
1. Service يطلب رأس السلسلة الحالي (read-only):
   SELECT invoice_hash FROM zatca_document_chain
   WHERE company_id=? ORDER BY icv DESC LIMIT 1
   → expected_pih (أو SHA256"0" إن فارغة)

2. DB يُرجع expected_pih (قراءة فقط، لا حجز).

3. Service يبني XML باستخدام expected_pih.

4. Service يوقّع XML → invoiceHash.

5. Service يستدعي register_document_hash(type, id, hash, expected_pih):
   DB يتحقّق أن رأس السلسلة لم يتغيّر:
   - رأس السلسلة الحالي == expected_pih؟
     - نعم → يثبّت ICV+PIH+Hash+Chain ذرّياً (كالمعتاد).
     - لا → RAISE CHAIN_CONFLICT (فاتورة أخرى سبقت).

6. إن CHAIN_CONFLICT:
   - Service يعيد من الخطوة 1 (PIH جديد).
   - يعيد بناء XML + توقيع + register.
   - retry محدود (مثلاً 3 محاولات).
```

### تعديل DB محتمل (وقت بناء الـ Service، لا الآن)
register_document_hash الحالية تجلب PIH داخلياً (آخر صفّ). لدعم هذه الاستراتيجية، **قد** نضيف معامل اختياري p_expected_pih:
```sql
register_document_hash(type, id, hash, p_expected_pih TEXT DEFAULT NULL)
  -- إن p_expected_pih IS NOT NULL:
  --   IF (آخر hash في السلسلة) IS DISTINCT FROM p_expected_pih THEN
  --     RAISE EXCEPTION 'CHAIN_CONFLICT' USING ERRCODE='40001';
  --   END IF;
  -- ثم المنطق الحالي (ذرّي).
```
**هذا تعديل بسيط متوافق-خلفياً** (DEFAULT NULL = السلوك الحالي). يُقرّر وقت بناء الـ Service. **لا يُبنى الآن** (الـ Service غير موجود بعد، وقد يُكتفى بالقفل الحالي FOR UPDATE الذي يسلسل المعاملات أصلاً).

### لماذا قد لا نحتاجه أصلاً
next_zatca_icv فيه FOR UPDATE يقفل العدّاد للـ transaction. لو استدعى الـ Service register مباشرةً (دون فجوة قراءة-تسجيل طويلة)، فالقفل يسلسل المعاملات. الخطر يظهر فقط لو بُني XML بـ PIH ثم تأخّر register طويلاً. الاستراتيجية أعلاه تحمي من ذلك صراحةً.

---

## دورة الحياة الكاملة (Service يربط DB)
```
1. الفاتورة issued → prepare_zatca_invoice (Gatekeeper، ZATCA1) → ready
2. Service: buildInvoiceXml (مع PIH السابق)
3. Service: signXml (XAdES، المفتاح من Vault) → signedXml + invoiceHash + QR elements
4. Service: register_document_hash(invoiceHash) (ZATCA2) → ICV+PIH+chain، status=reported
5. Service: buildQrTlv → UPDATE invoices.qr_code
6. Service: submit (Clearance/Reporting، Fatoora)
7. Service: submission_log + update_zatca_submission_status (ZATCA3) → cleared/rejected
8. cron: mark_expired_credentials (ZATCA4)
```

## Error Codes & Retry (من ZATCA3)
| الفئة | retryable | الإجراء |
|-------|-----------|---------|
| network / server (5xx) / timeout | true | Retry (exponential backoff) |
| validation / zatca_rejected / invalid_xml | false | No Retry (إصلاح + إعادة إصدار) |

كل محاولة → صفّ جديد في submission_log (attempt_number، append-only).

## Vault Integration
```
credentialId → zatca_credentials.certificate_fingerprint → Vault path → Private Key
```
- المفتاح الخاص: Vault/KMS/HSM فقط.
- secret (API): secret_encrypted في DB → يُفكّ بمفتاح التطبيق (خارج DB) للمصادقة.
- binary_security_token: من DB مباشرة.

## Certificate Resolution
```
الفاتورة → company_id + environment → zatca_credentials WHERE is_active=true AND credential_type='PCSID' (إنتاج) أو 'CCSID' (اختبار)
→ certificate_fingerprint → Vault (المفتاح) + token/secret (المصادقة)
```

## ملخّص: لا DB جديد
| الطبقة | الحالة |
|--------|--------|
| الهوية (uuid/icv/type) | ✅ ZATCA1 |
| السلسلة (chain/PIH/hash) | ✅ ZATCA2 |
| الشهادات + الإرسال | ✅ ZATCA3 |
| دورة حياة الشهادة | ✅ ZATCA4 |
| **التوقيع/XML/QR/الاتصال** | **Service Layer (هذه الوثيقة)** |

## نقطة تنفيذ مستقبلية محتملة (DB)
إن تبيّن في التنفيذ أن بناء XML يحتاج PIH قبل register، قد نضيف **get_next_pih(company) للقراءة فقط** (دون حجز ICV). لكن هذا يُقرّر وقت بناء الـ Service، لا الآن (قد لا يلزم — يمكن قراءة آخر صفّ سلسلة مباشرة).

## القرار
**ZATCA5 = Service Contract موثّق.** لا migration. DB أنجز دوره (ZATCA1-4). هذه الوثيقة مرجع فريق التنفيذ حين يبني خدمة التوقيع + Fatoora.
