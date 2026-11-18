import { fail, json, route } from "@/lib/api";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";

const BUCKETS = ["recordings", "documents", "exports", "avatars"] as const;

async function listAll(bucket: string, prefix: string, db: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const out: string[] = [];
  const { data } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    if (item.id === null) out.push(...(await listAll(bucket, path, db))); // folder
    else out.push(path);
  }
  return out;
}

/** GDPR data export: everything the user owns, as JSON. */
export const GET = route(async ({ user }) => {
  if (!(await rateLimit(`export:${user.userId}`, 5, 3600))) return fail("RATE_LIMITED", 429);
  const supabase = await createClient();
  const tables = ["profiles", "subjects", "lessons", "recordings", "transcripts", "notes", "documents", "flashcard_sets", "flashcards", "exams", "exam_attempts", "tutor_conversations", "tutor_messages", "study_tasks", "study_sessions", "subscriptions", "usage_records", "user_achievements", "notifications"] as const;
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), user_id: user.userId };
  for (const t of tables) {
    const { data } = await supabase.from(t).select("*").limit(50000);
    out[t] = data ?? [];
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="lernova-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});

/** Permanently deletes the account: files first, then the auth user (rows cascade). */
export const DELETE = route(async ({ user, req }) => {
  const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (confirm !== "DELETE" && confirm !== "TÖRLÉS") return fail("CONFIRMATION_REQUIRED", 422);
  if (user.isSuperAdmin) return fail("SUPER_ADMIN_CANNOT_SELF_DELETE", 409);
  const db = createAdminClient();
  for (const bucket of BUCKETS) {
    const paths = await listAll(bucket, user.userId, db);
    for (let i = 0; i < paths.length; i += 500) {
      const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 500));
      if (error) return fail("STORAGE_DELETE_FAILED", 500);
    }
  }
  await db.from("admin_audit_logs").insert({ actor_id: null, action: "account_self_deleted", target_type: "user", target_id: user.userId, details: {} });
  const { error } = await db.auth.admin.deleteUser(user.userId);
  if (error) return fail("DELETE_FAILED", 500);
  const supabase = await createClient();
  await supabase.auth.signOut().catch(() => undefined);
  return json({ ok: true });
});
