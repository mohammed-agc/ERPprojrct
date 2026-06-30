/**
 * compareProjection — the SECOND pure stage of analyze().
 *
 * Given the EXPECTED projection (derived from truth) and the ACTUAL projection
 * (the current invoices row), it reports field-level DRIFTS, each attributed to
 * the truth source that owns it. This is exactly the manual diff we produced for
 * 966673e8 (signed_artifact_id: expected 16e0a219 / actual null / source Chain).
 *
 * It is pure structural comparison — no naming, no decision. classify() turns
 * these drifts into a classification.
 *
 * Field → source ownership:
 *   icv, pih, signed_artifact_id, xml_hash → Chain (structural truth)
 *   zatca_status                           → SubmissionLog (temporal truth)
 *
 * The zatca_status field is compared ONLY when expected.zatcaStatus is a real
 * value. A null expected status means "a truth we cannot project" (unsupported
 * submission disposition) — it is NOT a drift; classify() handles that signal
 * separately. Comparing null-vs-actual here would invent a meaningless drift.
 */

import type { ProjectionDrift } from './ProjectionReconciler';
import type { ExpectedProjection, ProjectionSnapshot } from './TruthSnapshot';

/** Each expected field, its actual counterpart, the column name, and its owner. */
interface FieldSpec {
  readonly field: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly source: ProjectionDrift['source'];
}

export function compareProjection(
  expected: ExpectedProjection,
  actual: ProjectionSnapshot
): ProjectionDrift[] {
  const specs: FieldSpec[] = [
    { field: 'icv', expected: expected.icv, actual: actual.icv, source: 'Chain' },
    { field: 'pih', expected: expected.pih, actual: actual.pih, source: 'Chain' },
    {
      field: 'signed_artifact_id',
      expected: expected.signedArtifactId,
      actual: actual.signedArtifactId,
      source: 'Chain',
    },
    {
      field: 'xml_hash',
      expected: expected.xmlHash,
      actual: actual.xmlHash,
      source: 'Chain',
    },
  ];

  // Temporal status: compared only when projectable (a real expected value).
  if (expected.zatcaStatus !== null) {
    specs.push({
      field: 'zatca_status',
      expected: expected.zatcaStatus,
      actual: actual.zatcaStatus,
      source: 'SubmissionLog',
    });
  }

  const drifts: ProjectionDrift[] = [];
  for (const s of specs) {
    if (!sameValue(s.expected, s.actual)) {
      drifts.push({
        field: s.field,
        expected: s.expected,
        actual: s.actual,
        source: s.source,
      });
    }
  }
  return drifts;
}

/** Strict-ish equality for projected scalar columns (string|number|null). */
function sameValue(a: unknown, b: unknown): boolean {
  // normalize undefined → null (a missing column reads as null)
  const na = a === undefined ? null : a;
  const nb = b === undefined ? null : b;
  return na === nb;
}
