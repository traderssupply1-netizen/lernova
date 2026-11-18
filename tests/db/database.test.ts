/**
 * Database-level tests: run against a local PostgreSQL with the Supabase shim.
 *   TEST_DATABASE_URL=postgres://lernova:lernova@localhost/lernova_test npm run test:db
 */
import { Pool, type PoolClient } from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL ?? "postgres://lernova:lernova@localhost/lernova_test";
const pool = new Pool({ connectionString: url, max: 20 });
const root = join(import.meta.dirname, "..", "..");

async function sql(q: string, params: unknown[] = []) {
  return (await pool.query(q, params)).rows;
}

/** Runs fn as an authenticated Supabase user (RLS applies). */
async function asUser<T>(userId: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

async function createCode(opts: { code: string; limit?: number; expires?: string | null; plan?: string; days?: number | null; status?: string; email?: string | null }) {
  const [row] = await sql(
    `insert into invitation_codes (code, usage_limit, expires_at, plan_id, benefit_days, status, restricted_email, type)
     values ($1, $2, $3, $4, $5, $6::invite_status, $7, case when $4 = 'free' then 'general' else $4 end::invite_type) returning *`,
    [opts.code, opts.limit ?? 1, opts.expires ?? null, opts.plan ?? "free", opts.days ?? null, opts.status ?? "active", opts.email ?? null],
  );
  return row;
}

/** Mirrors the server registration flow: reserve, then create the auth user. */
async function register(code: string, email: string, name = "Test User") {
  const [{ reserve_invitation: reservation }] = await sql("select reserve_invitation($1, $2)", [code, email]);
  const [user] = await sql(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify({ full_name: name, terms_accepted: true, privacy_accepted: true, ui_language: "en" })],
  );
  return { reservation, userId: user.id as string };
}

async function errorOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  return null;
}

beforeAll(async () => {
  await sql("drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;");
  await sql(readFileSync(join(root, "tests/db/supabase-shim.sql"), "utf8"));
  await sql(readFileSync(join(root, "supabase/migrations/20261118000001_core_schema.sql"), "utf8"));
  await sql(readFileSync(join(root, "supabase/migrations/20261118000003_seed_config.sql"), "utf8"));
  await sql(readFileSync(join(root, "supabase/migrations/20261118000004_segment_transcripts.sql"), "utf8"));
});

beforeEach(async () => {
  await sql("truncate auth.users, invitation_codes, invitation_redemptions, invitation_audit_logs, admin_audit_logs, rate_limits cascade");
});

afterAll(async () => {
  await pool.end();
});

