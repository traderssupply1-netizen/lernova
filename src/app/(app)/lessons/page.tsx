import Link from "next/link";
import { BookOpen, Mic } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { formatDuration } from "@/lib/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Lessons" };
const PAGE = 30;
const TONE = { ready: "ok", failed: "danger", processing: "lime", uploaded: "lime", uploading: "warn", recording: "warn" } as const;

export default async function LessonsPage({ searchParams }: { searchParams: Promise<{ page?: string; subject?: string }> }) {
  await requireUser("/lessons");
  const { locale, t } = await getDictionary();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const supabase = await createClient();
  let q = supabase
    .from("lessons")
    .select("id, title, lesson_date, created_at, subjects(id, name, color), recordings(status, duration_seconds)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (sp.subject) q = q.eq("subject_id", sp.subject);
  const [{ data: lessons, count }, { data: subjects }] = await Promise.all([q, supabase.from("subjects").select("id, name").order("name")]);
  const df = new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { dateStyle: "medium" });

  return (
    <>
      <PageHeader title={t.lessons.title} actions={<Link href="/record" className={buttonClass("primary", "sm")}><Mic className="size-4" aria-hidden />{t.dashboard.qRecord}</Link>} />
      {!!subjects?.length && (
        <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto pb-1">
          <Link href="/lessons" className={buttonClass(sp.subject ? "ghost" : "secondary", "sm")}>∗</Link>
          {subjects.map((s) => (
            <Link key={s.id} href={`/lessons?subject=${s.id}`} className={buttonClass(sp.subject === s.id ? "secondary" : "ghost", "sm")}>{s.name}</Link>
          ))}
        </div>
      )}
      {!lessons?.length ? (
        <EmptyState icon={<BookOpen className="size-8" />} title={t.lessons.empty} action={<Link href="/record" className={buttonClass("primary", "sm")}>{t.dashboard.qRecord}</Link>} />
      ) : (
        <Card className="divide-y divide-ink-800">
          {lessons.map((l) => {
            const rec = (l.recordings as unknown as { status: keyof typeof TONE; duration_seconds: number }[])[0];
            const subj = l.subjects as unknown as { name: string; color: string } | null;
            return (
              <Link key={l.id} href={`/lessons/${l.id}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-ink-850">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.title}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-subtle">
                    {subj && <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: subj.color }} />{subj.name}</span>}
                    <span>{df.format(new Date(l.created_at))}</span>
                    {rec && Number(rec.duration_seconds) > 0 && <span className="font-mono">{formatDuration(Number(rec.duration_seconds))}</span>}
                  </p>
                </div>
                {rec && <Badge tone={TONE[rec.status] ?? "neutral"}>{t.lessons.status[rec.status]}</Badge>}
              </Link>
            );
          })}
        </Card>
      )}
      <div className="mt-3 flex justify-end gap-4 text-sm text-muted">
        {page > 0 && <Link href={`?page=${page - 1}${sp.subject ? `&subject=${sp.subject}` : ""}`}>←</Link>}
        {(count ?? 0) > (page + 1) * PAGE && <Link href={`?page=${page + 1}${sp.subject ? `&subject=${sp.subject}` : ""}`}>→</Link>}
      </div>
    </>
  );
}
