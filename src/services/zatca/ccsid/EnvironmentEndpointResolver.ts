/**
 * EnvironmentEndpointResolver — the SINGLE source of ZATCA endpoint URLs.
 *
 * No ZATCA client hardcodes a URL. They ask this resolver for the base URL of
 * their (environment), and build their specific path on top. When ZATCA changes
 * a host or adds an API version, this is the ONE place that changes.
 *
 * Base URLs per environment (ZATCA Fatoora gateway):
 *   sandbox     → .../e-invoicing/developer-portal
 *   simulation  → .../e-invoicing/simulation
 *   production  → .../e-invoicing/core
 *
 * The resolver returns only the BASE; callers append '/compliance',
 * '/production/csids', '/invoices/clearance/single', etc.
 */

import type { ZatcaEnvironment } from '../credential/CredentialResolver';

const GATEWAY = 'https://gw-fatoora.zatca.gov.sa/e-invoicing';

const BASE_URL_BY_ENVIRONMENT: Readonly<Record<ZatcaEnvironment, string>> = {
  sandbox: `${GATEWAY}/developer-portal`,
  simulation: `${GATEWAY}/simulation`,
  production: `${GATEWAY}/core`,
};

export class EndpointResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EndpointResolutionError';
  }
}

export interface EnvironmentEndpointResolver {
  /** Base URL for the environment, with NO trailing slash and no path. */
  baseUrl(environment: ZatcaEnvironment): string;
}

export class DefaultEnvironmentEndpointResolver
  implements EnvironmentEndpointResolver
{
  baseUrl(environment: ZatcaEnvironment): string {
    const base = BASE_URL_BY_ENVIRONMENT[environment];
    if (!base) {
      // No silent default — an unknown environment is a loud error.
      throw new EndpointResolutionError(
        `no base URL configured for environment "${environment}"`
      );
    }
    return base;
  }
}

export function createEnvironmentEndpointResolver(): EnvironmentEndpointResolver {
  return new DefaultEnvironmentEndpointResolver();
}