describe("invitation-only registration", () => {
  it("creates profile, student role and free subscription with a valid code", async () => {
    await createCode({ code: "LRN-VALID-1" });
    const { userId } = await register("lrn-valid-1", "a@example.com", "Anna");
    const [p] = await sql("select * from profiles where id = $1", [userId]);
    expect(p.full_name).toBe("Anna");
    expect(p.ui_language).toBe("en");
    expect(p.terms_accepted_at).not.toBeNull();
    const roles = await sql("select role from user_roles where user_id = $1", [userId]);
    expect(roles.map((r) => r.role)).toEqual(["student"]);
    const [code] = await sql("select usage_count from invitation_codes where code = 'LRN-VALID-1'");
    expect(code.usage_count).toBe(1);
    const [red] = await sql("select status, user_id from invitation_redemptions");
    expect(red).toEqual({ status: "redeemed", user_id: userId });
  });

  it("blocks account creation without a reservation (direct signUp bypass)", async () => {
    const msg = await errorOf(sql("insert into auth.users (email) values ('sneaky@example.com')"));
    expect(msg).toContain("INVITE_REQUIRED");
    expect(await sql("select * from profiles")).toHaveLength(0);
  });

  it("rejects unknown, disabled, revoked and expired codes", async () => {
    await createCode({ code: "LRN-DISABLED", status: "disabled" });
    await createCode({ code: "LRN-REVOKED", status: "revoked" });
    await createCode({ code: "LRN-EXPIRED", expires: "2020-01-01" });
    expect(await errorOf(sql("select reserve_invitation('NOPE-NOPE', 'x@e.com')"))).toContain("INVITE_INVALID");
    expect(await errorOf(sql("select reserve_invitation('LRN-DISABLED', 'x@e.com')"))).toContain("INVITE_INACTIVE");
    expect(await errorOf(sql("select reserve_invitation('LRN-REVOKED', 'x@e.com')"))).toContain("INVITE_INACTIVE");
    expect(await errorOf(sql("select reserve_invitation('LRN-EXPIRED', 'x@e.com')"))).toContain("INVITE_EXPIRED");
  });

  it("enforces usage limits", async () => {
    await createCode({ code: "LRN-TWO-USES", limit: 2 });
    await register("LRN-TWO-USES", "one@example.com");
    await register("LRN-TWO-USES", "two@example.com");
    expect(await errorOf(register("LRN-TWO-USES", "three@example.com"))).toContain("INVITE_EXHAUSTED");
  });

  it("does not consume the code when account creation fails", async () => {
    await createCode({ code: "LRN-SINGLE" });
    await register("LRN-SINGLE", "taken@example.com");
    await createCode({ code: "LRN-RETRY" });
    // Same email again: auth.users unique constraint fails -> whole transaction rolls back.
    const [{ reserve_invitation: res }] = await sql("select reserve_invitation('LRN-RETRY', 'taken@example.com')");
    expect(await errorOf(sql("insert into auth.users (email) values ('taken@example.com')"))).toBeTruthy();
    await sql("select release_invitation($1)", [res]);
    const [code] = await sql("select usage_count from invitation_codes where code = 'LRN-RETRY'");
    expect(code.usage_count).toBe(0);
    // Code is still usable by someone else.
    await register("LRN-RETRY", "fresh@example.com");
  });

  it("frees capacity when a reservation expires", async () => {
    await createCode({ code: "LRN-EXPIRES" });
    await sql("select reserve_invitation('LRN-EXPIRES', 'slow@example.com')");
    expect(await errorOf(sql("select reserve_invitation('LRN-EXPIRES', 'other@example.com')"))).toContain("INVITE_EXHAUSTED");
    await sql("update invitation_redemptions set reserved_until = now() - interval '1 minute'");
    await register("LRN-EXPIRES", "other@example.com");
    // The stale reservation can no longer create an account.
    expect(await errorOf(sql("insert into auth.users (email) values ('slow@example.com')"))).toContain("INVITE_REQUIRED");
  });

  it("never exceeds the limit under concurrent redemption", async () => {
    await createCode({ code: "LRN-RACE", limit: 3 });
    const attempts = Array.from({ length: 15 }, (_, i) => register("LRN-RACE", `racer${i}@example.com`).then(() => "ok", (e: Error) => e.message));
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === "ok")).toHaveLength(3);
    const [code] = await sql("select usage_count from invitation_codes where code = 'LRN-RACE'");
    expect(code.usage_count).toBe(3);
    expect(await sql("select * from profiles")).toHaveLength(3);
  });

  it("grants premium for the configured period", async () => {
    await createCode({ code: "LRN-PREMIUM", plan: "premium", days: 30 });
    const { userId } = await register("LRN-PREMIUM", "vip@example.com");
    const [{ effective_plan }] = await sql("select effective_plan($1)", [userId]);
    expect(effective_plan).toBe("premium");
    await sql("update subscriptions set current_period_end = now() - interval '1 day' where source = 'invitation'");
    const [{ effective_plan: after }] = await sql("select effective_plan($1)", [userId]);
    expect(after).toBe("free");
  });

  it("locks private invitations to their email", async () => {
    await createCode({ code: "LRN-PRIVATE", email: "only@example.com" });
    expect(await errorOf(sql("select reserve_invitation('LRN-PRIVATE', 'someone@example.com')"))).toContain("INVITE_INVALID");
    await register("LRN-PRIVATE", "ONLY@example.com");
  });

  it("keeps invitation functions away from browser roles", async () => {
    await createCode({ code: "LRN-HIDDEN" });
    expect(await errorOf(asUser(null, (c) => c.query("select reserve_invitation('LRN-HIDDEN', 'a@b.com')")))).toContain("permission denied");
    const rows = await asUser(null, (c) => c.query("select * from invitation_codes"));
    expect(rows.rows).toHaveLength(0);
  });
});

