/**
 * DefaultProjectionDiagnostics — analyzeScope is a LOOP over analyzeOne plus a
 * tally. It holds NO classification logic; every judgment comes from the
 * Reconciler via analyzeOne. SupabaseScopeEnumerator is the only piece that
 * knows how a scope maps to rows (chain by company + environment).
 */

import type {
  ProjectionDiagnostics,
  ScopeDiagnostics,
  ScopeEnumerator,
  BatchScope,
  ClassificationTally,
} from './ProjectionDiagnostics';
import { emptyTally } from './ProjectionDiagnostics';
import type {
  ProjectionReconciler,
  DocumentRef,
  ReconciliationReport,
} from './ProjectionReconciler';
import type { ArtifactDocumentType } from '../artifact/ArtifactStore';
import { createProjectionReconciler } from './DefaultProjectionReconciler';
import { supabase } from '@/integrations/supabase/client';

type SupabaseLike = typeof supabase;

/** Enumerates document identities for a scope, from the chain (source of truth). */
export class SupabaseScopeEnumerator implements ScopeEnumerator {
  constructor(private readonly client: SupabaseLike) {}

  async enumerate(scope: BatchScope): Promise<DocumentRef[]> {
    if (scope.kind !== 'company-environment') {
      throw new Error(
        `ScopeEnumerator: unsupported scope kind "${(scope as { kind: string }).kind}"`
      );
    }
    const { data, error } = await this.client
      .from('zatca_document_chain')
      .select('document_id, document_type')
      .eq('company_id', scope.companyId)
      .eq('environment', scope.environment)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`ScopeEnumerator: chain read failed: ${error.message}`);

    return (data ?? []).map((r) => ({
      documentId: r.document_id as string,
      environment: scope.environment,
      documentType: r.document_type as ArtifactDocumentType,
    }));
  }
}

export class DefaultProjectionDiagnostics implements ProjectionDiagnostics {
  readonly implementationName = 'DefaultProjectionDiagnostics';

  constructor(
    private readonly reconciler: ProjectionReconciler,
    private readonly enumerator: ScopeEnumerator
  ) {}

  analyzeOne(identity: DocumentRef): Promise<ReconciliationReport> {
    // The single source of truth — no logic added here.
    return this.reconciler.analyze(identity);
  }

  async analyzeScope(scope: BatchScope): Promise<ScopeDiagnostics> {
    const identities = await this.enumerator.enumerate(scope);

    const reports: ReconciliationReport[] = [];
    const tally: ClassificationTally = emptyTally();
    const escalations: ReconciliationReport[] = [];
    let repairable = 0;

    for (const id of identities) {
      const report = await this.analyzeOne(id); // REPEAT the single analysis
      reports.push(report);
      tally[report.classification] += 1;
      if (report.decision === 'ESCALATE') escalations.push(report);
      if (report.decision === 'CAN_REPAIR') repairable += 1;
    }

    return {
      scope,
      total: reports.length,
      tally,
      escalations,
      repairable,
      reports,
    };
  }
}

/** Composition root — defaults to the singleton; server-side runs inject a client. */
export function createProjectionDiagnostics(
  dbClient?: SupabaseLike
): ProjectionDiagnostics {
  const client = dbClient ?? supabase;
  return new DefaultProjectionDiagnostics(
    createProjectionReconciler(client),
    new SupabaseScopeEnumerator(client)
  );
}
