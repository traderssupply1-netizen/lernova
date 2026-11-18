import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseLanguage, sttPricePerMinute, transcribeSegment, type TranscriptSegment } from "@/lib/stt/whisper";
import { env } from "@/lib/env";
import { enqueueJob, notify, type Job, type JobContext, type JobOutcome } from "./runner";

type Chunk = {
  id: string;
  chunk_index: number;
  storage_path: string;
  start_offset_seconds: number;
  duration_seconds: number;
  transcript: { text: string; language: string | null; segments: TranscriptSegment[] } | null;
};

/**
 * Transcribes every uploaded segment of a recording, stores per-segment results
 * (so retries resume where they stopped), then assembles the full transcript
 * with global timestamps and queues note generation.
 */
export async function handleTranscribe(job: Job, ctx: JobContext): Promise<JobOutcome> {
  const db = createAdminClient();
  const recordingId = String(job.payload.recording_id);
  const { data: rec, error } = await db
    .from("recordings")
    .select("id, user_id, lesson_id, mime_type, transcription_language")
    .eq("id", recordingId)
    .single();
  if (error || !rec) throw new Error("RECORDING_NOT_FOUND");
  if (rec.user_id !== job.user_id) throw new Error("OWNERSHIP_MISMATCH");

  await db.from("recordings").update({ status: "processing", error: null }).eq("id", rec.id);

  const { data: chunks } = await db
    .from("recording_upload_chunks")
    .select("id, chunk_index, storage_path, start_offset_seconds, duration_seconds, transcript")
    .eq("recording_id", rec.id)
    .order("chunk_index");
  if (!chunks?.length) throw new Error("NO_AUDIO_SEGMENTS");

  const lang = (rec.transcription_language ?? "auto") as "hu" | "en" | "auto";
  for (const chunk of chunks as Chunk[]) {
    if (chunk.transcript) continue;
    if (Date.now() > ctx.deadline - 90_000) return { status: "continue" };
    const { data: file, error: dlError } = await db.storage.from("recordings").download(chunk.storage_path);
    if (dlError || !file) throw new Error(`DOWNLOAD_FAILED:${chunk.chunk_index}`);
    const ext = chunk.storage_path.split(".").pop() ?? "webm";
    const result = await transcribeSegment(await file.arrayBuffer(), `segment-${chunk.chunk_index}.${ext}`, rec.mime_type.split(";")[0], lang, Number(chunk.duration_seconds));
    await db
      .from("recording_upload_chunks")
      .update({ transcript: { text: result.text, language: result.language, segments: result.segments }, transcribed_at: new Date().toISOString() })
      .eq("id", chunk.id);
    chunk.transcript = { text: result.text, language: result.language, segments: result.segments };
  }

  // Assemble with global timestamps.
  const all = chunks as Chunk[];
  const segments: TranscriptSegment[] = all.flatMap((c) =>
    (c.transcript?.segments ?? []).map((s) => ({
      ...s,
      start: Math.round((s.start + Number(c.start_offset_seconds)) * 100) / 100,
      end: Math.round((s.end + Number(c.start_offset_seconds)) * 100) / 100,
    })),
  );
  const text = all.map((c) => c.transcript?.text ?? "").filter(Boolean).join("\n\n");
  const detected = normaliseLanguage(all.find((c) => c.transcript?.language)?.transcript?.language ?? null);

  const { data: existing } = await db.from("transcripts").select("id").eq("recording_id", rec.id).maybeSingle();
  const row = { user_id: rec.user_id, lesson_id: rec.lesson_id, recording_id: rec.id, language: detected ?? (lang === "auto" ? null : lang), text, segments, provider: `openai:${env.whisperModel}`, edited: false };
  if (existing) await db.from("transcripts").update(row).eq("id", existing.id);
  else await db.from("transcripts").insert(row);

  // Record the real transcription cost against the minutes reserved for this job.
  const minutes = all.reduce((a, c) => a + Number(c.duration_seconds), 0) / 60;
  await db.from("usage_records").update({ cost_usd: Math.round(minutes * sttPricePerMinute() * 1e6) / 1e6, provider: env.whisperModel }).eq("job_id", job.id);

  if (detected) await db.from("lessons").update({ language: detected }).eq("id", rec.lesson_id);
  await db.from("recordings").update({ status: "ready" }).eq("id", rec.id);

  const { data: lesson } = await db.from("lessons").select("title").eq("id", rec.lesson_id).single();
  const { data: profile } = await db.from("profiles").select("ui_language").eq("id", rec.user_id).single();
  const hu = profile?.ui_language !== "en";
  await notify(rec.user_id, "transcription", hu ? "Elkészült az átirat" : "Transcript ready", lesson?.title ?? null, `/lessons/${rec.lesson_id}`);

  // Notes: one AI request from the monthly allowance; skipped (not failed) when exhausted.
  const notesJob = crypto.randomUUID();
  const { data: allowed } = await db.rpc("consume_quota", { p_user: rec.user_id, p_metric: "ai_requests", p_amount: 1, p_provider: null, p_job: notesJob, p_cost: 0 });
  if (allowed && text.trim().length > 0) {
    const id = await enqueueJob({ userId: rec.user_id, type: "generate_notes", payload: { lesson_id: rec.lesson_id }, idempotencyKey: `notes:${rec.lesson_id}:${rec.id}` });
    await db.from("usage_records").update({ job_id: id }).eq("job_id", notesJob);
  } else if (!allowed) {
    await db.from("usage_records").delete().eq("job_id", notesJob);
    await notify(rec.user_id, "notes", hu ? "Elfogyott a havi AI-kereted" : "Monthly AI allowance used up", hu ? "A jegyzetek a következő hónapban készíthetők el." : "Notes can be generated next month.", `/lessons/${rec.lesson_id}`);
  }
  return { status: "done", result: { segments: segments.length, chars: text.length } };
}
