import { z } from "zod";
import { body, fail, json, route } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

export const PATCH = route<{ id: string }>(async ({ req, params }) => {
  const d = await body(req, z.object({ title: z.string().trim().min(1).max(160) }));
  const supabase = await createClient();
  const { data, error } = await supabase.from("lessons").update({ title: d.title }).eq("id", params.id).select("id");
  if (error) return fail("UPDATE_FAILED", 500);
  if (!data?.length) return fail("NOT_FOUND", 404);
  return json({ ok: true });
});

/** Deletes the lesson with its audio files, transcript and notes. */
export const DELETE = route<{ id: string }>(async ({ params }) => {
  const supabase = await createClient();
  const { data: lesson } = await supabase.from("lessons").select("id").eq("id", params.id).maybeSingle();
  if (!lesson) return fail("NOT_FOUND", 404);
  const { data: chunks } = await supabase
    .from("recording_upload_chunks")
    .select("storage_path, recordings!inner(lesson_id)")
    .eq("recordings.lesson_id", lesson.id);
  const paths = (chunks ?? []).map((c) => c.storage_path);
  if (paths.length) {
    const { error } = await supabase.storage.from("recordings").remove(paths);
    if (error) return fail("STORAGE_DELETE_FAILED", 500);
  }
  const { error } = await supabase.from("lessons").delete().eq("id", lesson.id);
  if (error) return fail("DELETE_FAILED", 500);
  return json({ ok: true });
});
