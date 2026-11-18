import { fail, json, kickWorker, route } from "@/lib/api";
import { extractText, MIN_TEXT_CHARS } from "@/lib/documents/extract";
import { chargeAndEnqueue, withAllowance } from "@/lib/quota";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const MAX_STORED_CHARS = 400_000;

/**
 * Step 2: extracts the text, turns the document into a lesson (so notes, flashcards,
 * exams and the tutor work the same way) and queues AI notes.
 * Uses one document upload from the allowance; nothing is charged if extraction fails.
 */
export const POST = route<{ id: string }>(async ({ user, params }) => {
  const db = createAdminClient();
  const { data: doc } = await db.from("documents").select("*").eq("id", params.id).maybeSingle();
  if (!doc || doc.user_id !== user.userId) return fail("NOT_FOUND", 404);
  const { data: existing } = await db.from("lessons").select("id").eq("document_id", doc.id).maybeSingle();
  if (existing) return json({ lessonId: existing.id }); // idempotent

  const res = await withAllowance(user.userId, "document_uploads", 1, async () => {
    await db.from("documents").update({ status: "processing", error: null }).eq("id", doc.id);
    const { data: file, error } = await db.storage.from("documents").download(doc.storage_path);
    if (error || !file) throw new Error("UPLOAD_MISSING");
    const text = await extractText(await file.arrayBuffer(), doc.mime_type);
    if (text.length < MIN_TEXT_CHARS) throw new Error("NO_TEXT");
    return { value: text.slice(0, MAX_STORED_CHARS) };
  }).catch(async (e: Error) => {
    const code = ["NO_TEXT", "UPLOAD_MISSING", "UNSUPPORTED_TYPE"].includes(e.message) ? e.message : "EXTRACT_FAILED";
    await db.from("documents").update({ status: "failed", error: code }).eq("id", doc.id);
    return { ok: false as const, reason: code };
  });
  if (!res.ok) return fail(res.reason, res.reason === "QUOTA_EXCEEDED" ? 402 : 422);

  const title = doc.file_name.replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 160) || "Document";
  const { data: profile } = await db.from("profiles").select("ai_language").eq("id", user.userId).single();
  const { data: lesson, error: lErr } = await db
    .from("lessons")
    .insert({ user_id: user.userId, subject_id: doc.subject_id, title, document_id: doc.id, language: profile?.ai_language === "en" ? "en" : "hu" })
    .select("id")
    .single();
  if (lErr) return fail("INTERNAL", 500);
  await db.from("transcripts").insert({ user_id: user.userId, lesson_id: lesson.id, text: res.value, segments: [], provider: "document" });
  await db.from("documents").update({ status: "ready", extracted_text: res.value }).eq("id", doc.id);

  const notes = await chargeAndEnqueue({
    userId: user.userId,
    metric: "ai_requests",
    amount: 1,
    type: "generate_notes",
    payload: { lesson_id: lesson.id },
    idempotencyKey: `notes:${lesson.id}:doc`,
  });
  if (notes.ok) kickWorker();
  return json({ lessonId: lesson.id, notesQueued: notes.ok });
});
