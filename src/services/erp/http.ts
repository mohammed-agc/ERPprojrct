/**
 * Authenticated HTTP client for ERP backend services.
 *
 * Responsibilities:
 *  - Resolve the current Supabase session via supabase.auth (single source of truth)
 *  - Inject Authorization: Bearer <access_token> + apikey headers
 *  - On 401, refresh the session once and retry transparently
 *  - Surface a typed ErpAuthError so React Query can react cleanly
 *
 * This module never persists tokens itself — supabase-js owns persistence and
 * refresh. We only read from it and propagate the current token per request.
 */
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Backend base URL for ERP workflow APIs.
 *  Defaults to the Supabase functions origin (`/functions/v1`) so edge-function
 *  routes work out of the box. Override with VITE_ERP_API_BASE when a separate
 *  backend is wired in. */
export const ERP_API_BASE: string =
  (import.meta.env.VITE_ERP_API_BASE as string | undefined) ??
  `${SUPABASE_URL}/functions/v1`;

export class ErpAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ErpAuthError";
    this.status = status;
  }
}

export class ErpHttpError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ErpHttpError";
    this.status = status;
    this.body = body;
  }
}

async function getAccessToken(forceRefresh = false): Promise<string | null> {
  if (forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export interface ErpFetchInit extends Omit<RequestInit, "body"> {
  /** JSON body — will be stringified and given a JSON content-type. */
  json?: unknown;
  /** Bypass auth entirely (rare — e.g. public health checks). */
  anonymous?: boolean;
}

/**
 * Authenticated fetch for any ERP backend endpoint.
 *
 * Path is relative to ERP_API_BASE, or an absolute URL.
 * Throws ErpAuthError on 401 after a refresh attempt, ErpHttpError otherwise.
 */
export async function erpFetch<T = unknown>(
  path: string,
  init: ErpFetchInit = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${ERP_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const doFetch = async (token: string | null): Promise<Response> => {
    const headers = new Headers(init.headers ?? {});
    if (init.json !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (!headers.has("apikey")) headers.set("apikey", SUPABASE_ANON);
    if (token) headers.set("authorization", `Bearer ${token}`);

    return fetch(url, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : (init as RequestInit).body,
    });
  };

  let token = init.anonymous ? null : await getAccessToken(false);
  let res = await doFetch(token);

  // 401 → try one silent refresh, then retry once. Mirrors supabase-js semantics.
  if (res.status === 401 && !init.anonymous) {
    const refreshed = await getAccessToken(true);
    if (!refreshed) {
      throw new ErpAuthError("Session expired. Please sign in again.", 401);
    }
    res = await doFetch(refreshed);
    if (res.status === 401) {
      throw new ErpAuthError("Unauthorized after refresh.", 401);
    }
  }

  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text().catch(() => undefined); }
    throw new ErpHttpError(`Request failed: ${res.status}`, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? await res.json() : (await res.text() as unknown)) as T;
}
