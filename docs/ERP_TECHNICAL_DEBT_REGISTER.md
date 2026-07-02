# Sarat Automotive ERP — Technical Debt Register

> سجلٌّ رسميٌّ لكلّ دَينٍ تقنيٍّ **مقصودٍ ومُثبتٍ بدليل**. يخضع لـ ERP_PRODUCT_CONSTITUTION.md §6 (Governance).
> **قاعدة الإدراج (Evidence Before Judgment):** لا يُسجَّل بندٌ إلا بدليلٍ صريح
> (Audit رقم / نتيجة SQL / ملف+سطر / commit / جلسة مراجعة). الذاكرة وحدها لا تكفي.
>
> Evidence Level: **VERIFIED** (دليلٌ مباشرٌ اليوم) · **PARTIALLY VERIFIED** · **HYPOTHESIS**.
> Technical Owner = المجال (لا شخص) لينتقل بسلاسةٍ لأيّ مطوّرٍ جديد.
>
> آخر تحديث: 2026-07-02

---

## البنود المفتوحة (Open Debts)

### DEBT-001
- **Title:** AP لم ينتقل لمعيار SAP Open Item
- **Category:** Accounting
- **Description:** purchase_invoices ما زال يستعمل الحالة القديمة "partially_paid"، بينما AR اعتمد OPEN/PARTIALLY_CLEARED/CLEARED.
- **Evidence:** types.ts أسطر 2903, 2909, 3135, 3142 = "partially_paid" (Audit-002، 2026-07-02). purchaseInvoicesDb.ts يكتب from("purchase_invoices").
- **Evidence Level:** VERIFIED
- **Risk:** عدم اتساق معيار المحاسبة بين المدينين والدائنين؛ أعمار الدين والمقاصّة في المشتريات على منطق مختلف.
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Accounting
- **Priority:** High
- **Status:** Open
- **Target Release:** 1.0
- **Created At:** 2026-07-02
- **Closed At:** —

### DEBT-002
- **Title:** COGS_INVENTORY_OUT بلا تفصيل حسب product_type
- **Category:** Accounting
- **Description:** الجانب الدائن من قيد التكلفة له تعيينٌ افتراضيٌّ واحدٌ (product_type=null) بلا تفصيلٍ لـ used_vehicle/part، بينما COGS_EXPENSE وPURCHASE_INVENTORY مُفصَّلان.
- **Evidence:** استعلام account_determinations (Audit-002، 2026-07-02): COGS_INVENTORY_OUT صفٌّ واحدٌ product_type=null.
- **Evidence Level:** VERIFIED
- **Risk:** خروج مخزون كلّ الأنواع من حسابٍ واحد → عدم دقّةٍ في تصنيف المخزون عند تنوّع المنتجات.
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Accounting
- **Priority:** Medium (يظهر أثره عند تفعيل بيع المستعمل/القطع)
- **Status:** Open
- **Target Release:** 1.0
- **Created At:** 2026-07-02
- **Closed At:** —

### DEBT-003
- **Title:** تسلسل triggers الفاتورة يعتمد الترتيب الأبجديّ
- **Category:** Architecture
- **Description:** trg_zz_complete_vehicle_sale سُمّي بـ"zz" ليُنفَّذ بعد trg_invoice_journal_entry أبجديّاً. أيّ trigger جديدٌ باسمٍ أسبق يكسر التسلسل بصمت.
- **Evidence:** pg_trigger على invoices (Audit-002، 2026-07-02): [trg_inv_no, trg_invoice_journal_entry, trg_zz_complete_vehicle_sale]. سلوك Postgres (تنفيذ أبجديّ) موثّقٌ رسميّاً.
- **Evidence Level:** VERIFIED
- **Risk:** هشاشةٌ في تسلسل القيود المحاسبيّة عند إضافة أيّ trigger مستقبلاً.
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Architecture
- **Priority:** Medium
- **Status:** Open
- **Target Release:** 1.0
- **Created At:** 2026-07-02
- **Closed At:** —

