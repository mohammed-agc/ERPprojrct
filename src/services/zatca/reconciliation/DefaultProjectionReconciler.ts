/**
 * DefaultProjectionReconciler — wires the pure core to the two side-effecting
 * authorities, keeping ANALYZE and REPAIR strictly separate.
 *
 *   analyze(ref):
 *     reader.read → deriveExpectedProjection → compareProjection → classify
 *     → ReconciliationReport.   READ-ONLY: no writes, ever.
 *
 *   repair(report):
 *     repairer.apply(report).   APPLIES the report verbatim; never re-derives.
 *
 * The report is the artifact that travels between the two — repair() trusts what
 * analyze() decided, closing the TOCTOU gap (truth cannot silently change
 * between analysis and repair without a new analyze()).
 */

import type {
  ProjectionReconciler,
  DocumentRef,
  ReconciliationReport,
  RepairOutcome,
} from './ProjectionReconciler';
import { classify } from './classify';
import {
  deriveExpectedProjection,
  type ExpectedProjection,
} from './TruthSnapshot';
import { compareProjection } from './compareProjection';
import {
  createTruthSnapshotReader,
  type TruthSnapshotReader,
} from './SupabaseTruthSnapshotReader';
import {
  createProjectionRepairer,
  type ProjectionRepairer,
} from './SupabaseProjectionRepairer';
import { supabase } from '@/integrations/supabase/client';

type SupabaseLike = typeof supabase;

export class DefaultProjectionReconciler implements ProjectionReconciler {
  readonly implementationName = 'DefaultProjectionReconciler';

  constructor(
    private readonly reader: TruthSnapshotReader,
    private readonly repairer: ProjectionRepairer
  ) {}

  async analyze(ref: DocumentRef): Promise<ReconciliationReport> {
    const snapshot = await this.reader.read(ref);
    const expected: ExpectedProjection | null =
      deriveExpectedProjection(snapshot);

    // No structural truth → classify decides NOT_SIGNED (no comparison needed).
    const drifts = expected
      ? compareProjection(expected, snapshot.projection)
      : [];

    return classify(ref, snapshot, expected, drifts);
  }

  async repair(report: ReconciliationReport): Promise<RepairOutcome> {
    return this.repairer.apply(report);
  }
}

/** Composition root — defaults to the singleton; server-side runs inject a client. */
export function createProjectionReconciler(
  dbClient?: SupabaseLike
): ProjectionReconciler {
  const client = dbClient ?? supabase;
  return new DefaultProjectionReconciler(
    createTruthSnapshotReader(client),
    createProjectionRepairer(client)
  );
}
