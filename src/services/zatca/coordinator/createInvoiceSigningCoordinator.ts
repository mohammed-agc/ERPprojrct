/**
 * createInvoiceSigningCoordinator — the S5 composition root.
 *
 * Wires the four aggregates + composer + build seam + projection-failure sink
 * into the orchestrator. Every collaborator comes from its own factory; the only
 * environment input is the vault config (Product-First: no secret in code).
 *
 * SERVER-SIDE ONLY — it transitively wires the filesystem Vault. Do not import
 * from browser bundles; invoke from an Edge Function / Node entry point.
 */

import type { FileSystemVaultConfig } from '../vault/FileSystemVaultProvider';
import type {
  InvoiceSigningCoordinator,
  CoordinatorOptions,
} from './InvoiceSigningCoordinator';
import { DefaultInvoiceSigningCoordinator } from './DefaultInvoiceSigningCoordinator';
import { createSupabaseCredentialResolver } from '../credential/SupabaseCredentialResolver';
import { createSupabaseDocumentChainService } from '../chain/SupabaseDocumentChainService';
import { createArtifactStore } from '../artifact/SupabaseArtifactStore';
import { createProjectionWriter } from '../projection/SupabaseProjectionWriter';
import { createInvoiceSigningComposer } from '../composer/createInvoiceSigningComposer';
import { createProjectionFailureSink } from '../outbox/SupabaseProjectionFailureSink';
import { buildInvoiceXmlWithChainSnapshot } from '../xmlBuilder';

/** Sprint A operational policy. */
const DEFAULT_OPTIONS: CoordinatorOptions = { maxRetries: 5 };

/**
 * Optional DB client for SERVER-SIDE runs (authenticated Node / service-role).
 * Omitted in the browser → every DB factory falls back to the app singleton,
 * so the browser path is byte-for-byte unchanged. `as never` bridges the three
 * narrower factory client interfaces (each casts the singleton the same way).
 */
type InjectableDbClient = Parameters<typeof createArtifactStore>[0];

export function createInvoiceSigningCoordinator(
  vaultConfig: FileSystemVaultConfig,
  options: CoordinatorOptions = DEFAULT_OPTIONS,
  dbClient?: InjectableDbClient
): InvoiceSigningCoordinator {
  return new DefaultInvoiceSigningCoordinator(
    createSupabaseCredentialResolver(dbClient as never),
    createSupabaseDocumentChainService(dbClient as never),
    createArtifactStore(dbClient),
    createProjectionWriter(dbClient),
    createInvoiceSigningComposer(vaultConfig),
    buildInvoiceXmlWithChainSnapshot,
    createProjectionFailureSink(dbClient),
    options
  );
}
