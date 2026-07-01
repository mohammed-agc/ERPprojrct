# ADR-029: The Node Runtime is the Official Execution Platform

**Status:** Accepted
**Date:** 2026-07-01
**Context:** Sprint A — ZATCA Phase 2, transition from Application Layer to Hosting Layer (Item 4 groundwork)

---

## Context

The product is sold as a **single-tenant deployment**: each customer runs the
ERP on their own server (on-premise or a VPS such as DigitalOcean, Hostinger,
etc.). Every customer is onboarded to ZATCA through the settings screen — they
enter their company data, generate an OTP on the Fatoora portal, and the system
completes the cryptographic onboarding automatically.

Through Items 1–3 (Reconciler, Routing, Health Check) we built a substantial set
of **authorities** — SigningCoordinator, SubmissionCoordinator, ArtifactStore,
CredentialResolver, ProjectionWriter, ProjectionReconciler, ProjectionDiagnostics,
ZatcaHealthReport, and the file-system Vault. These were written pure and
injectable, and proven with **live** end-to-end tests (a real invoice CLEARED in
the ZATCA sandbox; a live health report; a live reconciliation baseline).

However, these authorities are proven at the **Application/Domain Layer** only.
They are invoked today from the test runner (vitest) with an injected Supabase
client. There is no **Hosting Layer** — no long-lived process that owns the file
system, Node crypto, and the vault, and exposes the authorities to the React UI.

This is not a sign that prior work was temporary. The Domain/Application Layer is
largely complete. What is missing is only the Hosting Layer.

## Decision

**A permanent Node Runtime runs on each customer's server. It is the official
execution platform for every authority that requires a file system, cryptography,
or a long-lived process.**

```
ERP Runtime  (per customer server — single-tenant)
    ├── React UI        the browser interface
    ├── Node Runtime    home of ALL file-system / crypto / long-lived authorities:
    │                     Vault, CSR Generator, SigningCoordinator,
    │                     SubmissionCoordinator, ProjectionReconciler,
    │                     ProjectionDiagnostics, ZatcaHealthReport, Scheduler
    └── Supabase        Database + Auth + RLS + Realtime (managed services)
```

### Rules that follow

1. The Node Runtime is an **Application Runtime**, not merely an HTTP proxy. It is
   the official home of any authority needing OS-level capabilities.
2. **Private-key generation and vault management NEVER happen** in the browser or
   in Edge Functions. Those are operating-system responsibilities.
3. Each customer's private key lives in their server's vault and **never leaves
   it** — matching ZATCA's security requirement.
4. Supabase remains the database and managed-services layer only. It **never**
   stores a private key.
5. Edge Functions are not used for CSR generation, PEM/key handling, certificate
   stores, or the vault — these are OS responsibilities, not edge responsibilities.

### What this is NOT

This decision does **not** authorize building a large infrastructure project now
(multi-user auth, background job frameworks, monitoring, reverse-proxy
orchestration, Docker orchestration). The Runtime is built **thin**: a
Composition Root that wires the *existing* authorities behind HTTP, nothing more.
Additional runtime concerns are added only when a concrete need proves them.

## Consequences

**Positive**
- A decided architecture is not deferred; hybrid/temporary key-management hacks
  are prevented before they appear.
- No authority is rewritten — the Runtime only hosts what live tests already proved.
- Onboarding a first real customer becomes near-direct: deploy the Runtime, point
  the UI at it, run the ZATCA onboarding.
- The Runtime becomes the natural future home of other long-lived concerns
  (scheduled jobs, integrations, backups) instead of scattering them across Edge
  Functions and scripts — added incrementally, never speculatively.

**Costs / risks**
- A new process to deploy and operate per customer (mitigated by keeping it thin).
- Live verification of production onboarding (PCSID) still requires a real Fatoora
  account + OTP, which arrives with the first real customer; the Runtime and Item 4
  code are built and unit-proven now, live-verified at first onboarding.

## Relation to prior ADRs

Consistent with the constitution: *Service Layer Owns Crypto/Secrets*, *DB Owns
Business Rules*, *Product-First / Installable By Any Customer*. Extends ADR-028's
maxim — *every authority executes a decision, never makes one* — to the hosting
tier: the Runtime hosts and routes; it does not add domain logic.
