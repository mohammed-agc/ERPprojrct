/**
 * createSubmissionCoordinator — S5.3 composition root.
 *
 * Wires the five authorities into a DefaultSubmissionCoordinator, mirroring
 * createInvoiceSigningCoordinator:
 *   - credential resolution + the five DB/HTTP/Vault providers,
 *   - dbClient is OPTIONAL (server-side runs inject service-role / authed client;
 *     omitted in the browser → factories fall back to the app singleton),
 *   - fetch is INJECTED too (defaults to global fetch; tests/Node pass their own).
 */

import type { SubmissionCoordinator } from './SubmissionCoordinator';
import { DefaultSubmissionCoordinator } from './DefaultSubmissionCoordinator';
import { createSupabaseCredentialResolver } from '../credential/SupabaseCredentialResolver';
import { FileSystemSubmissionCredentialProvider } from './FileSystemSubmissionCredentialProvider';
import { createSignedDocumentReader } from './SupabaseSignedDocumentReader';
import {
  FetchZatcaComplianceClient,
  type FetchLike,
} from './FetchZatcaComplianceClient';
import { createSubmissionLogWriter } from './SupabaseSubmissionLogWriter';
import { createSubmissionProjectionWriter } from './SupabaseSubmissionProjectionWriter';
import { createArtifactStore } from '../artifact/SupabaseArtifactStore';

/** Same injectable client type the signing root uses (typeof supabase). */
type InjectableDbClient = Parameters<typeof createArtifactStore>[0];

export interface SubmissionVaultConfig {
  /** Absolute vault root holding <credentialId>/compliance.json. */
  readonly vaultRoot: string;
}

export function createSubmissionCoordinator(
  vaultConfig: SubmissionVaultConfig,
  dbClient?: InjectableDbClient,
  fetchImpl: FetchLike = fetch
): SubmissionCoordinator {
  return new DefaultSubmissionCoordinator(
    createSupabaseCredentialResolver(dbClient as never),
    new FileSystemSubmissionCredentialProvider({ vaultRoot: vaultConfig.vaultRoot }),
    createSignedDocumentReader(dbClient),
    new FetchZatcaComplianceClient(fetchImpl),
    createSubmissionLogWriter(dbClient),
    createSubmissionProjectionWriter(dbClient)
  );
}
