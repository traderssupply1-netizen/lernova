import { createAdminClient } from "@/lib/supabase/admin";
import { generateStructured } from "@/lib/ai/provider";
import { notesSchema, notesSystemPrompt, notesUserPrompt, transcriptForPrompt } from "@/lib/ai/notes";
import type { TranscriptSegment } from "@/lib/stt/whisper";
import { notify, type Job, type JobOutcome } from "./runner";

/** Generates quick, detailed and exam notes from a lesson transcript. */
export async function handleGenerateNotes(job: Job): Promise<JobOutcome> {
  const db = createAdminClient();
  const lessonId = String(job.payload.lesson_id);
  const { data: lesson } = await db.from("lessons").select("id, user_id, title, subjects(name)").eq("id", lessonId).single();
  if (!lesson || lesson.user_id !== job.user_id) throw new Error("LESSON_NOT_FOUND");
  const { data: transcript } = await db.from("transcripts").select("segments, text").eq("lesson_id", lessonId).order("created_at", { ascending: false }).limit(1).single();
  if (!transcript?.text?.trim()) throw new Error("EMPTY_TRANSCRIPT");
  const { data: profile } = await db.from("profiles").select("ai_language, ui_language").eq("id", lesson.user_id).single();
  const language = (profile?.ai_language === "en" ? "en" : "hu") as "hu" | "en";
  const subject = (lesson.subjects as unknown as { name: string } | null)?.name ?? null;

  const { data: notes, usage } = await generateStructured({
    system: notesSystemPrompt(language),
    prompt: notesUserPrompt({
      subject,
      title: lesson.title,
      // Documents have plain text without timestamps.
      transcript: (transcript.segments as TranscriptSegment[])?.length ? transcriptForPrompt(transcript.segments as TranscriptSegment[]) : transcript.text.slice(0, 180_000),
    }),
    schema: notesSchema,
    name: "lesson_notes",
    maxTokens: 12000,
  });

  // Replace AI notes for this lesson but keep versions the student edited by hand.
  await db.from("notes").delete().eq("lesson_id", lessonId).eq("edited", false);
  const { data: editedKinds } = await db.from("notes").select("kind").eq("lesson_id", lessonId);
  const keep = new Set((editedKinds ?? []).map((n) => n.kind));
  const common = { user_id: lesson.user_id, lesson_id: lessonId, language, provider: usage.provider, model: usage.model };
  const structured = { topics: notes.topics, key_terms: notes.key_terms, possible_questions: notes.possible_questions, coverage_warning: notes.coverage_warning };
  const rows = [
    { ...common, kind: "quick", title: notes.title, content_md: notes.quick_md, structured },
    { ...common, kind: "detailed", title: notes.title, content_md: notes.detailed_md, structured },
    { ...common, kind: "exam", title: notes.title, content_md: notes.exam_md, structured },
  ].filter((r) => !keep.has(r.kind));
  if (rows.length) {
    const { error } = await db.from("notes").insert(rows);
    if (error) throw new Error(error.message);
  }

  // Record the real token cost against the usage row reserved for this job.
  await db.from("usage_records").update({ cost_usd: usage.costUsd, provider: usage.provider }).eq("job_id", job.id);

  const hu = profile?.ui_language !== "en";
  await notify(lesson.user_id, "notes", hu ? "Elkészültek a jegyzeteid" : "Your notes are ready", lesson.title, `/lessons/${lessonId}`);
  // First-notes achievement (idempotent).
  await db.from("user_achievements").upsert({ user_id: lesson.user_id, achievement_id: "first_notes" }, { onConflict: "user_id,achievement_id", ignoreDuplicates: true });
  return { status: "done", result: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } };
}
