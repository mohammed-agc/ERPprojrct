import { describe, it, expect } from 'vitest';
import { SupabaseProjectionFailureSink } from '../SupabaseProjectionFailureSink';
import type { OutboxDbClient } from '../SupabaseProjectionFailureSink';
import type { ProjectionFailedEvent } from '../../coordinator/InvoiceSigningCoordinator';

const EVENT: ProjectionFailedEvent = {
  kind: 'ProjectionFailed',
  companyId: 'company-1',
  environment: 'sandbox',
  documentType: 'invoice',
  documentId: 'inv-1',
  icv: 5,
  artifactId: 'art-1',
  error: 'db down',
  occurredAt: '2026-06-29T10:00:00Z',
};

function fakeDb(opts: {
  throws?: string;
  onInsert?: (table: string, row: Record<string, unknown>) => void;
}): OutboxDbClient {
  return {
    async insert(table, row) {
      opts.onInsert?.(table, row);
      if (opts.throws) throw new Error(opts.throws);
    },
  };
}

describe('SupabaseProjectionFailureSink — gate', () => {
  it('records the MINIMAL row keyed on artifact_id', async () => {
    let table = '';
    let row: Record<string, unknown> = {};
    const sink = new SupabaseProjectionFailureSink(
      fakeDb({ onInsert: (t, r) => { table = t; row = r; } })
    );
    await sink.record(EVENT);
    expect(table).toBe('zatca_projection_outbox');
    expect(row).toEqual({
      artifact_id: 'art-1',
      error_code: 'PROJECTION_WRITE_FAILED',
      error_message: 'db down',
      attempt_count: 1,
      occurred_at: '2026-06-29T10:00:00Z',
    });
  });

  it('does NOT store derivable fields (reachable from the artifact)', async () => {
    let row: Record<string, unknown> = {};
    const sink = new SupabaseProjectionFailureSink(
      fakeDb({ onInsert: (_t, r) => { row = r; } })
    );
    await sink.record(EVENT);
    expect(row).not.toHaveProperty('icv');
    expect(row).not.toHaveProperty('company_id');
    expect(row).not.toHaveProperty('environment');
    expect(row).not.toHaveProperty('document_id');
    expect(row).not.toHaveProperty('document_type');
  });

  it('an infra error PROPAGATES', async () => {
    const sink = new SupabaseProjectionFailureSink(fakeDb({ throws: 'connection refused' }));
    await expect(sink.record(EVENT)).rejects.toThrow(/connection refused/);
  });
});
