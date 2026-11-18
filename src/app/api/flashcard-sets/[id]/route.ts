import { fail, json, route } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

/** Deletes one of the user's decks (cards and reviews cascade). */
export const DELETE = route<{ id: string }>(async ({ params }) => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("flashcard_sets").delete().eq("id", params.id).select("id");
  if (error) return fail("INTERNAL", 500);
  if (!data?.length) return fail("NOT_FOUND", 404);
  return json({ ok: true });
});
