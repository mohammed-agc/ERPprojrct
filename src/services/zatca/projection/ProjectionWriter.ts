/**
 * ProjectionWriter — the SOLE writer of the Invoice Projection.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * The Invoice Projection is write-ownership, not storage: it lives ON the
 * existing invoices ZATCA columns. invoices stays the app's natural read surface;
 * this authority is the ONLY writer of these eight fields, so the projection is
 * an Aggregate by single-writer, not by table.
 *
 * Columns owned (and nothing else):
 *   icv, pih, qr_code, xml_hash, zatca_status, xml_generated_at,
 *   qr_generated_at, signed_artifact_id.
 *
 * It REFERENCES the artifact (signed_artifact_id) — it never duplicates the
 * signed XML (those bytes live only in the Artifact Store).
 *
 * Lifecycle: written AFTER chain success. The write is NON-transactional with
 * append and re-runnable — chain success is the truth, a projection failure is
 * not a chain failure. write() is therefore idempotent (an UPDATE to fixed
 * values), so the Coordinator may retry it freely.
 */

/** Projection status after local production. S5.3 advances to reported/cleared. */
export type ZatcaProjectionStatus = 'signed' | 'reported' | 'cleared';

/** The projection to write for one invoice (all eight owned fields). */
export interface InvoiceProjection {
  readonly invoiceId: string;
  readonly icv: number;
  readonly pih: string;
  readonly qrCode: string;
  readonly xmlHash: string;
  readonly zatcaStatus: ZatcaProjectionStatus;
  /** Reference to the current signed artifact (its bytes live in the store). */
  readonly signedArtifactId: string;
  /** ISO time the signed XML/QR were produced → xml_generated_at + qr_generated_at. */
  readonly generatedAt: string;
}

/**
 * ProjectionWriter interface.
 *
 * MUST:
 * 1. Write ONLY the eight owned columns of one invoice, addressed by invoiceId.
 * 2. Be idempotent (re-running writes the same values).
 * 3. PROPAGATE infra failures as exceptions.
 */
export interface ProjectionWriter {
  /** Human-readable implementation name for diagnostics. */
  readonly implementationName: string;

  /** Write the projection for one invoice. @throws on infra failure. */
  write(projection: InvoiceProjection): Promise<void>;
}

/** Factory function signature for dependency injection (per AD-012 v2). */
export type ProjectionWriterFactory = () => ProjectionWriter;
