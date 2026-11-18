import { z } from "zod";
import { body, fail, json, route } from "@/lib/api";
import { generateStructured } from "@/lib/ai/provider";
import { flashcardsPrompt, flashcardsSchema, loadLessonSource } from "@/lib/ai/study";
import { withAllowance } from "@/lib/quota";
import { rateLimit } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/** Generates a flashcard deck from a lesson (one AI request from the allowance). */
export const POST = route<{ id: string }>(async ({ user, req, params }) => {
  const { count } = await body(req, z.object({ count: z.number().int().min(5).max(30).default(15) }));
  if (!(await rateLimit(`ai:${user.userId}`, 30, 3600))) return fail("RATE_LIMITED", 429);
  const src = await loadLessonSource(params.id, user.userId);
  if (!src) return fail("NO_MATERIAL", 409);

  const res = await withAllowance(user.userId, "ai_requests", 1, async () => {
    const { system, prompt } = flashcardsPrompt(src, count);
    const { data, usage } = await generateStructured({ system, prompt, schema: flashcardsSchema, name: "flashcards", maxTokens: 6000 });
    const cards = data.cards.filter((c) => c.question.trim() && c.answer.trim()).slice(0, count);
    if (!cards.length) throw new Error("NO_CARDS");
    const db = createAdminClient();
    const { data: set, error } = await db
      .from("flashcard_sets")
      .insert({ user_id: user.userId, lesson_id: src.id, title: (data.title || src.title).slice(0, 160) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { error: cardsError } = await db.from("flashcards").insert(
      cards.map((c) => ({
        user_id: user.userId,
        set_id: set.id,
        question: c.question.slice(0, 2000),
        answer: c.answer.slice(0, 4000),
        topic: c.topic?.slice(0, 200) || null,
        difficulty: Math.min(3, Math.max(1, Math.round(c.difficulty || 2))),
        source: "ai",
      })),
    );
    if (cardsError) {
      await db.from("flashcard_sets").delete().eq("id", set.id);
      throw new Error(cardsError.message);
    }
    return { value: { setId: set.id as string, count: cards.length }, costUsd: usage.costUsd, provider: usage.provider };
  });
  if (!res.ok) return fail("QUOTA_EXCEEDED", 402);
  return json(res.value);
});
