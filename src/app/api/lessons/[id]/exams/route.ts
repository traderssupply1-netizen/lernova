import { z } from "zod";
import { body, fail, json, route } from "@/lib/api";
import { generateStructured } from "@/lib/ai/provider";
import { examPrompt, examSchema, loadLessonSource, QUESTION_TYPES } from "@/lib/ai/study";
import { withAllowance } from "@/lib/quota";
import { rateLimit } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const schema = z.object({
  count: z.number().int().min(3).max(20).default(10),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  types: z.array(z.enum(QUESTION_TYPES)).min(1).default(["multiple_choice", "true_false", "short_answer"]),
});

/** Generates a practice exam from a lesson (one exam from the monthly allowance). */
export const POST = route<{ id: string }>(async ({ user, req, params }) => {
  const opts = await body(req, schema);
  if (!(await rateLimit(`ai:${user.userId}`, 30, 3600))) return fail("RATE_LIMITED", 429);
  const src = await loadLessonSource(params.id, user.userId);
  if (!src) return fail("NO_MATERIAL", 409);

  const res = await withAllowance(user.userId, "exams_generated", 1, async () => {
    const { system, prompt } = examPrompt(src, opts);
    const { data, usage } = await generateStructured({ system, prompt, schema: examSchema, name: "practice_exam", maxTokens: 8000 });
    const questions = data.questions
      .filter((q) => opts.types.includes(q.type) && q.prompt.trim())
      .map((q) => {
        if (q.type === "multiple_choice") {
          const options = (q.options ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 6);
          // The correct answer must be one of the options, otherwise the question cannot be scored.
          const want = q.correct_answer.trim().toLowerCase();
          const letter = /^[a-f]\)?$/.test(want) ? options[want.charCodeAt(0) - 97] : undefined; // "B" or "b)"
          const correct = options.find((o) => o.toLowerCase() === want) ?? letter ?? options.find((o) => o.toLowerCase().includes(want) || want.includes(o.toLowerCase()));
          return options.length >= 2 && correct ? { ...q, options, correct_answer: correct } : null;
        }
        if (q.type === "true_false") {
          const v = q.correct_answer.trim().toLowerCase();
          return { ...q, options: null, correct_answer: v === "true" || v === "igaz" ? "true" : "false" };
        }
        return { ...q, options: null };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null)
      .slice(0, opts.count);
    if (!questions.length) throw new Error("NO_QUESTIONS");

    const db = createAdminClient();
    const { data: exam, error } = await db
      .from("exams")
      .insert({ user_id: user.userId, lesson_id: src.id, title: (data.title || src.title).slice(0, 160), difficulty: opts.difficulty, question_types: opts.types, language: src.language })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { error: qErr } = await db.from("exam_questions").insert(
      questions.map((q, i) => ({
        user_id: user.userId,
        exam_id: exam.id,
        position: i + 1,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        topic: q.topic || null,
      })),
    );
    if (qErr) {
      await db.from("exams").delete().eq("id", exam.id);
      throw new Error(qErr.message);
    }
    return { value: { examId: exam.id as string }, costUsd: usage.costUsd, provider: usage.provider };
  });
  if (!res.ok) return fail("QUOTA_EXCEEDED", 402);
  return json(res.value);
});
