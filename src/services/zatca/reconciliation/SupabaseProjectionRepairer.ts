/**
 * SupabaseProjectionRepairer — APPLIES a reconciliation report. It never
 * re-derives truth; it writes exactly what analyze() already decided:
 *
 *   - drifts        → a single UPDATE invoices SET <field> = <expected> ... by id
 *   - orphanedOutboxIds → resolved_at = now() on those outbox rows
 *
 * Defense in depth: only an allow-listed set of read-model columns may be
 * written, so a malformed report can never push an unexpected column. It writes
 * ONLY projection columns; it never touches a truth source (chain / artifact /
 * submission_log are read-only to the reconciler).
 */

import type {
  ReconciliationReport,
  RepairOutcome,
} from './ProjectionReconciler';
import { supabase } from '@/integrations/supabase/client';

type SupabaseLike = typeof supabase;

/** Projection columns the repairer is permitted to write. */
const REPAIRABLE_COLUMNS = new Set([
  'icv',
  'pih',
  'signed_artifact_id',
  'xml_hash',
  'zatca_status',
]);

export interface ProjectionRepairer {
  apply(report: ReconciliationReport): Promise<RepairOutcome>;
}

export class SupabaseProjectionRepairer implements ProjectionRepairer {
  constructor(private readonly client: SupabaseLike) {}

  async apply(report: ReconciliationReport): Promise<RepairOutcome> {
    // Only CAN_REPAIR reports are actionable. Everything else is a no-op — the
    // decision was already made by analyze(); repair() does not reinterpret.
    if (report.decision !== 'CAN_REPAIR') {
      return {
        documentRef: report.documentRef,
        applied: false,
        fieldsRepaired: [],
        outboxResolved: [],
        decision: report.decision,
      };
    }

    // 1) Build the patch verbatim from the report's drifts.
    const patch: Record<string, unknown> = {};
    for (const d of report.drifts) {
      if (!REPAIRABLE_COLUMNS.has(d.field)) {
        throw new Error(
          `ProjectionRepairer: refusing to write non-repairable column "${d.field}"`
        );
      }
      patch[d.field] = d.expected;
    }

    const fieldsRepaired = Object.keys(patch);

    if (fieldsRepaired.length > 0) {
      const { error } = await this.client
        .from('invoices')
        .update(patch as never)
        .eq('id', report.documentRef.documentId);
      if (error) {
        throw new Error(`ProjectionRepairer: invoices update failed: ${error.message}`);
      }
    }

    // 2) Resolve the orphaned outbox rows the report carried.
    const outboxResolved: string[] = [];
    if (report.orphanedOutboxIds.length > 0) {
      const { error } = await this.client
        .from('zatca_projection_outbox')
        .update({ resolved_at: new Date().toISOString() } as never)
        .in('id', report.orphanedOutboxIds as string[])
        .is('resolved_at', null);
      if (error) {
        throw new Error(`ProjectionRepairer: outbox resolve failed: ${error.message}`);
      }
      outboxResolved.push(...report.orphanedOutboxIds);
    }

    return {
      documentRef: report.documentRef,
      applied: true,
      fieldsRepaired,
      outboxResolved,
      decision: report.decision,
    };
  }
}

export function createProjectionRepairer(
  client: SupabaseLike = supabase
): ProjectionRepairer {
  return new SupabaseProjectionRepairer(client);
}
