// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { SupabaseSignedDocumentReader } from '../SupabaseSignedDocumentReader';

type Resp = { data: unknown; error: { message: string } | null };

/** Minimal fake of the Supabase fluent client — one canned Resp per table. */
function fakeClient(byTable: Record<string, Resp>) {
  return {
    from(table: string) {
      const resp = byTable[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.maybeSingle = () => Promise.resolve(resp);
      return builder;
    },
  } as never;
}

const CHAIN_OK: Resp = {
  data: {
    uuid: 'c0d3bd79-5774-4472-be4d-32107cb0e2ca',
    icv: 1,
    artifact_id: '16e0a219-38bd-49a3-a2b1-526bcfdbbd64',
    artifact_hash: 'ZzdvZxSr+zNUlb1wILXmR8FrgKuI4ZB+bXuX8YvuTwQ=',
  },
  error: null,
};

describe('SupabaseSignedDocumentReader', () => {
  it('joins chain + artifact into a SignedDocument', async () => {
    const reader = new SupabaseSignedDocumentReader(
      fakeClient({
        zatca_document_chain: CHAIN_OK,
        zatca_signed_artifacts: { data: { signed_xml: '<Invoice/>' }, error: null },
      })
    );
    const doc = await reader.read('sandbox', 'invoice', 'doc-1');
    expect(doc).toEqual({
      uuid: 'c0d3bd79-5774-4472-be4d-32107cb0e2ca',
      icv: 1,
      artifactHash: 'ZzdvZxSr+zNUlb1wILXmR8FrgKuI4ZB+bXuX8YvuTwQ=',
      signedXml: '<Invoice/>',
    });
  });

  it('throws when the document is not chained', async () => {
    const reader = new SupabaseSignedDocumentReader(
      fakeClient({ zatca_document_chain: { data: null, error: null } })
    );
    await expect(reader.read('sandbox', 'invoice', 'missing')).rejects.toThrow(
      /not chained/
    );
  });

  it('throws when the chain references a missing artifact', async () => {
    const reader = new SupabaseSignedDocumentReader(
      fakeClient({
        zatca_document_chain: CHAIN_OK,
        zatca_signed_artifacts: { data: null, error: null },
      })
    );
    await expect(reader.read('sandbox', 'invoice', 'doc-1')).rejects.toThrow(
      /missing artifact/
    );
  });

  it('throws when the artifact has empty signed_xml', async () => {
    const reader = new SupabaseSignedDocumentReader(
      fakeClient({
        zatca_document_chain: CHAIN_OK,
        zatca_signed_artifacts: { data: { signed_xml: '' }, error: null },
      })
    );
    await expect(reader.read('sandbox', 'invoice', 'doc-1')).rejects.toThrow(
      /empty signed_xml/
    );
  });

  it('propagates a chain read error', async () => {
    const reader = new SupabaseSignedDocumentReader(
      fakeClient({
        zatca_document_chain: { data: null, error: { message: 'db down' } },
      })
    );
    await expect(reader.read('sandbox', 'invoice', 'doc-1')).rejects.toThrow(
      /chain read failed: db down/
    );
  });
});
