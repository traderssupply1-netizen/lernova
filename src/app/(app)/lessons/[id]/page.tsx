import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { formatDuration } from "@/lib/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { Alert, Badge } from "@/components/ui";
import type { TranscriptSegment } from "@/lib/stt/whisper";
import { LessonView } from "./lesson-view";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/lessons/${id}`);
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, title, lesson_date, created_at, language, subjects(name, color)")
    .eq("id", id)
    .maybeSingle();
  if (!lesson) notFound();

  const [{ data: recording }, { data: transcript }, { data: notes }, { data: jobs }] = await Promise.all([
    supabase.from("recordings").select("id, status, duration_seconds, error").eq("lesson_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("transcripts").select("id, text, segments, language, edited").eq("lesson_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("notes").select("id, kind, title, content_md, structured, edited, language, updated_at").eq("lesson_id", id),
    supabase.from("processing_jobs").select("type, status, payload").in("status", ["queued", "running"]).order("created_at", { ascending: false }).limit(20),
  ]);
  const activeJobs = (jobs ?? []).filter((j) => (j.payload as { lesson_id?: string; recording_id?: string }).lesson_id === id || (j.payload as { recording_id?: string }).recording_id === recording?.id);
  const subj = lesson.subjects as unknown as { name: string; color: string } | null;
  const df = new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { dateStyle: "long" });

  return (
    <>
      <div className="mb-6">
        <p className="flex flex-wrap items-center gap-2 text-sm text-subtle">
          {subj && <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: subj.color }} />{subj.name}</span>}
          <span>{df.format(new Date(lesson.created_at))}</span>
          {recording && Number(recording.duration_seconds) > 0 && <span className="font-mono">{formatDuration(Number(recording.duration_seconds))}</span>}
          {recording && <Badge tone={recording.status === "ready" ? "ok" : recording.status === "failed" ? "danger" : "lime"}>{t.lessons.status[recording.status as keyof typeof t.lessons.status]}</Badge>}
        </p>
      </div>
      {recording?.error === "QUOTA_EXCEEDED" && <Alert tone="warn" className="mb-4">{t.recorder.quotaExceeded}</Alert>}
      <LessonView
        t={t}
        lesson={{ id: lesson.id, title: lesson.title }}
        recording={recording ? { id: recording.id, status: recording.status, error: recording.error } : null}
        transcript={transcript ? { segments: transcript.segments as TranscriptSegment[], text: transcript.text } : null}
        notes={(notes ?? []).map((n) => ({ id: n.id, kind: n.kind, title: n.title, content_md: n.content_md, edited: n.edited, structured: n.structured as { coverage_warning?: string | null } }))}
        busy={activeJobs.map((j) => j.type)}
      />
    </>
  );
}
