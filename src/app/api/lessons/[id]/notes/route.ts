import { fail, json, kickWorker, route } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { chargeAndEnqueue } from "@/lib/quota";
import { rateLimit } from "@/lib/security";

// The background worker runs in after() and needs time for transcription and notes.
export const maxDuration = 300;

/** Regenerates AI notes for a lesson (one AI request from the allowance). */
export const POST = route<{ id: string }>(async ({ user, params }) => {
  if (!(await rateLimit(`notes:${user.userId}`, 10, 3600))) return fail("RATE_LIMITED", 429);
  const supabase = await createClient();
  const { data: t } = await supabase.from("transcripts").select("id, text").eq("lesson_id", params.id).limit(1).maybeSingle();
  if (!t?.text?.trim()) return fail("NO_TRANSCRIPT", 409);
  const res = await chargeAndEnqueue({
    userId: user.userId,
    metric: "ai_requests",
    amount: 1,
    type: "generate_notes",
    payload: { lesson_id: params.id },
    idempotencyKey: `notes:${params.id}:regen:${Date.now()}`,
  });
  if (!res.ok) return fail("QUOTA_EXCEEDED", 402);
  kickWorker();
  return json({ ok: true, jobId: res.jobId });
});
