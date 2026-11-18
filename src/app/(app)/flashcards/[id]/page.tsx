import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { buttonClass, PageHeader } from "@/components/ui";
import { Reviewer } from "@/components/study/reviewer";
import { DeleteDeck } from "./delete-deck";

export const metadata = { title: "Flashcards" };

export default async function FlashcardSetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ all?: string }> }) {
  const { id } = await params;
  const { all } = await searchParams;
  await requireUser(`/flashcards/${id}`);
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { data: set } = await supabase.from("flashcard_sets").select("id, title, lesson_id").eq("id", id).maybeSingle();
  if (!set) notFound();
  const { data: cards } = await supabase
    .from("flashcards")
    .select("id, question, answer, topic, due_at")
    .eq("set_id", id)
    .order("due_at")
    .limit(200);
  const now = new Date().toISOString();
  const due = (cards ?? []).filter((c) => c.due_at <= now);
  // New decks and "practise all" show every card; otherwise only the ones due.
  const list = all === "1" || !due.length ? (cards ?? []) : due;
  const backHref = set.lesson_id ? `/lessons/${set.lesson_id}` : "/study";

  return (
    <>
      <PageHeader
        title={set.title}
        subtitle={`${cards?.length ?? 0} ${t.study.cards} · ${due.length} ${t.study.dueNow}`}
        actions={
          <div className="flex gap-2">
            {all !== "1" && due.length > 0 && due.length < (cards?.length ?? 0) && (
              <Link href={`/flashcards/${id}?all=1`} className={buttonClass("ghost", "sm")}>{t.study.practiseAll}</Link>
            )}
            <DeleteDeck t={t} id={id} backHref={backHref} />
          </div>
        }
      />
      <Reviewer key={`${id}-${all}`} t={t} cards={list.map((c) => ({ id: c.id, question: c.question, answer: c.answer, topic: c.topic }))} backHref={backHref} />
    </>
  );
}