### DEBT-004
- **Title:** Vehicle Profitability VAT Basis Not Audited
- **Category:** Reporting / Accounting
- **Description:** أساس احتساب ربحيّة المركبة (Gross مقابل Net) لم يُعتمَد محاسبيّاً بعد. التقرير يستعمل invoice_lines.total مقابل تكلفةٍ من cost_price، ولم يُحسَم هل total شاملٌ للضريبة وهل يجب أن تكون الربحيّة صافيةً منها. **الدَّين ليس أن الحساب خاطئ — بل أن الأساس غير معتمد.**
- **Evidence:** جلسة VP Audit (2026-07-02): صفّ invoice_lines لـ TEST-V-001 (unit_price=100000, vat_amount=15000, total=115000). أُجّل صراحةً في commit 144a4c5.
- **Evidence Level:** VERIFIED (وجود القرار المحاسبيّ غير المحسوم مُثبت)
- **Risk Evidence Level:** PARTIALLY VERIFIED (الأثر الماليّ لم يُثبَت بالكامل)
- **Risk:** لو ثبت لاحقاً خلطُ إيرادٍ شاملٍ للضريبة مع تكلفةٍ بدونها → قد يتشوّه الهامش. قد يمسّ SalesAnalytics.
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Accounting / Reporting
- **Priority:** Medium
- **Status:** Open
- **Target Release:** 1.0
- **Created At:** 2026-07-02
- **Closed At:** —

---

### DEBT-005
- **Title:** SUPPLIER_PAYMENT_PAY Account Determination Data Hygiene
- **Category:** Technical Debt / Data Governance
- **Description (Finding):** SUPPLIER_PAYMENT_PAY contains inconsistent account determination rows, including one mapping to account 421/revenue and duplicate mappings to 1121.
- **Impact:** Current supplier payment posting appears to post correctly based on reviewed function behavior (Dr PURCHASE_AP / Cr resolved cash-by-payment_method), but the account_determinations data contains unsafe and confusing mappings that may create incorrect posting if future logic or payment_method resolution uses the wrong row.
- **Evidence:** account_determinations query (AUDIT-PE-001, 2026-07-02): 5 rows for SUPPLIER_PAYMENT_PAY incl. 421/revenue + 1121 duplicated ×3. Function create_supplier_payment_journal_entry reviewed (pg_get_functiondef): posts Dr AP / Cr resolve_account(...,payment_method) — the 421 row is not selected under normal payment methods.
- **Evidence Level:** VERIFIED
- **Risk:** Medium
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Accounting / Architecture
- **Priority:** Medium
- **Status:** Open
- **Ownership Confirmation Required:** Confirm whether the affected account_determinations rows are product/default configuration or test/company setup data. If Default/Product configuration → remains Technical / Data Governance Debt. If Test Company data → reclassify later as **CONFIG-001: Test Company Account Determination Cleanup** (not a product debt).
- **Target Release:** 1.0
- **Created At:** 2026-07-02
- **Closed At:** —

---

