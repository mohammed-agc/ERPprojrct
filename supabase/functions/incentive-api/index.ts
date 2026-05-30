/**
 * Supplier Incentive API.
 *
 * Single edge function that hosts all four authoritative routes for the
 * supplier-incentive feature. Each route re-runs the same JWT + department +
 * role checks that `incentive-authz` exposes for the UI, so authorization
 * is enforced server-side at the *data* boundary, not only at the
 * preflight gate.
 *
 * Routes (POST):
 *   action="list"     → list programs                  (needs canView)
 *   action="create"   → create a program               (needs canManage)
 *   action="approve"  → approve a pending claim        (needs canApprove)
 *   action="reject"   → reject a pending claim         (needs canApprove)
 *
 * The function intentionally does NOT touch domain tables (incentives are
 * still managed client-side in this UAT environment). The handlers return
 * an "ok" envelope so tests can assert that *authorization* is the only
 * thing gating the route — exactly what we want to verify end-to-end.
 *
 *   200  { ok: true, action, data }
 *   403  { ok: false, error: "<arabic reason>" }
 *   401  { error: "Missing/invalid token" }
 *   400  { error: "Invalid action|body" }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PURCHASING_DEPTS = new Set(["purchasing", "accounting"]);
const MANAGER_ROLES = new Set([
  "admin", "manager", "general_manager",
  "purchasing_manager", "accounting_manager",
]);

type Action = "list" | "create" | "approve" | "reject";
const VALID: Set<Action> = new Set(["list", "create", "approve", "reject"]);

const REASON_DEPT = "هذا الإجراء مقصور على قسم المشتريات/المحاسبة";
const REASON_MANAGER = "هذا الإجراء يتطلب صلاحية المدير";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

interface CallerContext {
  uid: string;
  deptCode: string | null;
  roles: string[];
}

async function loadCaller(token: string): Promise<CallerContext | null> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    ?? Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u, error } = await userClient.auth.getUser();
  if (error || !u?.user) return null;
  const uid = u.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const [{ data: profile }, { data: rolesRows }] = await Promise.all([
    admin.from("profiles").select("department_id").eq("id", uid).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", uid),
  ]);
  const roles: string[] = (rolesRows ?? []).map((r: { role: string }) => r.role);
  let deptCode: string | null = null;
  if (profile?.department_id) {
    const { data: dep } = await admin
      .from("departments").select("code").eq("id", profile.department_id).maybeSingle();
    deptCode = (dep?.code as string) ?? null;
  }
  return { uid, deptCode, roles };
}

function authorize(c: CallerContext, action: Action): { ok: true } | { ok: false; reason: string } {
  const isAdmin = c.roles.includes("admin");
  const isManager = isAdmin || c.roles.includes("manager");
  const inDept = c.deptCode !== null && PURCHASING_DEPTS.has(c.deptCode);
  const hasManagerRole = c.roles.some((r) => MANAGER_ROLES.has(r));

  const canView = isAdmin || isManager || inDept;
  const canManage = canView;
  const canApprove = isAdmin || isManager || hasManagerRole;

  if (action === "list" && !canView) return { ok: false, reason: REASON_DEPT };
  if (action === "create" && !canManage) return { ok: false, reason: REASON_DEPT };
  if ((action === "approve" || action === "reject") && !canApprove) {
    return { ok: false, reason: REASON_MANAGER };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return json(401, { error: "Missing bearer token" });

  let body: { action?: Action; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const action = body.action;
  if (!action || !VALID.has(action)) return json(400, { error: "Invalid action" });

  const caller = await loadCaller(token);
  if (!caller) return json(401, { error: "Invalid or expired token" });

  const decision = authorize(caller, action);
  if (!decision.ok) return json(403, { ok: false, error: decision.reason });

  // Stubbed success envelopes — incentive data is still client-side.
  // The point of this function is to ensure the *route* refuses to do
  // anything without an authorized caller; once authorized, it would
  // delegate to the data layer in a fuller implementation.
  switch (action) {
    case "list":
      return json(200, { ok: true, action, data: { programs: [] } });
    case "create":
      return json(200, { ok: true, action, data: { id: crypto.randomUUID(), payload: body.payload ?? null } });
    case "approve":
      return json(200, { ok: true, action, data: { id: (body.payload as any)?.id ?? null, status: "approved" } });
    case "reject":
      return json(200, { ok: true, action, data: { id: (body.payload as any)?.id ?? null, status: "rejected" } });
  }
});
