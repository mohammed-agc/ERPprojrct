/**
 * End-to-end tests for the incentive-authz edge function.
 *
 * Seeds three real auth users (purchasing, accounting, sales) with the
 * service-role key, signs each one in to obtain a real JWT, calls the
 * deployed function, and asserts the authorization outcome — including
 * the exact Arabic denial reasons surfaced to the UI.
 *
 * Cleanup: every created user is deleted in the test finalizer, even on
 * failure, so the auth table is not polluted.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FN_URL = `${SUPABASE_URL}/functions/v1/incentive-authz`;

const DEPT_PURCHASING = "de9d6156-e60f-4b41-9859-8b0737f7a7eb"; // purchasing
const DEPT_ACCOUNTING = "c0cd7686-4bf8-4707-9ba5-8010dcea5bd6"; // accounting
const DEPT_SALES      = "71273079-4122-4d36-a9a5-584ab4ac3033"; // sales (unauthorized)

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PASSWORD = "TestPass!123456";

async function seedUser(deptId: string | null, fullName: string): Promise<{ id: string; email: string }> {
  const email = `authz-test-${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  const uid = data.user!.id;
  // Profile is created by handle_new_user trigger; patch department.
  if (deptId) {
    const { error: pErr } = await admin
      .from("profiles").update({ department_id: deptId }).eq("id", uid);
    if (pErr) throw new Error(`profile update failed: ${pErr.message}`);
  }
  // Strip the auto-assigned 'employee' role so role-based shortcuts don't
  // accidentally grant access — we want to test the department gate cleanly.
  await admin.from("user_roles").delete().eq("user_id", uid);
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

async function callAuthz(token: string | null, action: "view" | "manage" | "approve") {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    apikey: ANON_KEY,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(FN_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ action }),
  });
  const body = await res.json().catch(async () => ({ raw: await res.text() }));
  return { status: res.status, body };
}

async function cleanup(ids: string[]) {
  await Promise.allSettled(ids.map((id) => admin.auth.admin.deleteUser(id)));
}

Deno.test("incentive-authz: purchasing user can list (view) and create (manage)", async () => {
  const u = await seedUser(DEPT_PURCHASING, "Purchasing User");
  try {
    const token = await signIn(u.email);

    const view = await callAuthz(token, "view");
    assertEquals(view.status, 200);
    assertEquals(view.body.allowed, true, "view must be allowed for purchasing dept");
    assertEquals(view.body.permissions.canView, true);
    assertEquals(view.body.permissions.canManage, true);

    const manage = await callAuthz(token, "manage");
    assertEquals(manage.status, 200);
    assertEquals(manage.body.allowed, true, "manage must be allowed for purchasing dept");
  } finally {
    await cleanup([u.id]);
  }
});

Deno.test("incentive-authz: accounting user can list and create", async () => {
  const u = await seedUser(DEPT_ACCOUNTING, "Accounting User");
  try {
    const token = await signIn(u.email);
    const view = await callAuthz(token, "view");
    const manage = await callAuthz(token, "manage");
    assertEquals(view.body.allowed, true, "accounting must be allowed to view");
    assertEquals(manage.body.allowed, true, "accounting must be allowed to manage");
  } finally {
    await cleanup([u.id]);
  }
});

Deno.test("incentive-authz: sales user is denied with Arabic reason", async () => {
  const u = await seedUser(DEPT_SALES, "Sales User");
  try {
    const token = await signIn(u.email);

    const view = await callAuthz(token, "view");
    assertEquals(view.status, 200);
    assertEquals(view.body.allowed, false, "sales dept must NOT view incentives");
    assertEquals(view.body.reason, "هذا الإجراء مقصور على قسم المشتريات/المحاسبة");
    assertEquals(view.body.permissions.canView, false);
    assertEquals(view.body.permissions.canManage, false);

    const manage = await callAuthz(token, "manage");
    assertEquals(manage.body.allowed, false, "sales dept must NOT create programs");
    assertEquals(manage.body.reason, "هذا الإجراء مقصور على قسم المشتريات/المحاسبة");

    const approve = await callAuthz(token, "approve");
    assertEquals(approve.body.allowed, false, "sales dept must NOT approve claims");
    assertEquals(approve.body.reason, "هذا الإجراء يتطلب صلاحية المدير");
  } finally {
    await cleanup([u.id]);
  }
});

Deno.test("incentive-authz: user with no department is denied", async () => {
  const u = await seedUser(null, "Orphan User");
  try {
    const token = await signIn(u.email);
    const view = await callAuthz(token, "view");
    assertEquals(view.body.allowed, false);
    assert(typeof view.body.reason === "string" && view.body.reason.length > 0);
  } finally {
    await cleanup([u.id]);
  }
});

Deno.test("incentive-authz: missing bearer token returns 401", async () => {
  const r = await callAuthz(null, "view");
  assertEquals(r.status, 401);
  assertEquals(r.body.error, "Missing bearer token");
});

Deno.test("incentive-authz: invalid action returns 400", async () => {
  const u = await seedUser(DEPT_PURCHASING, "Purchasing User");
  try {
    const token = await signIn(u.email);
    const r = await callAuthz(token, "delete" as never);
    assertEquals(r.status, 400);
    assertEquals(r.body.error, "Invalid action");
  } finally {
    await cleanup([u.id]);
  }
});
