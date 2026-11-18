import { z } from "zod";
import { body, fail, json, route } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MAX_STT_BYTES } from "@/lib/stt/whisper";

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/x-m4a": "m4a" };

const requestSchema = z.object({
  index: z.number().int().min(0).max(999),
  size: z.number().int().min(1).max(MAX_STT_BYTES),
});

const completeSchema = z.object({
  index: z.number().int().min(0).max(999),
  startOffset: z.number().min(0).max(86400),
  duration: z.number().min(0).max(3600),
});

async function ownedRecording(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("recordings").select("id, user_id, status, mime_type").eq("id", id).maybeSingle();
  return { supabase, rec: data };
}

/** Step 1: returns a short-lived signed upload URL for one audio segment. */
export const POST = route<{ id: string }>(async ({ user, req, params }) => {
  const d = await body(req, requestSchema);
  const { supabase, rec } = await ownedRecording(params.id);
  if (!rec) return fail("NOT_FOUND", 404);
  if (!["recording", "uploading", "uploaded", "failed"].includes(rec.status)) return fail("LOCKED", 409);
  const ext = EXT[rec.mime_type.split(";")[0]] ?? "webm";
  const path = `${user.userId}/${rec.id}/seg-${String(d.index).padStart(3, "0")}.${ext}`;
  const { data, error } = await supabase.storage.from("recordings").createSignedUploadUrl(path, { upsert: true });
  if (error) return fail("SIGN_FAILED", 500);
  return json({ path, token: data.token, signedUrl: data.signedUrl });
});

/** Step 2: confirms the upload landed in storage and records the segment. Idempotent. */
export const PUT = route<{ id: string }>(async ({ user, req, params }) => {
  const d = await body(req, completeSchema);
  const { supabase, rec } = await ownedRecording(params.id);
  if (!rec) return fail("NOT_FOUND", 404);
  const ext = EXT[rec.mime_type.split(";")[0]] ?? "webm";
  const name = `seg-${String(d.index).padStart(3, "0")}.${ext}`;
  const { data: files, error } = await supabase.storage.from("recordings").list(`${user.userId}/${rec.id}`, { search: name, limit: 1 });
  const file = files?.find((f) => f.name === name);
  if (error || !file) return fail("UPLOAD_MISSING", 409);
  const size = Number((file.metadata as { size?: number } | null)?.size ?? 0);
  const { error: insErr } = await supabase.from("recording_upload_chunks").upsert(
    {
      user_id: user.userId,
      recording_id: rec.id,
      chunk_index: d.index,
      storage_path: `${user.userId}/${rec.id}/${name}`,
      start_offset_seconds: d.startOffset,
      duration_seconds: d.duration,
      size_bytes: size,
      transcript: null,
    },
    { onConflict: "recording_id,chunk_index" },
  );
  if (insErr) return fail("CHUNK_FAILED", 500);
  if (rec.status === "recording") await supabase.from("recordings").update({ status: "uploading" }).eq("id", rec.id);
  return json({ ok: true });
});