describe("data isolation and authorization", () => {
  async function twoUsers() {
    await createCode({ code: "LRN-USERS", limit: 5 });
    const a = (await register("LRN-USERS", "alice@example.com")).userId;
    const b = (await register("LRN-USERS", "bob@example.com")).userId;
    return { a, b };
  }

  it("users only see their own lessons and cannot write into others' rows", async () => {
    const { a, b } = await twoUsers();
    await asUser(a, (c) => c.query("insert into lessons (user_id, title) values ($1, 'Alice biology')", [a]));
    const seenByB = await asUser(b, (c) => c.query("select * from lessons"));
    expect(seenByB.rows).toHaveLength(0);
    expect(await errorOf(asUser(b, (c) => c.query("insert into lessons (user_id, title) values ($1, 'forged')", [a])))).toContain("row-level security");
    const upd = await asUser(b, (c) => c.query("update lessons set title = 'hacked'"));
    expect(upd.rowCount).toBe(0);
  });

  it("users cannot grant themselves admin, change plan or edit protected profile fields", async () => {
    const { a } = await twoUsers();
    expect(await errorOf(asUser(a, (c) => c.query("insert into user_roles (user_id, role) values ($1, 'super_admin')", [a])))).toBeTruthy();
    expect(await errorOf(asUser(a, (c) => c.query("insert into subscriptions (user_id, plan_id, status, source) values ($1, 'premium', 'active', 'admin')", [a])))).toBeTruthy();
    expect(await errorOf(asUser(a, (c) => c.query("update profiles set status = 'active', xp = 99999 where id = $1", [a])))).toContain("permission denied");
    const ok = await asUser(a, (c) => c.query("update profiles set full_name = 'Alice B' where id = $1", [a]));
    expect(ok.rowCount).toBe(1);
    expect(await errorOf(asUser(a, (c) => c.query("select admin_set_role($1, 'admin', true)", [a])))).toContain("FORBIDDEN");
    expect(await errorOf(asUser(a, (c) => c.query("select * from admin_generate_invitations(1, 'general', 1, null, 'free', null)")))).toContain("FORBIDDEN");
  });

  it("admins manage codes; super admins manage roles but never their own", async () => {
    const { a, b } = await twoUsers();
    await sql("insert into user_roles (user_id, role) values ($1, 'super_admin')", [a]);
    const gen = await asUser(a, (c) => c.query("select * from admin_generate_invitations(3, 'plus', 10, null, 'plus', 30, 'TEST')"));
    expect(gen.rows).toHaveLength(3);
    expect(gen.rows[0].code).toMatch(/^TEST-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    await asUser(a, (c) => c.query("select admin_update_invitation($1, 'revoked', 10, null)", [gen.rows[0].id]));
    expect(await errorOf(asUser(a, (c) => c.query("select admin_update_invitation($1, 'active', 10, null)", [gen.rows[0].id])))).toContain("REVOKED_IS_FINAL");
    await asUser(a, (c) => c.query("select admin_set_role($1, 'admin', true)", [b]));
    expect(await errorOf(asUser(a, (c) => c.query("select admin_set_role($1, 'admin', false)", [a])))).toContain("CANNOT_CHANGE_OWN_ROLE");
    const audit = await sql("select action from admin_audit_logs");
    expect(audit.map((r) => r.action)).toContain("role_granted");
    const inviteAudit = await sql("select action from invitation_audit_logs where actor_id = $1", [a]);
    expect(inviteAudit.map((r) => r.action)).toEqual(expect.arrayContaining(["created", "updated"]));
    // A plain admin can no longer grant roles.
    expect(await errorOf(asUser(b, (c) => c.query("select admin_set_role($1, 'admin', true)", [a])))).toContain("FORBIDDEN");
  });
});

describe("quotas, rate limits and jobs", () => {
  it("consume_quota respects plan limits and refunds failed jobs", async () => {
    await createCode({ code: "LRN-QUOTA" });
    const { userId } = await register("LRN-QUOTA", "q@example.com");
    const [{ consume_quota: first }] = await sql("select consume_quota($1, 'exams_generated', 3, null, $2)", [userId, "00000000-0000-0000-0000-000000000001"]);
    expect(first).toBe(true);
    const [{ consume_quota: second }] = await sql("select consume_quota($1, 'exams_generated', 1)", [userId]);
    expect(second).toBe(false);
    await sql("select refund_usage('00000000-0000-0000-0000-000000000001')");
    const [{ quota_remaining }] = await sql("select quota_remaining($1, 'exams_generated')", [userId]);
    expect(Number(quota_remaining)).toBe(3);
  });

  it("hit_rate_limit blocks after the maximum", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const [{ hit_rate_limit }] = await sql("select hit_rate_limit('invite:1.2.3.4', 5, 600)");
      results.push(hit_rate_limit);
    }
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("claim_jobs hands each job to exactly one worker", async () => {
    await createCode({ code: "LRN-JOBS" });
    const { userId } = await register("LRN-JOBS", "j@example.com");
    for (let i = 0; i < 6; i++) await sql("insert into processing_jobs (user_id, type) values ($1, 'generate_notes')", [userId]);
    const batches = await Promise.all([1, 2, 3].map(() => sql("select id from claim_jobs(3)")));
    const ids = batches.flat().map((r) => r.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });
});
