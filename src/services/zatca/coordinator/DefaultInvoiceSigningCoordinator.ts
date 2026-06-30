import type {
  InvoiceSigningCoordinator,
  SignDocumentInput,
  SignDocumentResult,
  CoordinatorOptions,
  ProjectionFailureSink,
  ProjectionFailedEvent,
} from './InvoiceSigningCoordinator';
import type { DocumentType, XmlBuildInput, XmlBuildOutput, ChainSnapshot } from '../xmlBuilder.types';
import type { ArtifactDocumentType } from '../artifact/ArtifactStore';
import type { CredentialResolver } from '../credential/CredentialResolver';
import type { DocumentChainService } from '../chain/DocumentChainService';
import type { ArtifactStore } from '../artifact/ArtifactStore';
import type { ProjectionWriter } from '../projection/ProjectionWriter';
import type { InvoiceSigningComposer } from '../composer/InvoiceSigningComposer';

/** The chain-snapshot build entry point (S2↔S5 seam), injected for testability. */
export type BuildInvoiceXmlWithChainSnapshot = (
  input: XmlBuildInput,
  chainSnapshot: ChainSnapshot
) => Promise<XmlBuildOutput>;

/** App document vocabulary → chain/artifact vocabulary. */
const CHAIN_TYPE: Record<DocumentType, ArtifactDocumentType> = {
  tax_invoice: 'invoice',
  credit_note: 'credit_note',
};

/**
 * DefaultInvoiceSigningCoordinator — sequences the authorities. Holds no state
 * beyond its injected collaborators; every decision boundary is one of theirs.
 */
export class DefaultInvoiceSigningCoordinator implements InvoiceSigningCoordinator {
  readonly implementationName = 'DefaultInvoiceSigningCoordinator';

  constructor(
    private readonly resolver: CredentialResolver,
    private readonly chain: DocumentChainService,
    private readonly artifacts: ArtifactStore,
    private readonly projection: ProjectionWriter,
    private readonly composer: InvoiceSigningComposer,
    private readonly buildXml: BuildInvoiceXmlWithChainSnapshot,
    private readonly sink: ProjectionFailureSink,
    private readonly options: CoordinatorOptions
  ) {}

  async run(input: SignDocumentInput): Promise<SignDocumentResult> {
    const chainType = CHAIN_TYPE[input.documentType];

    // Resolve once — the credential does not change across CONFLICT retries.
    // NO_ACTIVE_CREDENTIAL / CREDENTIAL_EXPIRED propagate (preconditions).
    const cred = await this.resolver.resolve(
      input.companyId,
      input.environment,
      input.credentialType
    );

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      // A fresh signature per attempt → a fresh artifact (signingTime per attempt).
      const signingTime = new Date().toISOString();

      const head = await this.chain.readHead(input.companyId, input.environment);

      const xmlOut = await this.buildXml(
        { documentType: input.documentType, documentId: input.documentId },
        { currentIcv: head.currentIcv, currentPih: head.currentPih }
      );

      const composed = await this.composer.compose(
        xmlOut,
        cred.credentialId,
        signingTime
      );

      // persist BEFORE append (durability boundary).
      const artifactId = await this.artifacts.persist({
        companyId: input.companyId,
        environment: input.environment,
        documentType: chainType,
        documentId: input.documentId,
        artifactHash: composed.invoiceHashB64,
        signedXml: composed.signedXml,
        signingTime,
        credentialId: cred.credentialId,
        certificateFingerprint: cred.certificateFingerprint,
      });

      const outcome = await this.chain.append({
        companyId: input.companyId,
        environment: input.environment,
        documentType: chainType,
        documentId: input.documentId,
        uuid: xmlOut.metadata.uuid,
        artifactRef: { artifactId, artifactHash: composed.invoiceHashB64 },
        token: head.token,
      });

      if (outcome.outcome === 'SUCCESS') {
        await this.projectAfterSuccess(
          input,
          chainType,
          outcome.icv,
          outcome.pih,
          composed.qrBase64,
          composed.invoiceHashB64,
          artifactId,
          signingTime
        );
        return {
          status: 'SIGNED',
          icv: outcome.icv,
          pih: outcome.pih,
          artifactId,
          artifactHash: composed.invoiceHashB64,
        };
      }

      if (outcome.outcome === 'ALREADY_APPLIED') {
        // Idempotent success — do NOT re-project (canonical projection belongs
        // to the artifact the chain accepted, not this attempt's orphan).
        return {
          status: 'ALREADY_SIGNED',
          icv: outcome.icv,
          pih: outcome.pih,
          artifactHash: outcome.artifactHash,
        };
      }

      // CONFLICT → the head moved (PIH changed). Rebuild on a fresh head.
    }

    throw new Error(
      `${this.implementationName}: exhausted ${this.options.maxRetries} attempts (persistent CONFLICT)`
    );
  }

  /**
   * Write the projection after chain success. Chain success is the truth: a
   * projection failure is emitted as a ProjectionFailed event (recoverable) and
   * never fails the run. Sprint A: only tax_invoice projects (to invoices);
   * credit_note projection (to credit_notes) is deferred.
   */
  private async projectAfterSuccess(
    input: SignDocumentInput,
    chainType: ArtifactDocumentType,
    icv: number,
    pih: string,
    qrCode: string,
    xmlHash: string,
    artifactId: string,
    signingTime: string
  ): Promise<void> {
    if (input.documentType !== 'tax_invoice') return; // projection deferred

    try {
      await this.projection.write({
        invoiceId: input.documentId,
        icv,
        pih,
        qrCode,
        xmlHash,
        zatcaStatus: 'ready',
        signedArtifactId: artifactId,
        generatedAt: signingTime,
      });
    } catch (projectionError) {
      const event: ProjectionFailedEvent = {
        kind: 'ProjectionFailed',
        companyId: input.companyId,
        environment: input.environment,
        documentType: chainType,
        documentId: input.documentId,
        icv,
        artifactId,
        error:
          projectionError instanceof Error
            ? projectionError.message
            : String(projectionError),
        occurredAt: new Date().toISOString(),
      };
      try {
        await this.sink.record(event);
      } catch (sinkError) {
        // Last resort — bookkeeping must never fail the committed chain result.
        // eslint-disable-next-line no-console
        console.error(
          `${this.implementationName}: projection AND sink failed`,
          event,
          sinkError
        );
      }
    }
  }
}
