"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const segmentSchema = z.array(z.object({ start: z.number(), end: z.number(), text: z.string().max(5000), low_confidence: z.boolean() })).max(5000);

export async function saveTranscriptAction(lessonId: string, segments: unknown) {
  await requireUser();
  const segs = segmentSchema.parse(segments);
  const supabase = await createClient();
  const { error } = await supabase
    .from("transcripts")
    .update({ segments: segs, text: segs.map((s) => s.text).join(" "), edited: true })
    .eq("lesson_id", z.uuid().parse(lessonId));
  if (error) throw new Error(error.message);
  revalidatePath(`/lessons/${lessonId}`);
}

export async function saveNoteAction(noteId: string, content: string) {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notes")
    .update({ content_md: z.string().max(200_000).parse(content), edited: true })
    .eq("id", z.uuid().parse(noteId));
  if (error) throw new Error(error.message);
}
