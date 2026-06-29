import { describe, it, expect } from 'vitest';
import { SupabaseProjectionWriter } from '../SupabaseProjectionWriter';
import type { ProjectionDbClient } from '../SupabaseProjectionWriter';
import type { InvoiceProjection } from '../ProjectionWriter';

const PROJ: InvoiceProjection = {
  invoiceId: 'inv-1',
  icv: 7,
  pih: 'PIH_PREV',
  qrCode: 'QR_BASE64',
  xmlHash: 'HASH_ONE',
  zatcaStatus: 'signed',
  signedArtifactId: 'art-1',
  generatedAt: '2026-06-29T10:00:00Z',
};

function fakeDb(opts: {
  throws?: string;
  onUpdate?: (table: string, id: string, patch: Record<string, unknown>) => void;
}): ProjectionDbClient {
  return {
    async updateById(table, id, patch) {
      opts.onUpdate?.(table, id, patch);
      if (opts.throws) throw new Error(opts.throws);
    },
  };
}

describe('SupabaseProjectionWriter — gate', () => {
  it('declares its implementation name', () => {
    const w = new SupabaseProjectionWriter(fakeDb({}));
    expect(w.implementationName).toBe('SupabaseProjectionWriter');
  });

  it('writes the eight owned columns, addressed by invoiceId', async () => {
    let table = '';
    let id = '';
    let patch: Record<string, unknown> = {};
    const w = new SupabaseProjectionWriter(
      fakeDb({ onUpdate: (t, i, p) => { table = t; id = i; patch = p; } })
    );
    await w.write(PROJ);
    expect(table).toBe('invoices');
    expect(id).toBe('inv-1');
    expect(patch).toEqual({
      icv: 7,
      pih: 'PIH_PREV',
      qr_code: 'QR_BASE64',
      xml_hash: 'HASH_ONE',
      zatca_status: 'signed',
      xml_generated_at: '2026-06-29T10:00:00Z',
      qr_generated_at: '2026-06-29T10:00:00Z',
      signed_artifact_id: 'art-1',
    });
  });

  it('generatedAt fills BOTH timestamps', async () => {
    let patch: Record<string, unknown> = {};
    const w = new SupabaseProjectionWriter(
      fakeDb({ onUpdate: (_t, _i, p) => { patch = p; } })
    );
    await w.write(PROJ);
    expect(patch.xml_generated_at).toBe('2026-06-29T10:00:00Z');
    expect(patch.qr_generated_at).toBe('2026-06-29T10:00:00Z');
  });

  it('does NOT write the signed XML (bytes live only in the artifact store)', async () => {
    let patch: Record<string, unknown> = {};
    const w = new SupabaseProjectionWriter(
      fakeDb({ onUpdate: (_t, _i, p) => { patch = p; } })
    );
    await w.write(PROJ);
    expect(patch).not.toHaveProperty('signed_xml');
    expect(patch).not.toHaveProperty('xml');
  });

  it('write is idempotent — same input yields the same patch', async () => {
    const patches: Record<string, unknown>[] = [];
    const w = new SupabaseProjectionWriter(
      fakeDb({ onUpdate: (_t, _i, p) => { patches.push(p); } })
    );
    await w.write(PROJ);
    await w.write(PROJ);
    expect(patches[0]).toEqual(patches[1]);
  });

  it('an infra error PROPAGATES', async () => {
    const w = new SupabaseProjectionWriter(fakeDb({ throws: 'connection refused' }));
    await expect(w.write(PROJ)).rejects.toThrow(/connection refused/);
  });
});