### DEBT-006
- **Title:** Journal Entry Duplicate Protection Relies on Function-Level Guard Only
- **Category:** Technical Debt / Accounting Control
- **Description (Finding):** The reviewed posting functions contain function-level duplicate guards using source_id/source_type checks before inserting journal entries. However, journal_entries has no DB-level unique constraint or atomic idempotency mechanism for source_type/source_id.
- **Impact:** Normal sequential posting appears protected, but concurrent posting requests may still create duplicate journal entries because the current check-then-insert pattern is not guaranteed atomic at the database level.
- **Evidence:** pg_constraint + pg_indexes (2026-07-02): only UNIQUE(entry_no) + PK(id); no unique on (source_type, source_id). Query 4: all four create_* functions have src_id=true, if_exists=true.
- **Evidence Level:** VERIFIED
- **Risk Evidence Level:** PARTIALLY VERIFIED (structural race-condition risk exists; no actual duplicate case observed yet)
- **Risk:** Medium-High
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Accounting / Architecture
- **Priority:** Medium-High
- **Status:** Open
- **Target Release:** 1.0
- **Candidate Solution:** Add DB-level atomic idempotency protection after confirming the final journal entry lifecycle model. **A naive UNIQUE(source_type, source_id) is PROVEN WRONG** — Phase 3-B evidence shows depreciation legitimately produces ~60 entries per asset (monthly schedule over ~5 years, JE-2026..JE-2031). The correct key is **event-type-dependent**: (source_type, source_id) suffices for invoices/payments (never legitimately repeated), but recurring events (depreciation) need an extra dimension e.g. (source_type, source_id, period/entry_month). Final design may also include posting_role, reversal_of_entry_id, or entry_type. **Not decided now — requires full posting-event coverage + reversal-model review first.**
- **Phase 3-B Evidence:** Query C (2026-07-02) — depreciation source_ids 2d4382ed (60 entries) + ed8edefa (59), entry numbers ascending across years = legitimate monthly schedule, NOT duplicates.
- **Phase 4-A Evidence (run_monthly_depreciation, 2026-07-02):** confirms idempotency keys are **event-specific**. For depreciation the key is `asset_id + period`.
- **Open Question RESOLVED (2026-07-02):** `fixed_asset_depreciation` HAS a DB-level `UNIQUE(asset_id, period)` constraint (pg_constraint: fixed_asset_depreciation_asset_id_period_key). Depreciation duplicate protection is therefore two-layer: logical (IF EXISTS) + DB-atomic (UNIQUE on asset_id+period). **Depreciation provides verified evidence that event-specific idempotency keys are required, and that fixed_asset_depreciation is protected by a unique key on asset_id + period.** This is evidence about the *requirement* (keys must be event-specific), NOT a general solution already in place for the whole Posting Engine. The final idempotency design across all events is still not determined and requires reviewing all posting events + their correct per-event keys.
- **Closed At:** —

---

### DEBT-007
- **Title:** Journal Entry Numbering Is Not Atomic
- **Category:** Accounting Control / Architecture
- **Finding:** next_je_no and reverse_journal_entry both generate journal entry numbers using a MAX+1 pattern without FOR UPDATE, sequence locking, or another atomic mechanism. reverse_journal_entry also duplicates the numbering logic inline instead of using the central next_je_no function. The system already has get_next_document_number for document numbering, but journal entry numbering is not yet using an equivalent atomic SSOT mechanism.
- **Impact:** Under concurrent posting, two transactions may read the same MAX value and attempt to generate the same entry_no. The existing UNIQUE(entry_no) constraint likely prevents data corruption, but the second transaction may fail with a unique violation instead of retrying safely. This creates an operational reliability risk in multi-user / multi-branch usage, especially around financial posting and reversal.
- **Evidence:** pg_get_functiondef(next_je_no), pg_get_functiondef(reverse_journal_entry), pg_get_functiondef(create_partner_settlement), pg_get_functiondef(cancel_sales_invoice) (2026-07-02). The reviewed functions show MAX+1 journal entry numbering without FOR UPDATE, sequence locking, or another atomic mechanism. cancel_sales_invoice is especially strong evidence because it uses get_next_document_number for credit_note numbering, but still uses MAX+1 for journal entry numbering in the same function.
- **Evidence Level:** VERIFIED
- **Risk:** Medium (UNIQUE(entry_no) prevents data corruption but not operation failure; risk manifests under concurrency, not necessarily single-user use)
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Accounting / Architecture
- **Priority:** Medium
- **Status:** Open
- **Target Release:** 1.0
- **Candidate Solution:** Unify journal entry numbering under one atomic SSOT mechanism. Possible options: (1) Reuse/extend get_next_document_number for JOURNAL_ENTRY numbering. (2) Introduce a dedicated journal entry sequence table with FOR UPDATE. (3) Use a PostgreSQL sequence if continuous business numbering requirements allow it. (4) Make reverse_journal_entry call the central numbering function instead of duplicating numbering logic. Final design is not decided in this audit step.
- **Closed At:** —

---

