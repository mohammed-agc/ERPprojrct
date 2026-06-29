/**
 * Gate test for SupabaseDocumentChainService — the TS face over the proven
 * zatca_read_head / zatca_append DB authorities.
 *
 * Proven here (marshalling + parsing + outcome mapping; the chain LOGIC itself
 * is proven at the DB layer against real Postgres):
 *   - readHead parses { currentIcv, currentPih, token }
 *   - append maps SUCCESS / ALREADY_APPLIED / CONFLICT (RETURNED, not thrown)
 *   - request fields map to the correct rpc params
 *   - an rpc error PROPAGATES (never folded into an outcome)
 *   - a malformed / unexpected payload PROPAGATES
 */

import { describe, it, expect } from 'vitest';
import {
  SupabaseDocumentChainService,
  type ChainRpcClient,
} from '../SupabaseDocumentChainService';
import type { AppendRequest } from '../DocumentChainService';

/** A fake rpc client returning a fixed { data, error }, capturing the call. */
function fakeClient(
  result: { data: unknown; error: { message: string } | null },
  capture?: (fn: string, params: Record<string, unknown>) => void
): ChainRpcClient {
  return {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      capture?.(fn, params);
      return result;
    },
  };
}

const REQ: AppendRequest = {
  companyId: 'company-1',
  environment: 'sandbox',
  documentType: 'invoice',
  documentId: 'doc-1',
  uuid: 'uuid-1',
  invoiceHash: 'HASH_ONE',
  token: 0,
};

describe('SupabaseDocumentChainService — gate', () => {
  it('declares its implementation name', () => {
    const s = new SupabaseDocumentChainService(
      fakeClient({ data: null, error: null })
    );
    expect(s.implementationName).toBe('SupabaseDocumentChainService');
  });

  it('readHead parses the head snapshot and passes the right params', async () => {
    let calledFn = '';
    let calledParams: Record<string, unknown> = {};
    const s = new SupabaseDocumentChainService(
      fakeClient(
        { data: { currentIcv: 2, currentPih: 'HASH_TWO', token: 2 }, error: null },
        (fn, p) => {
          calledFn = fn;
          calledParams = p;
        }
      )
    );
    const head = await s.readHead('company-1', 'sandbox');
    expect(head).toEqual({ currentIcv: 2, currentPih: 'HASH_TWO', token: 2 });
    expect(calledFn).toBe('zatca_read_head');
    expect(calledParams).toEqual({ p_company: 'company-1', p_environment: 'sandbox' });
  });

  it('append → SUCCESS maps fields and passes the right rpc params', async () => {
    let calledParams: Record<string, unknown> = {};
    const s = new SupabaseDocumentChainService(
      fakeClient(
        {
          data: { outcome: 'SUCCESS', icv: 1, pih: 'SEED', invoiceHash: 'HASH_ONE' },
          error: null,
        },
        (_fn, p) => {
          calledParams = p;
        }
      )
    );
    const res = await s.append(REQ);
    expect(res).toEqual({ outcome: 'SUCCESS', icv: 1, pih: 'SEED', invoiceHash: 'HASH_ONE' });
    expect(calledParams).toEqual({
      p_company: 'company-1',
      p_environment: 'sandbox',
      p_document_type: 'invoice',
      p_document_id: 'doc-1',
      p_uuid: 'uuid-1',
      p_invoice_hash: 'HASH_ONE',
      p_token: 0,
    });
  });

  it('append → ALREADY_APPLIED (re-entry) is RETURNED, not thrown', async () => {
    const s = new SupabaseDocumentChainService(
      fakeClient({
        data: {
          outcome: 'ALREADY_APPLIED',
          icv: 1,
          pih: 'SEED',
          invoiceHash: 'HASH_ONE',
          uuid: 'uuid-1',
        },
        error: null,
      })
    );
    const res = await s.append(REQ);
    expect(res.outcome).toBe('ALREADY_APPLIED');
    if (res.outcome === 'ALREADY_APPLIED') {
      expect(res.icv).toBe(1);
      expect(res.uuid).toBe('uuid-1');
    }
  });

  it('append → CONFLICT is RETURNED with token diagnostics, not thrown', async () => {
    const s = new SupabaseDocumentChainService(
      fakeClient({
        data: { outcome: 'CONFLICT', expectedToken: 0, currentToken: 2 },
        error: null,
      })
    );
    const res = await s.append(REQ);
    expect(res).toEqual({ outcome: 'CONFLICT', expectedToken: 0, currentToken: 2 });
  });

  it('an rpc error PROPAGATES (never folded into an outcome)', async () => {
    const s = new SupabaseDocumentChainService(
      fakeClient({ data: null, error: { message: 'connection refused' } })
    );
    await expect(s.append(REQ)).rejects.toThrow(/append failed/);
    await expect(s.readHead('c', 'sandbox')).rejects.toThrow(/readHead failed/);
  });

  it('an unexpected append outcome PROPAGATES', async () => {
    const s = new SupabaseDocumentChainService(
      fakeClient({ data: { outcome: 'WAT' }, error: null })
    );
    await expect(s.append(REQ)).rejects.toThrow(/unexpected outcome/);
  });

  it('a malformed head payload PROPAGATES', async () => {
    const s = new SupabaseDocumentChainService(
      fakeClient({ data: { currentIcv: 'nope' }, error: null })
    );
    await expect(s.readHead('c', 'sandbox')).rejects.toThrow(/malformed head/);
  });
});
