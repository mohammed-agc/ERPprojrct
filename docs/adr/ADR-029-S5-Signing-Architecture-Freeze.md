# ADR-029 — S5 Local Signing Pipeline: Architecture Freeze

**Status:** Frozen · **Scope:** Local production of a signed, chained invoice (everything before network submission) · **Extends:** ADR-023 (secp256k1), ADR-024 (DER), ADR-028 (Chain Concurrency Model) · **Supersedes:** the dead `zatca_icv_counter` path.

This is a freeze, not a tutorial. It records the boundaries, the owners, the protocols, and—most importantly—*why the rejected alternatives were rejected*, so S5.2/S5.3 work can extend the model without re-litigating it.

---

## 1. The Four Aggregates (+ one Coordinator)

The signing domain is partitioned into four aggregates, each the **single owner of one un-re-derivable truth**, plus a Coordinator that owns *ordering only*.

| Aggregate | Owns (the one truth) | Storage | Sees of others (minimum necessary) |
|---|---|---|---|
| **Credential** | "Is there a usable credential now?" → `credentialId` + `certificateFingerprint` | `zatca_credentials` (read-only) | nothing |
| **Chain** | Document order: `icv`, `pih`, `version` | `zatca_chain_state` (SSOT) + `zatca_document_chain` (event log) | one field of Artifact: `artifact_hash` (to *verify*) |
| **Artifact** | The immutable signed bytes (`signed_xml`, `signing_time`, …) | `zatca_signed_artifacts` (append-only) | nothing |
| **Projection** | The app-facing read view of an invoice | `invoices.*` columns (write-ownership, not a new table) | references Artifact by `signed_artifact_id` (a pointer, never the bytes) |
| **Coordinator** | *Ordering* — guarantees the atomic local production of a Signed Invoice | none (stateless) | the public contract of each of the above |

Guiding rule (from ADR-028, now general): **every un-re-derivable truth gets a single owner; every aggregate sees the least detail of the others needed for its own invariants.**

---

## 2. Invariant Ownership

| Invariant | Owner | Enforcement |
|---|---|---|
| `icv` strictly increments; `pih` = previous artifact hash | Chain | All decided under one `FOR UPDATE` lock on the head row (ADR-028 §3.1) |
| Token = `version`; a stale token cannot mutate the chain | Chain | `append` compares `version` ⇒ `CONFLICT` (no state change) |
| At most one active credential per `(company, env, type)` | Credential | Partial unique index `uq_active_credential` |
| An artifact is immutable; even failed attempts survive | Artifact | DB trigger `trg_zsa_immutable` blocks UPDATE/DELETE |
| A chained hash MUST reference a real artifact | Chain | `artifact_id NOT NULL` + FK `zdc_fk_artifact` → `zatca_signed_artifacts` |
| The chained hash equals the referenced artifact's hash | Chain | `append` verifies `artifact_hash` `FOR SHARE` ⇒ exception on mismatch |
| Only one writer touches the projection columns | Projection | Convention: `ProjectionWriter` is the sole writer |
| Chain success is durable before it is referenced | Coordinator | Ordering: `persist` strictly precedes `append` |

Aggregate Identity for both Chain and Artifact is **`(company_id, environment)`** — sandbox is an independent compliance chain (ADR-028, Option 2). *Corollary (new rule for ADR-028 §4): every unique constraint in this domain derives from an Aggregate Identity, never from incidental columns.*

---

## 3. Protocols

**readHead** *(Chain — sole reader)*
`readHead(company, env) → { currentIcv, currentPih, token }`. Self-contained: reads only `zatca_chain_state`. `token` is the `version`. Lazily seeds the chain at `icv=0, last_hash=SHA256("0")`.

**append** *(Chain — sole writer; a VERIFIER, not a Reader)*
`append(company, env, type, documentId, uuid, {artifactId, artifactHash}, token) → outcome`.
Receives an **ArtifactReference** (identity + link hash), never a free hash. It reads exactly one field of the artifact—`artifact_hash` `FOR SHARE`—and confirms `stored == supplied`; it never touches XML/QR/time/cert. Three **outcomes are RETURNED**: `SUCCESS` / `ALREADY_APPLIED` (re-entry wins over conflict) / `CONFLICT`. **Preconditions are THROWN** (scope, bad input, `ARTIFACT_NOT_FOUND`, `ARTIFACT_HASH_MISMATCH`)—never folded into an outcome.

