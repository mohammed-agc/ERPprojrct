/**
 * SupabaseSignedDocumentReader — reads the COMMITTED signed document by identity,
 * for submission. The chain owns identity (uuid, icv) + the artifact reference;
 * the artifact owns the bytes (signed_xml). This reader joins the two:
 *
 *   zatca_document_chain (uuid, icv, artifact_id, artifact_hash)
 *      ⋈ zatca_signed_artifacts (signed_xml)
 *
 * It is a READER, not the chain authority — it never writes, never re-derives
 * chain invariants. Absence is a PROGRAMMING ERROR (you cannot submit what was
 * never signed) → it throws, never returns an empty document.
 */

import type {
  SignedDocument,
  SignedDocumentReader,
} from './SubmissionCoordinator';
import type { ZatcaEnvironment } from '../credential/CredentialResolver';
import type { ArtifactDocumentType } from '../artifact/ArtifactStore';
import { supabase } from '@/integrations/supabase/client';

type SupabaseLike = typeof supabase;

export class SupabaseSignedDocumentReader implements SignedDocumentReader {
  constructor(private readonly client: SupabaseLike) {}

  async read(
    environment: ZatcaEnvironment,
    documentType: ArtifactDocumentType,
    documentId: string
  ): Promise<SignedDocument> {
    // 1) Chain entry — identity + the artifact reference.
    const chain = await this.client
      .from('zatca_document_chain')
      .select('uuid, icv, artifact_id, artifact_hash')
      .eq('environment', environment)
      .eq('document_type', documentType)
      .eq('document_id', documentId)
      .maybeSingle();

    if (chain.error) {
      throw new Error(
        `SignedDocumentReader: chain read failed: ${chain.error.message}`
      );
    }
    if (!chain.data) {
      throw new Error(
        `SignedDocumentReader: document not chained — ${documentType}/${documentId} (${environment})`
      );
    }

    const row = chain.data as {
      uuid: string;
      icv: number;
      artifact_id: string;
      artifact_hash: string;
    };

    // 2) Artifact — the signed bytes (the chain verified its hash at append).
    const art = await this.client
      .from('zatca_signed_artifacts')
      .select('signed_xml')
      .eq('id', row.artifact_id)
      .maybeSingle();

    if (art.error) {
      throw new Error(
        `SignedDocumentReader: artifact read failed: ${art.error.message}`
      );
    }
    if (!art.data) {
      throw new Error(
        `SignedDocumentReader: chain references a missing artifact ${row.artifact_id}`
      );
    }

    const signedXml = (art.data as { signed_xml: string }).signed_xml;
    if (typeof signedXml !== 'string' || signedXml.length === 0) {
      throw new Error(
        `SignedDocumentReader: artifact ${row.artifact_id} has empty signed_xml`
      );
    }

    return {
      uuid: row.uuid,
      icv: row.icv,
      artifactHash: row.artifact_hash,
      signedXml,
    };
  }
}

/** Factory — defaults to the app singleton; server-side runs inject a client. */
export function createSignedDocumentReader(
  client: SupabaseLike = supabase
): SignedDocumentReader {
  return new SupabaseSignedDocumentReader(client);
}
