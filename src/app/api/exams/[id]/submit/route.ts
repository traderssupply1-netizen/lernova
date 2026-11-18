import { z } from "zod";
import { body, fail, json, route } from "@/lib/api";
import { generateStructured } from "@/lib/ai/provider";
import { checkObjective, gradePrompt, gradeSchema, type Lang } from "@/lib/ai/study";
import { withAllowance } from "@/lib/quota";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const schema = z.object({ answers: z.record(z.string(), z.string().max(4000)) });

/**
 * Scores an attempt. Objective questions are checked exactly; written answers are
 * graded by AI (one AI request). If the allowance is used up, written answers are
 * left ungraded and the model answer is shown instead.
 */
export const POST = route<{ id: string }>(async ({ user, req, params }) => {
  const { answers } = await body(req, schema);
  const supabase = await createClient();
  const { data: exam } = await supabase.from("exams").select("id, language").eq("id", params.id).maybeSingle();
  if (!exam) return fail("NOT_FOUND", 404);
  const { data: questions } = await supabase.from("exam_questions").select("id, type, prompt, correct_answer, topic").eq("exam_id", exam.id).order("position");
  if (!questions?.length) return fail("NOT_FOUND", 404);

  const results = new Map<string, { points: number | null; correct: boolean | null; feedback: string | null }>();
  const written = questions.filter((q) => q.type === "short_answer");
  for (const q of questions) {
    if (q.type !== "short_answer") {
      const ok = checkObjective(q.type, q.correct_answer, answers[q.id] ?? null);
      results.set(q.id, { points: ok ? 1 : 0, correct: ok, feedback: null });
    }
  }

  let summary: string | null = null;
  let graded = true;
  const toGrade = written.filter((q) => (answers[q.id] ?? "").trim());
  for (const q of written) if (!(answers[q.id] ?? "").trim()) results.set(q.id, { points: 0, correct: false, feedback: null });
  if (toGrade.length) {
    const res = await withAllowance(user.userId, "ai_requests", 1, async () => {
      const { system, prompt } = gradePrompt(exam.language as Lang, toGrade.map((q) => ({ question_id: q.id, prompt: q.prompt, model_answer: q.correct_answer ?? "", student_answer: answers[q.id] })));
      const { data, usage } = await generateStructured({ system, prompt, schema: gradeSchema, name: "grade_answers", maxTokens: 3000 });
      return { value: data, costUsd: usage.costUsd, provider: usage.provider };
    }).catch(() => null);
    if (res?.ok) {
      summary = res.value.summary;
      for (const q of toGrade) {
        const r = res.value.results.find((x) => x.question_id === q.id);
        const score = r ? Math.round(Math.min(1, Math.max(0, r.score)) * 2) / 2 : 0;
        results.set(q.id, { points: score, correct: score >= 1, feedback: r?.feedback ?? null });
      }
    } else {
      graded = false;
      for (const q of toGrade) results.set(q.id, { points: null, correct: null, feedback: null });
    }
  }

  const scored = [...results.values()].filter((r) => r.points !== null);
  const score = scored.length ? Math.round((scored.reduce((a, r) => a + (r.points ?? 0), 0) / scored.length) * 1000) / 10 : null;
  const weak = [...new Set(questions.filter((q) => results.get(q.id)?.correct === false && q.topic).map((q) => q.topic as string))].slice(0, 8);

  const { data: attempt, error } = await supabase
    .from("exam_attempts")
    .insert({ user_id: user.userId, exam_id: exam.id, submitted_at: new Date().toISOString(), score, weak_topics: weak, feedback: summary })
    .select("id")
    .single();
  if (error) return fail("INTERNAL", 500);
  const { error: aErr } = await supabase.from("exam_answers").insert(
    questions.map((q) => {
      const r = results.get(q.id)!;
      return { user_id: user.userId, attempt_id: attempt.id, question_id: q.id, answer: answers[q.id] ?? null, is_correct: r.correct, points: r.points, feedback: r.feedback };
    }),
  );
  if (aErr) return fail("INTERNAL", 500);
  return json({ attemptId: attempt.id, score, graded });
});
