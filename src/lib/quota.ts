import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { enqueueJob } from "@/lib/jobs/runner";

export type Metric = "recording_minutes" | "transcription_minutes" | "ai_requests" | "document_uploads" | "exams_generated" | "storage_mb";

export async function remaining(userId: string, metric: Metric): Promise<number> {
  const { data, error } = await createAdminClient().rpc("quota_remaining", { p_user: userId, p_metric: metric });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function consume(userId: string, metric: Metric, amount: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("consume_quota", { p_user: userId, p_metric: metric, p_amount: amount });
  if (error) throw new Error(error.message);
  return data === true;
}

/**
 * Charges the allowance and queues the job as one unit: the usage row is tied to
 * the job id so it is refunded automatically if processing finally fails.
 */
export async function chargeAndEnqueue(opts: {
  userId: string;
  metric: Metric;
  amount: number;
  type: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<{ ok: true; jobId: string } | { ok: false; reason: "QUOTA_EXCEEDED" }> {
  const db = createAdminClient();
  const { data: existing } = await db.from("processing_jobs").select("id, status").eq("idempotency_key", opts.idempotencyKey).maybeSingle();
  if (existing && existing.status !== "failed") return { ok: true, jobId: existing.id }; // already charged

  const temp = crypto.randomUUID();
  const { data: allowed, error } = await db.rpc("consume_quota", {
    p_user: opts.userId, p_metric: opts.metric, p_amount: opts.amount, p_provider: null, p_job: temp, p_cost: 0,
  });
  if (error) throw new Error(error.message);
  if (!allowed) return { ok: false, reason: "QUOTA_EXCEEDED" };
  try {
    const jobId = await enqueueJob({ userId: opts.userId, type: opts.type, payload: opts.payload, idempotencyKey: opts.idempotencyKey });
    await db.from("usage_records").update({ job_id: jobId }).eq("job_id", temp);
    return { ok: true, jobId };
  } catch (e) {
    await db.rpc("refund_usage", { p_job: temp });
    throw e;
  }
}

/**
 * Runs a synchronous AI action against the monthly allowance: charges first,
 * refunds automatically if the action fails, and records the real cost.
 */
export async function withAllowance<T>(
  userId: string,
  metric: Metric,
  amount: number,
  fn: () => Promise<{ value: T; costUsd?: number; provider?: string }>,
): Promise<{ ok: true; value: T } | { ok: false; reason: "QUOTA_EXCEEDED" }> {
  const db = createAdminClient();
  const ref = crypto.randomUUID();
  const { data: allowed, error } = await db.rpc("consume_quota", { p_user: userId, p_metric: metric, p_amount: amount, p_provider: null, p_job: ref, p_cost: 0 });
  if (error) throw new Error(error.message);
  if (!allowed) return { ok: false, reason: "QUOTA_EXCEEDED" };
  try {
    const { value, costUsd, provider } = await fn();
    await db.from("usage_records").update({ cost_usd: Math.round((costUsd ?? 0) * 1e6) / 1e6, provider: provider ?? null }).eq("job_id", ref);
    return { ok: true, value };
  } catch (e) {
    await db.rpc("refund_usage", { p_job: ref });
    throw e;
  }
}
