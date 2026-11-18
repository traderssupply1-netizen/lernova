import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { ConfigError } from "@/lib/env";
import { handleTranscribe } from "./transcribe";
import { handleGenerateNotes } from "./notes";

export type Job = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

/** A handler returns "continue" when it ran out of time and should be resumed. */
export type JobOutcome = { status: "done"; result?: unknown } | { status: "continue" };
export type JobContext = { deadline: number };

const HANDLERS: Record<string, (job: Job, ctx: JobContext) => Promise<JobOutcome>> = {
  transcribe_recording: handleTranscribe,
  generate_notes: handleGenerateNotes,
};

export async function enqueueJob(job: { userId: string; type: string; payload: Record<string, unknown>; idempotencyKey?: string }) {
  const db = createAdminClient();
  // Idempotent: a repeated request with the same key returns the existing job untouched.
  const { data, error } = await db
    .from("processing_jobs")
    .upsert(
      { user_id: job.userId, type: job.type, payload: job.payload, idempotency_key: job.idempotencyKey ?? null, status: "queued" },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`ENQUEUE_FAILED: ${error.message}`);
  if (data?.[0]) return data[0].id as string;
  const { data: existing } = await db.from("processing_jobs").select("id").eq("idempotency_key", job.idempotencyKey!).single();
  return existing!.id as string;
}

export async function notify(userId: string, kind: string, title: string, body: string | null, link: string | null) {
  const db = createAdminClient();
  const { data: profile } = await db.from("profiles").select("notification_prefs").eq("id", userId).single();
  const prefs = (profile?.notification_prefs ?? {}) as Record<string, boolean>;
  if (prefs[kind] === false) return;
  await db.from("notifications").insert({ user_id: userId, kind, title, body, link });
}

async function onFinalFailure(job: Job, message: string) {
  const db = createAdminClient();
  await db.rpc("refund_usage", { p_job: job.id }); // never bill failed processing
  if (job.type === "transcribe_recording" && typeof job.payload.recording_id === "string") {
    await db.from("recordings").update({ status: "failed", error: message.slice(0, 500) }).eq("id", job.payload.recording_id);
  }
}

/**
 * Processes queued jobs until the time budget is used. Safe to call from many
 * places at once (cron, after() hooks): claim_jobs uses SKIP LOCKED.
 */
export async function runJobs({ budgetMs = 240_000, batch = 2 } = {}) {
  const db = createAdminClient();
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  while (Date.now() < deadline - 20_000) {
    const { data: jobs, error } = await db.rpc("claim_jobs", { p_limit: batch });
    if (error) throw new Error(error.message);
    if (!jobs?.length) break;
    await Promise.all(
      (jobs as Job[]).map(async (job) => {
        const handler = HANDLERS[job.type];
        try {
          if (!handler) throw new Error(`NO_HANDLER:${job.type}`);
          const outcome = await handler(job, { deadline });
          if (outcome.status === "continue") {
            await db.rpc("requeue_job", { p_job: job.id });
            return;
          }
          await db
            .from("processing_jobs")
            .update({ status: "succeeded", result: outcome.result ?? null, completed_at: new Date().toISOString(), error: null })
            .eq("id", job.id);
        } catch (e) {
          const message = e instanceof ConfigError ? e.message : e instanceof Error ? e.message : String(e);
          console.error(`job ${job.id} (${job.type}) failed`, message);
          const final = e instanceof ConfigError || job.attempts >= job.max_attempts;
          if (final) {
            await db.from("processing_jobs").update({ status: "failed", error: message.slice(0, 2000), completed_at: new Date().toISOString() }).eq("id", job.id);
            await onFinalFailure(job, message);
          } else {
            const backoff = 30_000 * 2 ** (job.attempts - 1);
            await db
              .from("processing_jobs")
              .update({ status: "queued", error: message.slice(0, 2000), locked_at: null, run_after: new Date(Date.now() + backoff).toISOString() })
              .eq("id", job.id);
          }
        } finally {
          processed++;
        }
      }),
    );
  }
  return { processed };
}
