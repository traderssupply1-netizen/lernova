import { z } from "zod";
import { body, fail, json, kickWorker, route } from "@/lib/api";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { chargeAndEnqueue } from "@/lib/quota";

const schema = z.object({ retry: z.boolean().optional() });

/**
 * Marks the recording complete, bills recording minutes once, and queues
 * transcription (charged against the transcription allowance, refunded on failure).
 */
export const POST = route<{ id: string }>(async ({ user, req, params }) => {
  const d = await body(req, schema);
  const supabase = await createClient();
  const { data: rec } = await supabase.from("recordings").select("id, status, finalized_at").eq("id", params.id).maybeSingle();
  if (!rec) return fail("NOT_FOUND", 404);

  const { data: chunks } = await supabase.from("recording_upload_chunks").select("start_offset_seconds, duration_seconds, size_bytes").eq("recording_id", rec.id);
  if (!chunks?.length) return fail("NO_AUDIO", 409);
  const duration = Math.max(...chunks.map((c) => Number(c.start_offset_seconds) + Number(c.duration_seconds)));
  const size = chunks.reduce((a, c) => a + Number(c.size_bytes), 0);
  const minutes = Math.max(1, Math.ceil(duration / 60));
  const admin = createAdminClient();

  if (!rec.finalized_at) {
    // Recording minutes: the user has already recorded, so this is recorded as usage
    // even if it exceeds the allowance (the recorder stops at the limit client-side).
    await admin.from("usage_records").insert({ user_id: user.userId, metric: "recording_minutes", amount: minutes });
    await admin.from("usage_records").insert({ user_id: user.userId, metric: "storage_mb", amount: Math.round((size / 1048576) * 1000) / 1000 });
    await supabase
      .from("recordings")
      .update({ status: "uploaded", duration_seconds: duration, size_bytes: size, finalized_at: new Date().toISOString() })
      .eq("id", rec.id);
    await admin.from("user_achievements").upsert({ user_id: user.userId, achievement_id: "first_recording" }, { onConflict: "user_id,achievement_id", ignoreDuplicates: true });
    await admin.from("study_sessions").insert({ user_id: user.userId, activity: "recording", duration_seconds: Math.round(duration), started_at: new Date(Date.now() - duration * 1000).toISOString() });
  } else if (!d.retry && rec.status !== "uploaded") {
    return json({ ok: true, status: rec.status });
  }

  const charge = await chargeAndEnqueue({
    userId: user.userId,
    metric: "transcription_minutes",
    amount: minutes,
    type: "transcribe_recording",
    payload: { recording_id: rec.id },
    idempotencyKey: d.retry ? `transcribe:${rec.id}:${Date.now()}` : `transcribe:${rec.id}`,
  });
  if (!charge.ok) {
    await supabase.from("recordings").update({ error: "QUOTA_EXCEEDED" }).eq("id", rec.id);
    return fail("QUOTA_EXCEEDED", 402);
  }
  if (d.retry) await supabase.from("recordings").update({ status: "uploaded", error: null }).eq("id", rec.id);
  kickWorker();
  return json({ ok: true, jobId: charge.jobId });
});
