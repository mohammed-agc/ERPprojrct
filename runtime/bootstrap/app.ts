/**
 * buildApp — the Composition Root of the Node Runtime.
 *
 * It wires the Runtime's own dependencies (its Supabase client) and registers
 * routes. It is built THIN: today only /runtime/info, which isolates Fastify +
 * environment + Supabase connectivity from any ZATCA logic. Authorities are added
 * one route at a time, each injected with the Runtime client — never the browser
 * singleton.
 *
 * buildApp is pure-ish: given a config it returns a configured (not-yet-listening)
 * Fastify instance, so tests can `inject()` HTTP requests without opening a port.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import {
  createSupabaseRuntimeClient,
  readRuntimeSupabaseConfig,
  type RuntimeSupabaseConfig,
} from '../infrastructure/createSupabaseRuntimeClient.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { registerZatcaHealthRoutes } from '../routes/zatcaHealthRoutes.js';

export interface RuntimeContext {
  readonly startedAt: number;
  readonly db: SupabaseClient;
}

export interface BuildAppOptions {
  /** Injectable for tests; defaults to a client built from process.env. */
  readonly db?: SupabaseClient;
  readonly config?: RuntimeSupabaseConfig;
  readonly logger?: boolean;
}

const RUNTIME_NAME = 'ERP Node Runtime';
const RUNTIME_VERSION = '0.1';

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  const db =
    options.db ??
    createSupabaseRuntimeClient(options.config ?? readRuntimeSupabaseConfig());

  const ctx: RuntimeContext = { startedAt: Date.now(), db };

  // GET /runtime/info — liveness + environment + Supabase connectivity.
  // Isolates Fastify/config/Supabase problems from ZATCA logic.
  app.get('/runtime/info', async () => {
    let supabaseStatus: 'connected' | 'unreachable' = 'connected';
    try {
      const { error } = await ctx.db
        .from('zatca_credentials')
        .select('id', { count: 'exact', head: true });
      if (error) supabaseStatus = 'unreachable';
    } catch {
      supabaseStatus = 'unreachable';
    }

    return {
      runtime: RUNTIME_NAME,
      version: RUNTIME_VERSION,
      uptimeSeconds: Math.floor((Date.now() - ctx.startedAt) / 1000),
      supabase: supabaseStatus,
    };
  });

  // ZATCA authorities, hosted over HTTP, injected with the Runtime client.
  registerZatcaHealthRoutes(app, db);

  return app;
}
