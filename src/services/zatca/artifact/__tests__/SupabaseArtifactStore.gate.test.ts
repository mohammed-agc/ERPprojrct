import { describe, it, expect } from 'vitest';
import { SupabaseArtifactStore } from '../SupabaseArtifactStore';
import type { ArtifactDbClient } from '../SupabaseArtifactStore';
import type { NewSignedArtifact } from '../ArtifactStore';

const NEW: NewSignedArtifact = {
  companyId: 'company-1',
  environment: 'sandbox',
  documentType: 'invoice',
  documentId: 'doc-1',
  artifactHash: 'HASH_ONE',
  signedXml: '<Invoice>signed</Invoice>',
  signingTime: '2026-06-29T10:00:00Z',
  credentialId: 'cred-1',
  certificateFingerprint: 'FP_ABC',
};

/** Fake DB seam capturing the inserted row and serving a canned select. */
function fakeDb(opts: {
  insertId?: string;
  insertThrows?: string;
  selectRow?: Record<string, unknown> | null;
  selectThrows?: string;
  onInsert?: (table: string, row: Record<string, unknown>) => void;
}): ArtifactDbClient {
  return {
    async insertReturningId(table, row) {
      opts.onInsert?.(table, row);
      if (opts.insertThrows) throw new Error(opts.insertThrows);
      return opts.insertId ?? 'art-generated';
    },
    async selectById(_table, _id) {
      if (opts.selectThrows) throw new Error(opts.selectThrows);
      return opts.selectRow ?? null;
    },
  };
}

describe('SupabaseArtifactStore — gate', () => {
  it('declares its implementation name', () => {
    const s = new SupabaseArtifactStore(fakeDb({}));
    expect(s.implementationName).toBe('SupabaseArtifactStore');
  });

  it('persist maps the domain type to the snake_case row and returns the id', async () => {
    let table = '';
    let row: Record<string, unknown> = {};
    const s = new SupabaseArtifactStore(
      fakeDb({ insertId: 'art-xyz', onInsert: (t, r) => { table = t; row = r; } })
    );
    const id = await s.persist(NEW);
    expect(id).toBe('art-xyz');
    expect(table).toBe('zatca_signed_artifacts');
    expect(row).toEqual({
      company_id: 'company-1',
      environment: 'sandbox',
      document_type: 'invoice',
      document_id: 'doc-1',
      artifact_hash: 'HASH_ONE',
      signed_xml: '<Invoice>signed</Invoice>',
      signing_time: '2026-06-29T10:00:00Z',
      credential_id: 'cred-1',
      certificate_fingerprint: 'FP_ABC',
    });
    // QR is NOT part of the artifact identity → never written here.
    expect(row).not.toHaveProperty('qr_base64');
    expect(row).not.toHaveProperty('qr_code');
  });

  it('fetch maps a row back to the StoredArtifact (camelCase)', async () => {
    const s = new SupabaseArtifactStore(
      fakeDb({
        selectRow: {
          id: 'art-xyz',
          company_id: 'company-1',
          environment: 'sandbox',
          document_type: 'invoice',
          document_id: 'doc-1',
          artifact_hash: 'HASH_ONE',
          signed_xml: '<Invoice>signed</Invoice>',
          signing_time: '2026-06-29T10:00:00Z',
          credential_id: 'cred-1',
          certificate_fingerprint: 'FP_ABC',
          created_at: '2026-06-29T10:00:01Z',
        },
      })
    );
    const got = await s.fetch('art-xyz');
    expect(got).toEqual({
      id: 'art-xyz',
      companyId: 'company-1',
      environment: 'sandbox',
      documentType: 'invoice',
      documentId: 'doc-1',
      artifactHash: 'HASH_ONE',
      signedXml: '<Invoice>signed</Invoice>',
      signingTime: '2026-06-29T10:00:00Z',
      credentialId: 'cred-1',
      certificateFingerprint: 'FP_ABC',
      createdAt: '2026-06-29T10:00:01Z',
    });
  });

  it('fetch throws when the artifact is absent (precondition)', async () => {
    const s = new SupabaseArtifactStore(fakeDb({ selectRow: null }));
    await expect(s.fetch('missing')).rejects.toThrow(/not found/);
  });

  it('an infra error on persist PROPAGATES', async () => {
    const s = new SupabaseArtifactStore(fakeDb({ insertThrows: 'connection refused' }));
    await expect(s.persist(NEW)).rejects.toThrow(/connection refused/);
  });

  it('an infra error on fetch PROPAGATES', async () => {
    const s = new SupabaseArtifactStore(fakeDb({ selectThrows: 'connection refused' }));
    await expect(s.fetch('art-xyz')).rejects.toThrow(/connection refused/);
  });
});
