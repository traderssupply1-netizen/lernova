import Link from "next/link";
import { BookOpenCheck, Brain, FileText, Flame, Mic, Upload } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { computeStreak, dayKey, daysAgoIso, lastNDays, todayIso } from "@/lib/stats";
import { Badge, Card, EmptyState, PageHeader, Stat, cn } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const s = await requireUser("/dashboard");
  const { locale, t } = await getDictionary();
  const D = t.dashboard;
  const tz = s.profile.timezone || "Europe/Budapest";
  const supabase = await createClient();
  const since = daysAgoIso(120);
  const today = todayIso();

  const [stats, recentLessons, recentNotes, exams] = await Promise.all([
    supabase.rpc("my_dashboard", { p_since: since }),
    supabase.from("lessons").select("id, title, created_at, subjects(name, color), recordings(status)").order("created_at", { ascending: false }).limit(5),
    supabase.from("notes").select("id, title, kind, lesson_id, updated_at").eq("kind", "quick").order("updated_at", { ascending: false }).limit(4),
    supabase.from("exams").select("id, title, scheduled_for").gte("scheduled_for", today).order("scheduled_for").limit(4),
  ]);
  const st = (stats.data ?? { lessons: 0, total_seconds: 0, sessions: [], recording_left: 0 }) as {
    lessons: number; total_seconds: number; sessions: { started_at: string; duration_seconds: number }[]; recording_left: number;
  };
  const sess = st.sessions;
  const todayKey = dayKey(new Date(), tz);
  const todayMinutes = Math.round(sess.filter((x) => dayKey(new Date(x.started_at), tz) === todayKey).reduce((a, x) => a + x.duration_seconds, 0) / 60);
  const totalMinutes = Math.round(Number(st.total_seconds) / 60);
  const streak = computeStreak(sess.map((x) => new Date(x.started_at)), tz);
  const week = lastNDays(sess, tz, 7);
  const maxDay = Math.max(s.profile.daily_goal_minutes, ...week.map((w) => w.minutes));
  const weekday = new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { weekday: "short", timeZone: "UTC" });
  const df = new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { month: "short", day: "numeric" });
  // Hungarian names are written family-name first, so only shorten English greetings.
  const firstName = locale === "en" ? (s.profile.full_name.split(" ")[0] ?? "") : s.profile.full_name;

  const quick = [
    { href: "/record", label: D.qRecord, icon: Mic, live: true },
    { href: "/lessons", label: D.qNotes, icon: FileText, live: true },
    { href: null, label: D.qExam, icon: BookOpenCheck, live: false },
    { href: null, label: D.qTutor, icon: Brain, live: false },
    { href: null, label: D.qUpload, icon: Upload, live: false },
  ];

  return (
    <>
      <PageHeader title={fmt(D.welcome, { name: firstName })} subtitle={D.subtitle} />

      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:px-0">
        {quick.map(({ href, label, icon: Icon, live }) => {
          const inner = (
            <>
              <span className={cn("grid size-9 place-items-center rounded-xl", live ? "bg-lime text-lime-ink" : "bg-ink-700 text-subtle")}><Icon className="size-4" aria-hidden /></span>
              <span className="text-sm font-medium">{label}</span>
              {!live && <span className="text-[11px] text-subtle">{D.comingSoon}</span>}
            </>
          );
          const cls = "flex min-w-[130px] flex-col items-start gap-2 rounded-2xl border border-ink-700 bg-ink-900 p-4 transition-colors";
          return href ? (
            <Link key={label} href={href} className={cn(cls, "hover:border-ink-500")}>{inner}</Link>
          ) : (
            <div key={label} className={cn(cls, "opacity-60")} aria-disabled>{inner}</div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={D.todayMinutes} value={`${todayMinutes} ${t.common.minutes}`} sub={`/ ${s.profile.daily_goal_minutes} ${t.common.minutes}`} />
        <Stat label={D.totalLessons} value={st.lessons} />
        <Stat label={D.totalMinutes} value={`${totalMinutes} ${t.common.minutes}`} />
        <Stat label={D.streak} value={<span className="inline-flex items-center gap-1.5">{streak}<Flame className={cn("size-5", streak ? "text-lime" : "text-subtle")} aria-hidden /></span>} sub={D.days} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <h2 className="text-sm font-medium text-muted">{D.weekly}</h2>
          <div className="mt-5 flex h-36 items-end gap-2" role="img" aria-label={week.map((w) => `${w.key}: ${w.minutes}`).join(", ")}>
            {week.map((w) => (
              <div key={w.key} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[11px] tabular-nums text-subtle">{w.minutes || ""}</span>
                <div className="flex w-full flex-1 items-end">
                  <div className={cn("w-full rounded-md", w.minutes >= s.profile.daily_goal_minutes ? "bg-lime" : "bg-ink-600")} style={{ height: `${Math.max(4, (w.minutes / maxDay) * 100)}%` }} />
                </div>
                <span className="text-[11px] text-subtle">{weekday.format(new Date(w.key + "T12:00:00Z"))}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted">{D.usage}</h2>
            <Badge tone="lime">{D.plan}: {s.plan}</Badge>
          </div>
          <p className="mt-4 text-3xl font-semibold tabular-nums">{Math.floor(Number(st.recording_left))} <span className="text-base font-normal text-muted">{t.common.minutes}</span></p>
          <p className="mt-1 text-xs text-subtle">{t.recorder.title}</p>
          <h2 className="mt-6 text-sm font-medium text-muted">{D.upcomingExams}</h2>
          {exams.data?.length ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {exams.data.map((e) => <li key={e.id} className="flex justify-between"><span>{e.title}</span><span className="text-muted">{df.format(new Date(e.scheduled_for!))}</span></li>)}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-subtle">{D.noExams}</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-medium text-muted">{D.recentLessons}</h2>
          {recentLessons.data?.length ? (
            <ul className="divide-y divide-ink-800">
              {recentLessons.data.map((l) => {
                const subj = l.subjects as unknown as { name: string; color: string } | null;
                const st = (l.recordings as unknown as { status: string }[])[0]?.status;
                return (
                  <li key={l.id}>
                    <Link href={`/lessons/${l.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-lime">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{l.title}</span>
                        <span className="text-xs text-subtle">{subj?.name ?? "—"} · {df.format(new Date(l.created_at))}</span>
                      </span>
                      {st && <Badge tone={st === "ready" ? "ok" : st === "failed" ? "danger" : "neutral"}>{t.lessons.status[st as keyof typeof t.lessons.status]}</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={<Mic className="size-7" />} title={D.noLessons} />
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-medium text-muted">{D.recentNotes}</h2>
          {recentNotes.data?.length ? (
            <ul className="divide-y divide-ink-800">
              {recentNotes.data.map((n) => (
                <li key={n.id}>
                  <Link href={`/lessons/${n.lesson_id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-lime">
                    <span className="truncate font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-subtle">{df.format(new Date(n.updated_at))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<FileText className="size-7" />} title={D.noNotes} />
          )}
        </Card>
      </div>
    </>
  );
}
