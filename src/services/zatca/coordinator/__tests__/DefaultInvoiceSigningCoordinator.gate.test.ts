import { describe, it, expect } from 'vitest';
import { DefaultInvoiceSigningCoordinator } from '../DefaultInvoiceSigningCoordinator';
import type { BuildInvoiceXmlWithChainSnapshot } from '../DefaultInvoiceSigningCoordinator';
import type {
  SignDocumentInput,
  CoordinatorOptions,
  ProjectionFailureSink,
  ProjectionFailedEvent,
} from '../InvoiceSigningCoordinator';

const INPUT: SignDocumentInput = {
  companyId: 'company-1',
  environment: 'sandbox',
  credentialType: 'CCSID',
  documentType: 'tax_invoice',
  documentId: 'inv-1',
};

const CRED = {
  credentialId: 'cred-1',
  environment: 'sandbox' as const,
  credentialType: 'CCSID' as const,
  certificateFingerprint: 'FP_ABC',
  expiresAt: new Date('2030-01-01'),
};

const XML_OUT = { metadata: { uuid: 'uuid-xyz' } } as never;
const COMPOSED = {
  signedXml: '<Invoice>signed</Invoice>',
  invoiceHashB64: 'HASH_ONE',
  signatureValueB64: 'SIG',
  certificateB64: 'CERT',
  qrBase64: 'QR_B64',
} as never;

/** Records the order of side-effecting calls to prove persist-before-append etc. */
function harness(opts: {
  appendOutcomes: unknown[]; // one per attempt
  projectionThrows?: string;
  sinkThrows?: string;
  resolveThrows?: Error;
  maxRetries?: number;
}) {
  const calls: string[] = [];
  const captured: Record<string, unknown> = {};
  const sinkEvents: ProjectionFailedEvent[] = [];
  let appendIdx = 0;

  const resolver = {
    implementationName: 'fake',
    async resolve(companyId: string, _e: unknown, credType: unknown) {
      calls.push('resolve');
      captured.resolveArgs = { companyId, credType };
      if (opts.resolveThrows) throw opts.resolveThrows;
      return CRED;
    },
  } as never;

  const chain = {
    implementationName: 'fake',
    async readHead() {
      calls.push('readHead');
      return { currentIcv: 4, currentPih: 'PIH_PREV', token: 2 };
    },
    async append(req: Record<string, unknown>) {
      calls.push('append');
      captured.appendReq = req;
      return opts.appendOutcomes[appendIdx++];
    },
  } as never;

  const artifacts = {
    implementationName: 'fake',
    async persist(a: Record<string, unknown>) {
      calls.push('persist');
      captured.persistArg = a;
      return 'art-1';
    },
    async fetch() {
      throw new Error('not used');
    },
  } as never;

  const projection = {
    implementationName: 'fake',
    async write(p: Record<string, unknown>) {
      calls.push('project');
      captured.projectArg = p;
      if (opts.projectionThrows) throw new Error(opts.projectionThrows);
    },
  } as never;

  const composer = {
    name: 'fake',
    async compose() {
      calls.push('compose');
      return COMPOSED;
    },
  } as never;

  const buildXml: BuildInvoiceXmlWithChainSnapshot = async (_i, snap) => {
    calls.push('build');
    captured.buildSnapshot = snap;
    return XML_OUT;
  };

  const sink: ProjectionFailureSink = {
    async record(ev) {
      if (opts.sinkThrows) throw new Error(opts.sinkThrows);
      sinkEvents.push(ev);
    },
  };

  const options: CoordinatorOptions = { maxRetries: opts.maxRetries ?? 5 };

  const coord = new DefaultInvoiceSigningCoordinator(
    resolver, chain, artifacts, projection, composer, buildXml, sink, options
  );
  return { coord, calls, captured, sinkEvents };
}

const SUCCESS = { outcome: 'SUCCESS', icv: 5, pih: 'PIH_PREV', artifactHash: 'HASH_ONE' };
const CONFLICT = { outcome: 'CONFLICT', expectedToken: 2, currentToken: 3 };
const ALREADY = { outcome: 'ALREADY_APPLIED', icv: 5, pih: 'PIH_PREV', artifactHash: 'OLD_HASH', uuid: 'u' };

