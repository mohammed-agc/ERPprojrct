/**
 * End-to-end tests for the supplier-incentive API routes.
 *
 * Seeds real auth users with distinct departments + roles, signs each in
 * to obtain a JWT, and calls the deployed `incentive-api` function for
 * every route (list / create / approve / reject). Asserts that the
 * backend — independently of the UI — denies unauthorized callers with
 * the exact Arabic reason surfaced through the standalone authz gate.
 *
 * Cleanup: all created users are deleted in finalizers.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FN_URL = `${SUPABASE_URL}/functions/v1/incentive-api`;

const DEPT_PURCHASING = "de9d6156-e60f-4b41-9859-8b0737f7a7eb";
const DEPT_ACCOUNTING = "c0cd7686-4bf8-4707-9ba5-8010dcea5bd6";
const DEPT_SALES      = "71273079-4122-4d36-a9a5-584ab4ac3033";

const REASON_DEPT    = "هذا الإجراء مقصور على قسم المشتريات/المحاسبة";
const REASON_MANAGER = "هذا الإجراء يتطلب صلاحية المدير";

const PASSWORD = "TestPass!123456";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function seedUser(
  deptId: string | null,
  fullName: string,
  role?: "manager" | "admin",
): Promise<{ id: string; email: string }> {
  const email = `api-test-${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  const uid = data.user!.id;
  if (deptId) {
    const { error: pErr } = await admin
      .from("profiles").update({ department_id: deptId }).eq("id", uid);
    if (pErr) throw new Error(`profile update failed: ${pErr.message}`);
  }
  // Strip auto-assigned 'employee' role so role shortcuts don't accidentally
  // grant manager-style access during the department-only tests.
  await admin.from("user_roles").delete().eq("user_id", uid);
  if (role) {
    const { error: rErr } = await admin
      .from("user_roles").insert({ user_id: uid, role });
    if (rErr) throw new Error(`role insert failed: ${rErr.message}`);
  }
  return { id: uid, email };
}

async function signIn(email: string): Promise<string> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`signIn failed: ${error?.message}`);
  return data.session.access_token;
}

async function callApi(
  token: string | null,
  action: "list" | "create" | "approve" | "reject",
  payload?: Record<string, unknown>,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    apikey: ANON_KEY,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(FN_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, payload }),
  });
  const body = await res.json().catch(async () => ({ raw: await res.text() }));
  return { status: res.status, body };
}

async function cleanup(ids: string[]) {
  await Promise.allSettled(ids.map((id) => admin.auth.admin.deleteUser(id)));
}

// ----- list / create routes -----

Deno.test("incentive-api: purchasing user can list and create", async () => {
  const u = await seedUser(DEPT_PURCHASING, "Purchasing E2E");
  try {
    const token = await signIn(u.email);
    const list = await callApi(token, "list");
    assertEquals(list.status, 200);
    assertEquals(list.body.ok, true);

    const create = await callApi(token, "create", { name: "Q2 Push", target: 10 });
    assertEquals(create.status, 200);
    assertEquals(create.body.ok, true);
    assert(typeof create.body.data.id === "string");
  } finally { await cleanup([u.id]); }
});

Deno.test("incentive-api: accounting user can list and create", async () => {
  const u = await seedUser(DEPT_ACCOUNTING, "Accounting E2E");
  try {
    const token = await signIn(u.email);
    const list = await callApi(token, "list");
    const create = await callApi(token, "create", { name: "Rebate plan" });
    assertEquals(list.body.ok, true);
    assertEquals(create.body.ok, true);
  } finally { await cleanup([u.id]); }
});

Deno.test("incentive-api: sales user is denied on list and create with Arabic reason", async () => {
  const u = await seedUser(DEPT_SALES, "Sales E2E");
  try {
    const token = await signIn(u.email);
    const list = await callApi(token, "list");
    assertEquals(list.status, 403);
    assertEquals(list.body.ok, false);
    assertEquals(list.body.error, REASON_DEPT);

    const create = await callApi(token, "create", { name: "evil program" });
    assertEquals(create.status, 403);
    assertEquals(create.body.error, REASON_DEPT);
  } finally { await cleanup([u.id]); }
});

// ----- approve / reject routes -----

Deno.test("incentive-api: purchasing (non-manager) user is denied on approve and reject", async () => {
  const u = await seedUser(DEPT_PURCHASING, "Purchasing Staff");
  try {
    const token = await signIn(u.email);
    const approve = await callApi(token, "approve", { id: "claim-1" });
    assertEquals(approve.status, 403);
    assertEquals(approve.body.error, REASON_MANAGER);

    const reject = await callApi(token, "reject", { id: "claim-1", reason: "bad" });
    assertEquals(reject.status, 403);
    assertEquals(reject.body.error, REASON_MANAGER);
  } finally { await cleanup([u.id]); }
});

Deno.test("incentive-api: manager can approve and reject claims", async () => {
  const u = await seedUser(DEPT_PURCHASING, "Purchasing Manager", "manager");
  try {
    const token = await signIn(u.email);
    const approve = await callApi(token, "approve", { id: "claim-9" });
    assertEquals(approve.status, 200);
    assertEquals(approve.body.ok, true);
    assertEquals(approve.body.data.status, "approved");

    const reject = await callApi(token, "reject", { id: "claim-9", reason: "duplicate" });
    assertEquals(reject.status, 200);
    assertEquals(reject.body.data.status, "rejected");
  } finally { await cleanup([u.id]); }
});

Deno.test("incentive-api: sales manager can approve (manager role wins over dept)", async () => {
  // Sanity: approve is role-gated, not dept-gated. A manager outside
  // purchasing/accounting can approve, but still can't list or create.
  const u = await seedUser(DEPT_SALES, "Sales Manager", "manager");
  try {
    const token = await signIn(u.email);
    const approve = await callApi(token, "approve", { id: "claim-x" });
    assertEquals(approve.status, 200);
    assertEquals(approve.body.ok, true);
  } finally { await cleanup([u.id]); }
});

// ----- transport-level guards -----

Deno.test("incentive-api: missing bearer token returns 401 on every route", async () => {
  for (const action of ["list", "create", "approve", "reject"] as const) {
    const r = await callApi(null, action);
    assertEquals(r.status, 401, `${action} should require auth`);
  }
});

Deno.test("incentive-api: invalid action returns 400", async () => {
  const u = await seedUser(DEPT_PURCHASING, "Purchasing E2E");
  try {
    const token = await signIn(u.email);
    const r = await callApi(token, "delete" as never);
    assertEquals(r.status, 400);
    assertEquals(r.body.error, "Invalid action");
  } finally { await cleanup([u.id]); }
});
