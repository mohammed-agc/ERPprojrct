# Sarat Remediation Design — R-RR2b (cashFlow Cash-Account Resolution)

**Status:** Remediation Design only / No code change / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This document designs the remediation for candidate R-RR2b, discovered during the Reports/RR service review (R-RR2) and reproduced as observation TDF-RR-B07 in Phase B. It is design only — no code is changed, no database is written, and no candidate is promoted to a debt without explicit permission.

---

## 1. Candidate Restated (corrected by live evidence)

The prior wording described R-RR2b as "cashFlow hardcoded 1101/1102". Live reading of `src/services/erp/accounting.ts:1105` (the `cashFlow` function) refined this:

- The cash-account selection is a **heuristic OR** across five criteria: Arabic name contains نقد / بنك / صندوق, English name matches /cash|bank/i, or `code.startsWith("1101")` / `code.startsWith("1102")`.
- So it is not a pure hardcode — but it still has two real weaknesses: it depends on account **names** (fragile if names differ or are localized differently), and it embeds two literal code prefixes (1101/1102) rather than resolving via account determination like the rest of the engine.

## 2. Live Evidence That Sharpens the Case

A read of `account_determinations` (joined to `accounts`) shows the actual cash accounts on this install:

- `CUSTOMER_PAYMENT_RECEIVE` → 1111 (الصندوق الرئيسي, is_default) and 1121 (البنك الأهلي).
- `SUPPLIER_PAYMENT_PAY` → 1111 (الصندوق) and 1121 (البنك).

The actual cash/bank codes are **1111 and 1121** — not 1101/1102. The literal prefixes in `cashFlow` therefore do **not** match this install's real cash accounts; the function only works today because the name-based part of the heuristic catches نقد/بنك/صندوق. This confirms R-RR2b: the code-prefix path is already wrong for this install, and correctness rests on name-matching, which is exactly the fragility the constitution's Product-First principle warns against.

## 3. Root Cause

`cashFlow` identifies "which accounts are cash" by heuristic (names + two hardcoded prefixes) instead of by account determination. Every other posting path in the engine resolves accounts through `account_determinations` keys (SALES_AR, PURCHASE_AP, CUSTOMER_PAYMENT_RECEIVE, etc.). `cashFlow` is the outlier that does not.

## 4. Remediation Options

### Option A — Reuse existing payment keys (smallest change)

Derive the cash-account set from the accounts already registered under `CUSTOMER_PAYMENT_RECEIVE` and `SUPPLIER_PAYMENT_PAY` in `account_determinations` (the union of their `account_id`s). These are, by definition, the cash/bank accounts the system posts payments to.

- Pros: no schema change; uses existing, populated keys; immediately correct on any install (reads the install's own determination).
- Cons: semantically "cash for cash-flow" is inferred from "payment accounts"; if an install had a cash account never used for customer/supplier payment, it would be missed.

### Option B — Introduce a dedicated CASH_AND_EQUIVALENTS key

Add a new determination key listing exactly the accounts that count as cash & equivalents for cash-flow, seeded per install.

- Pros: explicit, single-purpose, unambiguous; matches the constitution's account-role principle cleanly.
- Cons: requires a new key + seeding (a schema/data addition), which is a larger change and needs its own staging step.

### Option C — Hybrid (recommended for design)

Primary: resolve cash accounts from a dedicated key if present (Option B); fall back to the union of payment keys (Option A) if the dedicated key is not seeded. Drop the name-matching and the literal 1101/1102 prefixes entirely.

- Pros: correct-by-determination, works before and after the dedicated key exists, removes both fragilities.
- Cons: slightly more logic than A alone.

## 5. Recommended Design (Option C)

- Replace the heuristic filter in `cashFlow` with: (1) if a `CASH_AND_EQUIVALENTS` determination exists, use its `account_id` set; (2) else use the union of `CUSTOMER_PAYMENT_RECEIVE` + `SUPPLIER_PAYMENT_PAY` `account_id`s.
- Remove `name_ar.includes(...)`, the `/cash|bank/i` test, and the `code.startsWith("1101"|"1102")` prefixes.
- Everything downstream (opening balance, netChange, counter-party inflow/outflow attribution) is unchanged — only the definition of the cash-account `ids` set changes.

This aligns `cashFlow` with the rest of the engine (account determination, Product-First) and makes it correct on any install regardless of names or code numbers.

## 6. Account Roles (per the constitution)

- The cash-account set = the accounts registered as cash/bank under payment determinations (roles), not literal numbers. On this install that resolves to 1111 (cash) + 1121 (bank), but the design must reference the role/key, not the numbers.
- No number is hardcoded in the remediated design; the numbers above are evidence, not implementation.

## 7. What This Design Does NOT Do

- It does not change any code.
- It does not write to the database or seed a new determination key.
- It does not promote R-RR2b from candidate to debt (that needs explicit permission).
- It does not execute in any environment (staging not confirmed).

## 8. Verification Plan (for when execution is authorized in staging)

- Confirm the remediated `cashFlow` returns the same opening/closing/net for the current test data (the name-heuristic already catches the right accounts today, so results should match — a regression check).
- Confirm that renaming a cash account (or using different code numbers) no longer breaks cash-account detection.
- Confirm no literal account number remains in `cashFlow`.

## 9. Status

```
R-RR2b Remediation Design = Complete (design only)
Live evidence: actual cash accounts = 1111 (cash) + 1121 (bank), NOT 1101/1102
Root cause: cashFlow uses name+prefix heuristic, not account determination
Recommended: Option C (dedicated key with payment-key fallback; drop names + literals)
R-RR2b status = Candidate (unchanged; not promoted)
No code change / No DB writes / No seeding / No execution
Staging = Not confirmed
Posting Engine = Under Audit / Partially Audited
```