describe('DefaultInvoiceSigningCoordinator — gate', () => {
  it('declares its implementation name', () => {
    const { coord } = harness({ appendOutcomes: [SUCCESS] });
    expect(coord.implementationName).toBe('DefaultInvoiceSigningCoordinator');
  });

  it('happy path: sequences resolve→readHead→build→compose→persist→append→project, returns SIGNED', async () => {
    const { coord, calls, captured } = harness({ appendOutcomes: [SUCCESS] });
    const res = await coord.run(INPUT);
    expect(calls).toEqual([
      'resolve', 'readHead', 'build', 'compose', 'persist', 'append', 'project',
    ]);
    expect(res).toEqual({
      status: 'SIGNED', icv: 5, pih: 'PIH_PREV', artifactId: 'art-1', artifactHash: 'HASH_ONE',
    });
    // persist strictly before append (durability boundary)
    expect(calls.indexOf('persist')).toBeLessThan(calls.indexOf('append'));
  });

  it('maps tax_invoice→invoice and wires uuid + artifactRef + token into append', async () => {
    const { coord, captured } = harness({ appendOutcomes: [SUCCESS] });
    await coord.run(INPUT);
    const req = captured.appendReq as Record<string, unknown>;
    expect(req.documentType).toBe('invoice');
    expect(req.uuid).toBe('uuid-xyz'); // from xmlOut.metadata.uuid
    expect(req.token).toBe(2);
    expect(req.artifactRef).toEqual({ artifactId: 'art-1', artifactHash: 'HASH_ONE' });
    // persist also carries the chain vocabulary + fingerprint from resolve
    const p = captured.persistArg as Record<string, unknown>;
    expect(p.documentType).toBe('invoice');
    expect(p.certificateFingerprint).toBe('FP_ABC');
    expect(p.artifactHash).toBe('HASH_ONE');
  });

  it('builds on the head snapshot (currentIcv/currentPih)', async () => {
    const { coord, captured } = harness({ appendOutcomes: [SUCCESS] });
    await coord.run(INPUT);
    expect(captured.buildSnapshot).toEqual({ currentIcv: 4, currentPih: 'PIH_PREV' });
  });

  it('passes the caller-chosen credentialType to resolve', async () => {
    const { coord, captured } = harness({ appendOutcomes: [SUCCESS] });
    await coord.run(INPUT);
    expect((captured.resolveArgs as Record<string, unknown>).credType).toBe('CCSID');
  });

  it('CONFLICT retries on a fresh head, then succeeds', async () => {
    const { coord, calls } = harness({ appendOutcomes: [CONFLICT, SUCCESS] });
    const res = await coord.run(INPUT);
    expect(res.status).toBe('SIGNED');
    // resolve once; two full attempts (readHead twice)
    expect(calls.filter((c) => c === 'resolve')).toHaveLength(1);
    expect(calls.filter((c) => c === 'readHead')).toHaveLength(2);
    expect(calls.filter((c) => c === 'append')).toHaveLength(2);
  });

  it('throws after exhausting maxRetries on persistent CONFLICT', async () => {
    const { coord, calls } = harness({ appendOutcomes: [CONFLICT, CONFLICT, CONFLICT], maxRetries: 3 });
    await expect(coord.run(INPUT)).rejects.toThrow(/exhausted 3 attempts/);
    expect(calls.filter((c) => c === 'append')).toHaveLength(3);
  });

  it('ALREADY_APPLIED is idempotent success and does NOT project', async () => {
    const { coord, calls } = harness({ appendOutcomes: [ALREADY] });
    const res = await coord.run(INPUT);
    expect(res).toEqual({ status: 'ALREADY_SIGNED', icv: 5, pih: 'PIH_PREV', artifactHash: 'OLD_HASH' });
    expect(calls).not.toContain('project');
  });

  it('projection failure emits ProjectionFailed and still returns SIGNED', async () => {
    const { coord, sinkEvents } = harness({ appendOutcomes: [SUCCESS], projectionThrows: 'db down' });
    const res = await coord.run(INPUT);
    expect(res.status).toBe('SIGNED'); // chain success is the truth
    expect(sinkEvents).toHaveLength(1);
    expect(sinkEvents[0]).toMatchObject({
      kind: 'ProjectionFailed',
      documentId: 'inv-1',
      documentType: 'invoice',
      icv: 5,
      artifactId: 'art-1',
      error: 'db down',
    });
  });

  it('a sink failure never fails the committed run', async () => {
    const { coord } = harness({ appendOutcomes: [SUCCESS], projectionThrows: 'db down', sinkThrows: 'sink down' });
    const res = await coord.run(INPUT);
    expect(res.status).toBe('SIGNED');
  });

  it('a resolve failure PROPAGATES (precondition, never an outcome)', async () => {
    const { coord, calls } = harness({
      appendOutcomes: [SUCCESS],
      resolveThrows: new Error('NO_ACTIVE_CREDENTIAL'),
    });
    await expect(coord.run(INPUT)).rejects.toThrow(/NO_ACTIVE_CREDENTIAL/);
    expect(calls).not.toContain('append');
  });
});
