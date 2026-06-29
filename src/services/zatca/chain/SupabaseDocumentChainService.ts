/**
 * SupabaseDocumentChainService — DocumentChainService over the atomic DB
 * authorities public.zatca_read_head and public.zatca_append (via RPC).
 *
 * This layer is deliberately thin: it marshals arguments, parses the jsonb
 * result, and maps it to the typed contract. It adds NO chain logic — every
 * invariant (ICV, PIH, idempotency, token compare, conflict) is enforced in the
 * DB functions under a single lock.
 *
 * The RPC client is injected (per AD-012 v2) so parsing/mapping is testable
 * without a live database; the factory defaults it to the application singleton.
 *
 * Architectural references & contract: see DocumentChainService.ts and
 * docs/adr/ADR-Chain-Concurrency-Model.md (ADR-028).
 */

import { supabase } from '@/integrations/supabase/client';
import {
  type AppendOutcome,
  type AppendRequest,
  type ChainHead,
  type DocumentChainService,
  type ZatcaEnvironment,
} from './DocumentChainService';

/** Minimal slice of the Supabase client this service depends on. */
export interface ChainRpcClient {
  rpc(
    fn: string,
    params: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export class SupabaseDocumentChainService implements DocumentChainService {
  public readonly implementationName = 'SupabaseDocumentChainService';

  constructor(private readonly client: ChainRpcClient) {}

  async readHead(
    companyId: string,
    environment: ZatcaEnvironment
  ): Promise<ChainHead> {
    const { data, error } = await this.client.rpc('zatca_read_head', {
      p_company: companyId,
      p_environment: environment,
    });

    // Infra / precondition failure is NOT an outcome — propagate.
    if (error) {
      throw new Error(`DocumentChainService.readHead failed: ${error.message}`);
    }
    const d = data as {
      currentIcv?: number;
      currentPih?: string;
      token?: number;
    } | null;
    if (
      !d ||
      typeof d.currentIcv !== 'number' ||
      typeof d.currentPih !== 'string' ||
      typeof d.token !== 'number'
    ) {
      throw new Error('DocumentChainService.readHead: malformed head payload');
    }
    return { currentIcv: d.currentIcv, currentPih: d.currentPih, token: d.token };
  }

  async append(request: AppendRequest): Promise<AppendOutcome> {
    const { data, error } = await this.client.rpc('zatca_append', {
      p_company: request.companyId,
      p_environment: request.environment,
      p_document_type: request.documentType,
      p_document_id: request.documentId,
      p_uuid: request.uuid,
      p_artifact_id: request.artifactRef.artifactId,
      p_artifact_hash: request.artifactRef.artifactHash,
      p_token: request.token,
    });

    // Infra / precondition failure (e.g. ARTIFACT_HASH_MISMATCH,
    // COMPANY_SCOPE_VIOLATION) is NOT an outcome — propagate.
    if (error) {
      throw new Error(`DocumentChainService.append failed: ${error.message}`);
    }

    const d = data as Record<string, unknown> | null;
    switch (d?.outcome) {
      case 'SUCCESS':
        return {
          outcome: 'SUCCESS',
          icv: d.icv as number,
          pih: d.pih as string,
          artifactHash: d.artifactHash as string,
        };
      case 'ALREADY_APPLIED':
        return {
          outcome: 'ALREADY_APPLIED',
          icv: d.icv as number,
          pih: d.pih as string,
          artifactHash: d.artifactHash as string,
          uuid: d.uuid as string,
        };
      case 'CONFLICT':
        return {
          outcome: 'CONFLICT',
          expectedToken: d.expectedToken as number,
          currentToken: d.currentToken as number,
        };
      default:
        // An unrecognized outcome is not one of the three — propagate.
        throw new Error(
          `DocumentChainService.append: unexpected outcome '${String(
            d?.outcome
          )}'`
        );
    }
  }
}

/**
 * Factory (per AD-012 v2). Defaults to the application Supabase singleton;
 * tests inject a fake ChainRpcClient.
 */
export function createSupabaseDocumentChainService(
  client: ChainRpcClient = supabase as unknown as ChainRpcClient
): DocumentChainService {
  return new SupabaseDocumentChainService(client);
}
