import { z } from "zod";
import { body, fail, json, route } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { remaining } from "@/lib/quota";

const schema = z.object({
  subjectId: z.uuid().nullable().optional(),
  newSubject: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(160),
  language: z.enum(["hu", "en", "auto"]),
  mimeType: z.string().regex(/^audio\/(webm|mp4|ogg|mpeg|aac|x-m4a)(;.*)?$/),
  consent: z.literal(true),
});

/** Creates the lesson + recording before the first byte is captured. */
export const POST = route(async ({ user, req }) => {
  const d = await body(req, schema);
  const minutesLeft = await remaining(user.userId, "recording_minutes");
  if (minutesLeft < 1) return fail("QUOTA_EXCEEDED", 402);

  const supabase = await createClient();
  let subjectId = d.subjectId ?? null;
  if (!subjectId && d.newSubject) {
    const { data: s, error } = await supabase
      .from("subjects")
      .upsert({ user_id: user.userId, name: d.newSubject }, { onConflict: "user_id,name" })
      .select("id")
      .single();
    if (error) return fail("SUBJECT_FAILED", 400);
    subjectId = s.id;
  }
  const { data: lesson, error: le } = await supabase
    .from("lessons")
    .insert({ user_id: user.userId, subject_id: subjectId, title: d.title, language: d.language === "auto" ? null : d.language })
    .select("id")
    .single();
  if (le) return fail("LESSON_FAILED", 400);
  const { data: rec, error: re } = await supabase
    .from("recordings")
    .insert({
      user_id: user.userId,
      lesson_id: lesson.id,
      mime_type: d.mimeType,
      transcription_language: d.language,
      consent_confirmed_at: new Date().toISOString(),
      status: "recording",
    })
    .select("id")
    .single();
  if (re) return fail("RECORDING_FAILED", 400);
  return json({ recordingId: rec.id, lessonId: lesson.id, minutesLeft: Math.floor(minutesLeft) }, 201);
});
