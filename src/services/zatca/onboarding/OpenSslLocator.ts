/**
 * OpenSslLocator — the "where is openssl" AUTHORITY.
 *
 * Isolates the one environment-specific fact (the openssl executable path) so it
 * never hardcodes into the generator. Resolution order:
 *   1. OPENSSL_BIN env var, if set (explicit override — highest priority).
 *   2. the platform default ('openssl' on POSIX; the common Win64 path on
 *      Windows, provided only as a dev convenience).
 *
 * The production target is Linux, where 'openssl' on PATH resolves. The Windows
 * default exists so a developer *can* set things up, but bare 'openssl' is used
 * unless OPENSSL_BIN says otherwise.
 */

export interface OpenSslLocator {
  getExecutable(): string;
}

export interface OpenSslLocatorConfig {
  /** Explicit override (defaults to process.env.OPENSSL_BIN). */
  readonly openSslBin?: string;
  /** Platform, injectable for testing (defaults to process.platform). */
  readonly platform?: NodeJS.Platform;
}

export class DefaultOpenSslLocator implements OpenSslLocator {
  private readonly openSslBin?: string;
  private readonly platform: NodeJS.Platform;

  constructor(config: OpenSslLocatorConfig = {}) {
    this.openSslBin = config.openSslBin ?? process.env.OPENSSL_BIN;
    this.platform = config.platform ?? process.platform;
  }

  getExecutable(): string {
    if (this.openSslBin && this.openSslBin.trim()) {
      return this.openSslBin.trim();
    }
    // POSIX (incl. the Linux production target): rely on PATH.
    // Windows: a common install path, dev convenience only.
    return this.platform === 'win32'
      ? 'C\u003a\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe'
      : 'openssl';
  }
}

export function createOpenSslLocator(
  config?: OpenSslLocatorConfig
): OpenSslLocator {
  return new DefaultOpenSslLocator(config);
}
