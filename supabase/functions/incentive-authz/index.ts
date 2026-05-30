// Supplier Incentive authorization gate.
// Validates the caller's JWT, looks up their department + roles in the
// database (source of truth), and returns whether they may view/manage/
// approve supplier incentive programs and claims.
//
// Contract:
//   POST { action: "view" | "manage" | "approve" }
//   200  { allowed: boolean, reason?: string,
//          permissions: { canView, canManage, canApprove } }
//   401  unauthenticated / invalid token
//   400  invalid body
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PURCHASING_DEPTS = new Set(["purchasing", "accounting"]);
const MANAGER_ROLES = new Set(["admin", "manager", "general_manager", "purchasing_manager", "accounting_manager"]);

type Action = "view" | "manage" | "approve";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { error: "Missing bearer token" });

  let body: { action?: Action };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const action = body.action;
  if (action !== "view" && action !== "manage" && action !== "approve") {
    return json(400, { error: "Invalid action" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify JWT by asking the auth API who this token belongs to.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "Invalid or expired token" });
  const uid = userData.user.id;

  // Use the service role for the lookup (bypasses RLS, read-only).
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

  const isAdmin = roles.includes("admin");
  const isManager = isAdmin || roles.includes("manager");
  const inDept = deptCode !== null && PURCHASING_DEPTS.has(deptCode);
  const hasManagerRole = roles.some((r) => MANAGER_ROLES.has(r));

  const canView = isAdmin || isManager || inDept;
  const canManage = canView;
  const canApprove = isAdmin || isManager || hasManagerRole;

  const allowed =
    action === "view" ? canView :
    action === "manage" ? canManage :
    canApprove;

  return json(200, {
    allowed,
    reason: allowed ? undefined :
      action === "approve"
        ? "هذا الإجراء يتطلب صلاحية المدير"
        : "هذا الإجراء مقصور على قسم المشتريات/المحاسبة",
    permissions: { canView, canManage, canApprove },
  });
});
