/**
 * server.ts — the Runtime process entrypoint. Builds the app and listens.
 *
 * Run (PowerShell), with the service-role key set for this session:
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<sb_secret_…>"
 *   npx tsx runtime/server.ts
 *
 * Then probe:
 *   curl http://localhost:8787/runtime/info
 */

import { buildApp } from './bootstrap/app.js';

const PORT = Number(process.env.RUNTIME_PORT ?? 8787);
const HOST = process.env.RUNTIME_HOST ?? '127.0.0.1';

async function main() {
  const app = buildApp({ logger: true });
  try {
    await app.listen({ port: PORT, host: HOST });
    // eslint-disable-next-line no-console
    console.log(`ERP Node Runtime listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