### DEBT-008
- **Title:** Financial SECURITY DEFINER RPCs Are Executable by anon/PUBLIC Without Authorization Controls
- **Category:** Security / Accounting Control
- **Finding:** Six high-impact financial RPC functions are SECURITY DEFINER, owned by postgres, and executable by PUBLIC / anon / authenticated / service_role. Function-definition review confirmed no auth.uid() null rejection, no internal role checks, and weak or missing company/branch scope across all six. Application-layer confirmation found that the existing RPC call sites use the anon client without service-layer role guards. can_cancel, document_remaining, UNIQUE constraints, and UI-only isAccounting checks are data-integrity or UI guards, not authorization controls.
- **Affected functions:** create_manual_journal_entry, reverse_journal_entry, cancel_sales_invoice, create_partner_settlement, create_allocation, run_monthly_depreciation.
- **Impact:** Unauthorized callers may be able to create manual journal drafts, reverse posted journal entries, cancel sales invoices, create partner settlements, insert open-item allocations, or run depreciation batches. This can affect GL, AR/AP, invoice status, open-item clearing, partner balances, aging reports, inventory reversal, fixed-asset depreciation, and financial-reporting integrity.
- **Evidence:** pg_proc.proacl (2026-07-02): all six show `{=X, anon=X, authenticated=X, service_role=X}`. pg_get_functiondef of all six: no auth.uid() null-rejection, no role check. git grep of RPC call sites (partnerLedger.ts:110, creditNotes.ts:53, purchasePaymentsDb.ts:120, SalesInvoicesRegistry.tsx:127, Invoices.tsx:148): all use the shared anon client with no service-layer role guard; reverse_journal_entry / create_manual_journal_entry / run_monthly_depreciation have no call site at all (DB-only exposure, no application barrier possible).
- **Evidence Level:** VERIFIED (both DB layer and application layer)
- **Risk:** Critical
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Security / Accounting / Architecture
- **Priority:** Critical
- **Status:** Open
- **Target Release:** 1.0
- **Candidate Solution:** Restrict EXECUTE privileges on financial SECURITY DEFINER RPCs using least privilege. At minimum: REVOKE EXECUTE from PUBLIC and anon; do not rely on broad authenticated EXECUTE unless each function enforces internal role authorization; add auth.uid() null-rejection inside each function; add explicit finance/admin role authorization; add company_id / branch_id scoping inside the function; keep application-layer guards as UX controls only, not as the primary security boundary. Final privilege model is not decided in this audit step and must be designed carefully before remediation.
- **Open Questions:** Whether any of these RPCs are ever legitimately called by anon in real flows (observed: all call sites are authenticated UI actions — anon appears unnecessary, so REVOKE likely safe, pending confirmation).
- **Closed At:** —

---

### DEBT-009
- **Title:** SECURITY DEFINER Financial Functions Do Not Enforce a Safe search_path
- **Category:** Security / Database Hardening
- **Finding:** SECURITY DEFINER functions should pin a safe search_path to avoid object-resolution ambiguity and privilege-escalation risks. Reviewed financial SECURITY DEFINER functions do not show a safe function-level search_path configuration.
- **Affected functions:** all six (same list as DEBT-008).
- **Impact:** Without a pinned search_path, a SECURITY DEFINER function's unqualified object references could, under certain conditions, resolve to attacker-controlled objects, enabling privilege escalation (the function runs as postgres). Partially mitigated where tables are already schema-qualified (public.*), but not eliminated.
- **Evidence:** pg_proc.proconfig (2026-07-02): all six functions return `proconfig = null` (explicitly confirmed for every one: cancel_sales_invoice, create_allocation, create_manual_journal_entry, create_partner_settlement, reverse_journal_entry, run_monthly_depreciation). No SET search_path in any definition.
- **Evidence Level:** VERIFIED (proconfig=null confirmed for all six explicitly)
- **Risk:** High
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Security / Database
- **Priority:** High
- **Status:** Open
- **Target Release:** 1.0
- **Candidate Solution:** Set a safe, explicit search_path for financial SECURITY DEFINER functions using only trusted schemas, with pg_temp placed last when needed. The exact schema list must be reviewed before remediation. Prefer schema-qualifying referenced tables/functions explicitly and avoiding reliance on implicit object resolution. Not executed in this audit step.
- **Closed At:** —

---

