// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  SupabaseSubmissionProjectionWriter,
  deriveZatcaStatus,
} from '../SupabaseSubmissionProjectionWriter';
import type { SubmissionProjection } from '../SubmissionCoordinator';

type Resp = { error: { message: string } | null };

function fakeClient(resp: Resp, capture?: (patch: Record<string, unknown>) => void) {
  let updated = false;
  const client = {
    from() {
      const builder: Record<string, unknown> = {};
      builder.update = (patch: Record<string, unknown>) => {
        updated = true;
        capture?.(patch);
        return builder;
      };
      builder.eq = () => Promise.resolve(resp);
      return builder;
    },
    wasUpdated: () => updated,
  };
  return client as unknown as never & { wasUpdated: () => boolean };
}

const BASE: SubmissionProjection = {
  companyId: 'c1',
  documentType: 'invoice',
  documentId: 'doc-1',
  icv: 1,
  submissionLogId: 'log-1',
};

describe('deriveZatcaStatus', () => {
  it('ERROR validation → rejected (even if a clearance value is present)', () => {
    expect(
      deriveZatcaStatus({ ...BASE, validationStatus: 'ERROR', clearanceStatus: 'CLEARED' })
    ).toBe('rejected');
  });
  it('CLEARED → cleared', () => {
    expect(deriveZatcaStatus({ ...BASE, clearanceStatus: 'CLEARED' })).toBe('cleared');
  });
  it('REPORTED → reported', () => {
    expect(deriveZatcaStatus({ ...BASE, reportingStatus: 'REPORTED' })).toBe('reported');
  });
  it('unknown disposition → null', () => {
    expect(deriveZatcaStatus({ ...BASE, validationStatus: 'PASS' })).toBeNull();
  });
});

describe('SupabaseSubmissionProjectionWriter', () => {
  it('updates invoices.zatca_status = cleared for a CLEARED submission', async () => {
    let patch: Record<string, unknown> | undefined;
    const c = fakeClient({ error: null }, (p) => (patch = p));
    const w = new SupabaseSubmissionProjectionWriter(c);
    await w.project({ ...BASE, validationStatus: 'PASS', clearanceStatus: 'CLEARED' });
    expect(patch).toEqual({ zatca_status: 'cleared' });
  });

  it('updates to rejected on validation ERROR', async () => {
    let patch: Record<string, unknown> | undefined;
    const c = fakeClient({ error: null }, (p) => (patch = p));
    const w = new SupabaseSubmissionProjectionWriter(c);
    await w.project({ ...BASE, validationStatus: 'ERROR' });
    expect(patch).toEqual({ zatca_status: 'rejected' });
  });

  it('does NOT write when the disposition is unknown', async () => {
    const c = fakeClient({ error: null });
    const w = new SupabaseSubmissionProjectionWriter(c);
    await w.project({ ...BASE, validationStatus: 'PASS' });
    expect(c.wasUpdated()).toBe(false);
  });

  it('throws when the update fails', async () => {
    const c = fakeClient({ error: { message: 'rls denied' } });
    const w = new SupabaseSubmissionProjectionWriter(c);
    await expect(
      w.project({ ...BASE, clearanceStatus: 'CLEARED' })
    ).rejects.toThrow(/update failed: rls denied/);
  });
});
