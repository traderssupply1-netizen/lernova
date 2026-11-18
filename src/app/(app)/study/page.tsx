import Link from "next/link";
import { BookOpenCheck, FileUp, Layers } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Study" };

export default async function StudyPage() {
  await requireUser("/study");
  const { locale, t } = await getDictionary();
  const S = t.study;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{ count: due }, { data: sets }, { data: exams }] = await Promise.all([
    supabase.from("flashcards").select("id", { count: "exact", head: true }).lte("due_at", now),
    supabase.from("flashcard_sets").select("id, title, created_at, flashcards(count)").order("created_at", { ascending: false }).limit(50),
    supabase.from("exams").select("id, title, difficulty, created_at, exam_attempts(score, submitted_at)").order("created_at", { ascending: false }).limit(50),
  ]);
  const df = new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { dateStyle: "medium" });

  return (
    <>
      <PageHeader title={S.title} subtitle={S.subtitle} actions={<Link href="/upload" className={buttonClass("secondary", "sm")}><FileUp className="size-4" aria-hidden /> {S.uploadDoc}</Link>} />

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted">{S.dailyReview}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{due ?? 0} <span className="text-base font-normal text-muted">{S.dueNow}</span></p>
        </div>
        {due ? <Link href="/study/review" className={buttonClass("primary", "md")}>{S.startReview}</Link> : <p className="text-sm text-subtle">{S.nothingDue}</p>}
      </Card>

      <h2 className="mb-3 mt-8 flex items-center gap-2 font-semibold"><Layers className="size-4 text-lime" aria-hidden /> {S.decks}</h2>
      {sets?.length ? (
        <Card className="divide-y divide-ink-800">
          {sets.map((s) => (
            <Link key={s.id} href={`/flashcards/${s.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-ink-850">
              <span className="min-w-0 truncate">{s.title}</span>
              <span className="shrink-0 text-sm text-subtle">{(s.flashcards as unknown as { count: number }[])?.[0]?.count ?? 0} {S.cards} · {df.format(new Date(s.created_at))}</span>
            </Link>
          ))}
        </Card>
      ) : (
        <EmptyState title={S.noDecks} />
      )}

      <h2 className="mb-3 mt-8 flex items-center gap-2 font-semibold"><BookOpenCheck className="size-4 text-lime" aria-hidden /> {S.exams}</h2>
      {exams?.length ? (
        <Card className="divide-y divide-ink-800">
          {exams.map((e) => {
            const scores = ((e.exam_attempts ?? []) as { score: number | null; submitted_at: string | null }[]).filter((a) => a.score !== null).map((a) => Number(a.score));
            return (
              <Link key={e.id} href={`/exams/${e.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-ink-850">
                <span className="min-w-0 truncate">{e.title}</span>
                <span className="shrink-0 text-sm text-subtle">
                  {S.difficulties[e.difficulty as "easy" | "medium" | "hard"]}
                  {scores.length ? ` · ${S.best} ${Math.round(Math.max(...scores))}%` : ` · ${S.notTaken}`}
                </span>
              </Link>
            );
          })}
        </Card>
      ) : (
        <EmptyState title={S.noExams} />
      )}
    </>
  );
}