### DEBT-010
- **Title:** create_allocation Allows Caller-Controlled created_by and Unauthenticated Clearing
- **Category:** Security / Open Item Accounting / Audit Trail
- **Finding:** create_allocation does not read auth.uid(), does not reject unauthenticated callers, does not perform role checks, and accepts p_created_by from the caller. Because the function is executable by anon/PUBLIC and writes directly to open_item_allocations, a direct RPC caller can create clearing allocations and control or spoof the created_by value.
- **Impact:** Unauthorized or spoofed allocations may make invoices appear partially or fully paid/settled without a real payment or authorized clearing process. This can affect AR Aging, AP Aging, partner balances, invoice status, clearing reports, and audit-trail reliability. This is not merely a posting issue — clearing-layer manipulation can distort financial reports even without creating a journal entry.
- **Evidence:** pg_get_functiondef(create_allocation) (2026-07-02): no auth.uid() read; created_by sourced from p_created_by parameter; guards are type-whitelist + document_remaining over-allocation check (data-integrity, not authorization). proacl: anon=X. Application layer: 3 call sites (purchasePaymentsDb.ts:120, SalesInvoicesRegistry.tsx:127, Invoices.tsx:148) pass p_created_by=userId correctly, but the parameter remains forgeable via direct REST.
- **Evidence Level:** VERIFIED
- **Risk:** High
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Security / Open Item Accounting
- **Priority:** High
- **Status:** Open
- **Target Release:** 1.0
- **Candidate Solution:** Derive created_by from auth.uid() inside the function instead of accepting p_created_by from the caller; reject unauthenticated callers; add role/company authorization; REVOKE EXECUTE from anon/PUBLIC. Not executed in this audit step.
- **Closed At:** —

---

## Evidence Backlog — Not Official Debt

> **ليست ديوناً تقنيّة.** مرشّحاتٌ ذُكِرت في جلساتٍ سابقة (غالباً من الذاكرة) لكن **بلا دليلٍ
> مُتحقَّقٍ في جلسةٍ رسميّة**. لا تحمل Debt ID ولا تُعَدّ ضمن الديون. تُرقَّى إلى DEBT رسميٍّ
> فقط عند جمع دليلٍ (VERIFIED / PARTIALLY VERIFIED). مستوى الدليل الافتراضي للمرشّحات هو
> HYPOTHESIS ما لم يُذكر خلاف ذلك صراحةً. قد تحمل بعض المرشّحات مستوى PARTIALLY VERIFIED
> عند وجود دليلٍ محدود، لكنها تبقى Not Official Debt حتى تُرقّى بقرار مراجعةٍ رسميّ.

| Candidate ID | العنوان | المجال | ملاحظة |
|---|---|---|---|
| CANDIDATE-001 | setRuntimeSupabaseClient bridge (ZATCA Runtime stopgap) | ZATCA/Architecture | يحتاج فحص الكود الحيّ |
| CANDIDATE-002 | credit_notes.amount على مستوى الفاتورة بدل credit_note_lines | Accounting | يحتاج تحقّقاً |
| CANDIDATE-003 | Metadata في notes نصّ (vehicleMeta/contactMeta) | Architecture | لم يُفحَص محتواها |
| CANDIDATE-004 | AW2 — Approval Workflow (mode=ALL + escalation) ناقص | Workflow | يحتاج تدقيقاً |
| CANDIDATE-005 | Normalize Vehicle Status Constants (نصوص الحالة في salesVehicleStatus) | Architecture | مؤجّل بوعي |
| CANDIDATE-006 | get_next_document_number هشّ مع prefix فارغ | Architecture | يحتاج تحقّقاً |


### CANDIDATE-FA-001: Fixed Asset acquire/dispose default account parameter '1121'

**Candidate Finding:** acquire_fixed_asset / dispose_fixed_asset include a default account parameter or fallback value '1121'. Requires function definition review and business context confirmation to determine whether it is harmless default input, sample/test configuration, or Product-First violation.

**Status:** Candidate only — not official debt.

**Evidence Level:** PARTIALLY VERIFIED

**Next Action:** Confirm whether '1121' is a required caller-provided default, a safe placeholder, or a hardcoded fallback used in production posting.

## البنود المغلقة (Closed Debts)

*(لا شيء بعد)*
