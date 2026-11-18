import { fail, json, route } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

/** Signed (1 hour) playback URLs for each segment, in order, with their time offsets. */
export const GET = route<{ id: string }>(async ({ params }) => {
  const supabase = await createClient();
  const { data: chunks } = await supabase
    .from("recording_upload_chunks")
    .select("storage_path, start_offset_seconds, duration_seconds, chunk_index, recordings!inner(lesson_id)")
    .eq("recordings.lesson_id", params.id)
    .order("chunk_index");
  if (!chunks?.length) return fail("NOT_FOUND", 404);
  const { data: signed, error } = await supabase.storage.from("recordings").createSignedUrls(chunks.map((c) => c.storage_path), 3600);
  if (error || !signed) return fail("SIGN_FAILED", 500);
  return json({
    segments: chunks.map((c, i) => ({ url: signed[i]?.signedUrl, start: Number(c.start_offset_seconds), duration: Number(c.duration_seconds) })),
  });
});
