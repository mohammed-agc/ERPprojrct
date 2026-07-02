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