**Artifact** *(persist before append — the durability boundary)*
`persist(NewSignedArtifact) → artifactId`; `fetch(artifactId) → StoredArtifact`. One document may have many artifacts (one per signing attempt); the chain commits to exactly one. QR is **not** stored—it is a deterministic derivative, embedded in `signed_xml` and projected to `invoices.qr_code`.

**Projection** *(written after success; non-transactional, idempotent)*
`write(InvoiceProjection)` updates the eight owned columns of one invoice by id. Chain success is the truth: a projection failure is **not** a chain failure—it is emitted as a `ProjectionFailed` event to an injected sink (recoverable, never lost), and the run still returns `SIGNED`. `ALREADY_APPLIED` does **not** re-project (the canonical projection belongs to the accepted artifact, not the re-entrant attempt).

**Coordinator** *(ordering only)*
`resolve → loop[ readHead → build(snapshot) → compose → persist → append → project ]`.
`signingTime` is regenerated per attempt (each attempt is a fresh signature ⇒ a fresh artifact). `CONFLICT` retries on a fresh head, bounded by `maxRetries` (operational policy, injected). Its concern ends at `append SUCCESS`.

---

## 4. Rejected Alternatives (and why)

| Rejected | Why |
|---|---|
| **Projection as the build source** (XmlBuilder reads `invoices.icv/pih`) — "Option A/D" | An authority must not change the question it answers, nor carry two truths. The chain snapshot is a build *input*, not read from the projection. |
| **A single `append` branch** over "snapshot-or-invoices" | Transitional/dual-source logic belongs at the composition layer, never inside an authority. Realized instead as **two entry points over one pure core** (`buildInvoiceXml` legacy, `buildInvoiceXmlWithChainSnapshot` new). |
| **`pih`/hash as the concurrency token** | Don't pass a derivative when you can pass the identity. The token is `version`. |
| **`append` reads the artifact store** ("assign-after-sign", Reader model) | That would couple the Chain to the Artifact's *shape*. `append` is a **Verifier**: it reads one field to confirm identity↔hash, nothing more. |
| **QR as part of artifact identity** | QR is a deterministic derivative of (XML, signingTime, cert, signature). Storing it as identity invites "the QR is part of the artifact" two years on. |
| **`invoice_hash` naming in the artifact/chain** | The table knows *artifacts*, not invoices (today UBL Invoice; tomorrow Credit/Debit/Compliance). Named `artifact_hash`. |
| **`credentialId` without `certificateFingerprint`** in the artifact | The artifact is a historical record; credentials may be recycled or the Vault replaced. The fingerprint preserves *what actually signed it*. |
| **`credentialType` decided inside the Coordinator** | "Invoices use CCSID/PCSID" is a Workflow fact, not a resolution or orchestration fact. Passed in by the caller. |
| **Hardcoded `maxRetries`** | Operational policy, not part of the model. Injected via `CoordinatorOptions`. |
| **Returning secrets / tokens from `CredentialResolver`** | Resolution data only; decryption and API-auth material are later (S5.3) concerns. |

---

## 5. Out of Scope (explicitly NOT in this freeze)

- **S5.3 Submission** — Fatoora network, Clearance/Reporting, `zatca_submission_log`. The Coordinator stops at local `append SUCCESS`.
- **Projection reconciler** — the consumer that reads the `ProjectionFailed` outbox and re-runs the projection. Only the *event emission* is frozen here.
- **Credit-note / debit-note projection** — Chain/Artifact/append are type-generic; only the Projection is type-specific. For now it targets `invoices` (tax_invoice). Other types: deferred.
- **Retry/backoff & admission control** — beyond the bounded `CONFLICT` loop, no rate limiting, queueing, or backoff policy is defined.
- **Credential lifecycle** — rotation, onboarding, expiry sweeping (Credential *administration*, not *resolution*).
- **Cutover cleanup** — dropping `zatca_icv_counter` / `next_zatca_icv` / `register_document_hash`, and removing the XmlBuilder legacy path, are follow-ups, not part of the freeze.

---

*Frozen artifacts proving this model: migrations `zatca_signed_artifacts`, `zatca_append_verifier`, `invoices_signed_artifact_id`; services `DocumentChainService`, `ArtifactStore`, `ProjectionWriter`, `InvoiceSigningCoordinator` — each verified against real PostgreSQL and/or gate tests.*
