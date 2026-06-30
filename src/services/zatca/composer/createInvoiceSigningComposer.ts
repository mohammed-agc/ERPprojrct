/**
 * createInvoiceSigningComposer — composition root for the pure signing composer.
 *
 * Evidence (ADR-029 mapping): no composer composition root existed; the only
 * assembly lived in the gate test (with a stubbed signer). This is that root,
 * with the REAL crypto stack wired:
 *
 *   composer
 *    ├── signer = NodeXadesSigner(canonicalizer, hash, certLoader, signedProps, vault)
 *    ├── certLoader   (shared with the signer — one instance)
 *    ├── assembler / tlv / injector  (zero-dependency)
 *   where hash is shared by signer + signedProps.
 *
 * SERVER-SIDE ONLY: the vault is filesystem-backed (reads private key material
 * from disk). The vault config is the single environment input — never a secret
 * baked into code (Product-First).
 */

import type { InvoiceSigningComposer } from './InvoiceSigningComposer';
import { NodeInvoiceSigningComposer } from './InvoiceSigningComposer';
import { XmlCryptoCanonicalizationProvider } from '../canonicalization/XmlCryptoCanonicalizationProvider';
import { NodeCryptoHashProvider } from '../hash/NodeCryptoHashProvider';
import { NodeCryptoCertificateLoader } from '../certificate/NodeCryptoCertificateLoader';
import { TemplateSignedPropertiesProvider } from '../signed-properties/TemplateSignedPropertiesProvider';
import { FileSystemVaultProvider } from '../vault/FileSystemVaultProvider';
import type { FileSystemVaultConfig } from '../vault/FileSystemVaultProvider';
import { NodeXadesSigner } from '../xades/NodeXadesSigner';
import { NodeQrAssembler } from '../qr/QrAssembler';
import { NodeQrTlvProvider } from '../qr/QrTlvProvider';
import { NodeQrInjector } from '../qr/QrInjector';

export function createInvoiceSigningComposer(
  vaultConfig: FileSystemVaultConfig
): InvoiceSigningComposer {
  // Zero-dependency authorities.
  const canonicalizer = new XmlCryptoCanonicalizationProvider();
  const hash = new NodeCryptoHashProvider();
  const certLoader = new NodeCryptoCertificateLoader(hash);
  const assembler = new NodeQrAssembler();
  const tlv = new NodeQrTlvProvider();
  const injector = new NodeQrInjector();

  // SignedProperties reuses the one hash instance; signer reuses hash + certLoader.
  const signedProps = new TemplateSignedPropertiesProvider(hash);
  const vault = new FileSystemVaultProvider(vaultConfig);
  const signer = new NodeXadesSigner(
    canonicalizer,
    hash,
    certLoader,
    signedProps,
    vault
  );

  return new NodeInvoiceSigningComposer(signer, certLoader, assembler, tlv, injector);
}
