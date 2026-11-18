import { z } from "zod";
import { body, fail, json, route } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

/** Records a review (SM-2 grade 0-5) for one of the user's own cards. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const { grade } = await body(req, z.object({ grade: z.number().int().min(0).max(5) }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_flashcard", { p_card: params.id, p_grade: grade });
  if (error) return fail(error.message.includes("NOT_FOUND") ? "NOT_FOUND" : "INTERNAL", error.message.includes("NOT_FOUND") ? 404 : 500);
  const card = data as { due_at: string; interval_days: number };
  return json({ dueAt: card.due_at, intervalDays: card.interval_days });
});
