/**
 * createSupabaseRuntimeClient — the Node Runtime's OWN Supabase client.
 *
 * This is the seam that keeps the Runtime independent of the Frontend layer. The
 * browser singleton (@/integrations/supabase/client) reads import.meta.env and is
 * built for the browser; the Runtime must NEVER import it. Instead it builds its
 * own client from process.env and INJECTS it into every authority's factory
 * (createZatcaHealthReport(client), createSubmissionCoordinator({ dbClient }), …).
 *
 * This generalizes exactly what the live E2E tests already did:
 *   createClient(URL, SERVICE_KEY) → inject into the authority.
 *
 * Service-role key: the Runtime runs on the customer's server as a trusted
 * backend; it uses the service-role key and does not persist a session.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface RuntimeSupabaseConfig {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/** Read + validate the Runtime's Supabase configuration from the environment. */
export function readRuntimeSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env
): RuntimeSupabaseConfig {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      'Runtime config: SUPABASE_URL (or VITE_SUPABASE_URL) is required'
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      'Runtime config: SUPABASE_SERVICE_ROLE_KEY is required'
    );
  }
  return { url, serviceRoleKey };
}

/**
 * Build the Runtime's Supabase client. No session persistence, no auto-refresh —
 * a backend service, not a user session. An isolated storageKey avoids clashing
 * with any other client in the same process (e.g. during tests).
 */
export function createSupabaseRuntimeClient(
  config: RuntimeSupabaseConfig = readRuntimeSupabaseConfig()
): SupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: 'sb-erp-node-runtime',
    },
  });
}
