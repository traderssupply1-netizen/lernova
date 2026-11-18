import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Deletes audio files of recordings older than the configured retention period.
 * Transcripts, notes and everything generated from them are kept. Runs from the
 * daily scheduled job; safe to run repeatedly.
 */
export async function purgeOldAudio({ maxRecordings = 200 } = {}) {
  const db = createAdminClient();
  const { data: setting } = await db.from("app_settings").select("value").eq("key", "audio_retention_days").maybeSingle();
  const days = Math.max(1, Number(setting?.value ?? 30) || 30);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: recs, error } = await db
    .from("recordings")
    .select("id")
    .is("audio_deleted_at", null)
    .in("status", ["ready", "failed"])
    .lt("created_at", cutoff)
    .limit(maxRecordings);
  if (error) throw new Error(error.message);

  let files = 0;
  for (const rec of recs ?? []) {
    const { data: chunks } = await db.from("recording_upload_chunks").select("storage_path").eq("recording_id", rec.id);
    const paths = (chunks ?? []).map((c) => c.storage_path);
    if (paths.length) {
      const { error: rmError } = await db.storage.from("recordings").remove(paths);
      if (rmError) {
        console.error("audio purge failed", rec.id, rmError.message);
        continue;
      }
      files += paths.length;
    }
    await db.from("recordings").update({ audio_deleted_at: new Date().toISOString() }).eq("id", rec.id);
  }
  return { recordings: recs?.length ?? 0, files, retentionDays: days };
}
