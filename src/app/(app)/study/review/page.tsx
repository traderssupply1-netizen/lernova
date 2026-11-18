import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { Reviewer } from "@/components/study/reviewer";

export const metadata = { title: "Review" };

/** Daily review: every card that is due, across all decks. */
export default async function ReviewPage() {
  await requireUser("/study/review");
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { data: cards } = await supabase
    .from("flashcards")
    .select("id, question, answer, topic")
    .lte("due_at", new Date().toISOString())
    .order("due_at")
    .limit(100);
  return (
    <>
      <PageHeader title={t.study.dailyReview} subtitle={`${cards?.length ?? 0} ${t.study.dueNow}`} />
      <Reviewer t={t} cards={cards ?? []} backHref="/study" />
    </>
  );
}
