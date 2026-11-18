"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, Loader2, Pencil, Printer, RefreshCw, Trash2 } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/hu";
import { formatDuration } from "@/lib/i18n/format";
import { renderMarkdown } from "@/lib/markdown";
import type { TranscriptSegment } from "@/lib/stt/whisper";
import { api, ApiError } from "@/lib/recorder/uploader";
import { Alert, Button, Card, EmptyState, Input, Textarea, cn } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { saveNoteAction, saveTranscriptAction } from "./actions";
import { SegmentedPlayer, seekTo } from "./player";

type Note = { id: string; kind: string; title: string; content_md: string; edited: boolean; structured: { coverage_warning?: string | null } };

export function LessonView({
  t,
  lesson,
  recording,
  transcript,
  notes,
  busy,
}: {
  t: Dictionary;
  lesson: { id: string; title: string };
  recording: { id: string; status: string; error: string | null } | null;
  transcript: { segments: TranscriptSegment[]; text: string } | null;
  notes: Note[];
  busy: string[];
}) {
  const L = t.lessons;
  const router = useRouter();
  const [tab, setTab] = useState<"notes" | "transcript">(notes.length ? "notes" : "transcript");
  const [kind, setKind] = useState<"quick" | "detailed" | "exam">("quick");
  const [title, setTitle] = useState(lesson.title);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processing = busy.length > 0 || recording?.status === "uploaded" || recording?.status === "processing";

  // Poll while background jobs run; server components re-render with fresh data.
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [processing, router]);

  async function rename() {
    try {
      await api(`/api/lessons/${lesson.id}`, { method: "PATCH", json: { title } });
      setRenaming(false);
      router.refresh();
    } catch {
      setError(t.common.somethingWrong);
    }
  }

  async function regenerate() {
    setError(null);
    try {
      await api(`/api/lessons/${lesson.id}/notes`, { method: "POST" });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError && e.code === "QUOTA_EXCEEDED" ? t.recorder.quotaExceeded : t.common.somethingWrong);
    }
  }

  async function retryTranscription() {
    if (!recording) return;
    setError(null);
    try {
      await api(`/api/recordings/${recording.id}/finalize`, { method: "POST", json: { retry: true } });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError && e.code === "QUOTA_EXCEEDED" ? t.recorder.quotaExceeded : t.common.somethingWrong);
    }
  }

  const note = notes.find((n) => n.kind === kind);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {renaming ? (
          <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); rename(); }}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} autoFocus aria-label={t.common.rename} />
            <Button type="submit" size="md"><Check className="size-4" aria-hidden /></Button>
          </form>
        ) : (
          <h1 className="flex-1 text-2xl font-semibold tracking-tight sm:text-3xl">{lesson.title}</h1>
        )}
        <div className="no-print flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setRenaming((r) => !r)} aria-label={t.common.rename}><Pencil className="size-4" aria-hidden /></Button>
          <ConfirmDialog
            title={L.deleteLesson}
            body={L.deleteLessonBody}
            confirmLabel={t.common.delete}
            cancelLabel={t.common.cancel}
            onConfirm={async () => {
              await api(`/api/lessons/${lesson.id}`, { method: "DELETE" });
              router.push("/lessons");
              router.refresh();
            }}
            trigger={(open) => <Button variant="ghost" size="sm" onClick={open} aria-label={L.deleteLesson}><Trash2 className="size-4" aria-hidden /></Button>}
          />
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {recording && <div className="no-print"><SegmentedPlayer lessonId={lesson.id} label={L.audio} /></div>}

      {processing && (
        <Alert tone="info">
          <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden /> {busy.includes("generate_notes") ? L.noNotes : L.noTranscript}</span>
        </Alert>
      )}
      {recording?.status === "failed" && (
        <Alert tone="error">
          {L.transcriptFailed}
          <Button size="sm" variant="secondary" className="ml-3" onClick={retryTranscription}><RefreshCw className="size-4" aria-hidden /> {L.retryTranscription}</Button>
        </Alert>
      )}

      <div className="no-print flex gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1" role="tablist">
        {(["notes", "transcript"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("flex-1 rounded-lg py-2 text-sm font-medium", tab === k ? "bg-ink-700 text-fg" : "text-muted")}>
            {k === "notes" ? L.notes : L.transcript}
          </button>
        ))}
      </div>

      {tab === "notes" ? (
        notes.length === 0 ? (
          <EmptyState title={L.noNotes} action={transcript?.text ? <Button size="sm" onClick={regenerate}>{L.regenerate}</Button> : undefined} />
        ) : (
          <>
            <div className="no-print flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">
                {(["quick", "detailed", "exam"] as const).map((k) => (
                  <Button key={k} size="sm" variant={kind === k ? "secondary" : "ghost"} onClick={() => setKind(k)}>{L[k]}</Button>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={regenerate} disabled={processing}><RefreshCw className="size-4" aria-hidden /> {L.regenerate}</Button>
            </div>
            {note && <NoteCard key={note.id} note={note} t={t} lessonTitle={lesson.title} />}
          </>
        )
      ) : transcript ? (
        <TranscriptView lessonId={lesson.id} segments={transcript.segments} t={t} />
      ) : (
        <EmptyState title={L.noTranscript} />
      )}
    </div>
  );
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function NoteCard({ note, t, lessonTitle }: { note: Note; t: Dictionary; lessonTitle: string }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content_md);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => renderMarkdown(content), [content]);
  const ref = useRef<HTMLDivElement>(null);
  const safeName = lessonTitle.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) || "lernova";

  const onClick = useCallback((e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-t]");
    if (el) seekTo(Number(el.dataset.t));
  }, []);

  return (
    <Card className="p-5 sm:p-7">
      {note.structured?.coverage_warning && <Alert tone="warn" className="mb-4">{note.structured.coverage_warning}</Alert>}
      <div className="no-print mb-4 flex flex-wrap justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? t.common.copied : t.common.copy}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => download(`${safeName}-${note.kind}.md`, content, "text/markdown;charset=utf-8")}>
          <Download className="size-4" aria-hidden /> Markdown
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            download(
              `${safeName}-${note.kind}.doc`,
              `<html><head><meta charset="utf-8"><title>${safeName}</title></head><body><h1>${safeName}</h1>${ref.current?.innerHTML ?? ""}</body></html>`,
              "application/msword",
            )
          }
        >
          <Download className="size-4" aria-hidden /> Word
        </Button>
        <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer className="size-4" aria-hidden /> PDF</Button>
        <Button size="sm" variant={editing ? "secondary" : "ghost"} onClick={() => setEditing((v) => !v)}><Pencil className="size-4" aria-hidden /> {t.common.edit}</Button>
      </div>
      {editing ? (
        <div>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={20} className="font-mono text-sm" />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setContent(note.content_md); setEditing(false); }}>{t.common.cancel}</Button>
            <Button loading={saving} onClick={async () => { setSaving(true); try { await saveNoteAction(note.id, content); setEditing(false); } finally { setSaving(false); } }}>{t.common.save}</Button>
          </div>
        </div>
      ) : (
        <div ref={ref} className="prose-notes" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </Card>
  );
}

function TranscriptView({ lessonId, segments, t }: { lessonId: string; segments: TranscriptSegment[]; t: Dictionary }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [segs, setSegs] = useState(segments);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const needle = q.trim().toLowerCase();
  const visible = needle ? segs.map((s, i) => ({ s, i })).filter(({ s }) => s.text.toLowerCase().includes(needle)) : segs.map((s, i) => ({ s, i }));
  const plain = segs.map((s) => `[${formatDuration(s.start)}] ${s.text}`).join("\n");

  return (
    <Card className="p-5 sm:p-7">
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.lessons.searchTranscript} className="h-9 flex-1 text-sm" aria-label={t.lessons.searchTranscript} />
        <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(plain); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => download("transcript.txt", plain, "text/plain;charset=utf-8")}><Download className="size-4" aria-hidden /></Button>
        <Button size="sm" variant={editing ? "secondary" : "ghost"} onClick={() => setEditing((v) => !v)}><Pencil className="size-4" aria-hidden /></Button>
      </div>
      <ol className="space-y-3">
        {visible.map(({ s, i }) => (
          <li key={i} className="flex gap-3">
            <button type="button" onClick={() => seekTo(s.start)} className="h-fit shrink-0 rounded-md bg-lime/8 px-1.5 py-0.5 font-mono text-xs text-lime hover:bg-lime/15">
              {formatDuration(s.start)}
            </button>
            {editing ? (
              <Textarea
                value={s.text}
                rows={2}
                className="text-sm"
                onChange={(e) => setSegs((all) => all.map((x, j) => (j === i ? { ...x, text: e.target.value, low_confidence: false } : x)))}
              />
            ) : (
              <p className={cn("text-sm leading-relaxed text-fg/90", s.low_confidence && "uncertain underline decoration-warn decoration-wavy underline-offset-4")} title={s.low_confidence ? t.lessons.lowConfidence : undefined}>
                {s.text}
              </p>
            )}
          </li>
        ))}
      </ol>
      {editing && (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { setSegs(segments); setEditing(false); }}>{t.common.cancel}</Button>
          <Button loading={saving} onClick={async () => { setSaving(true); try { await saveTranscriptAction(lessonId, segs); setEditing(false); } finally { setSaving(false); } }}>{t.common.save}</Button>
        </div>
      )}
    </Card>
  );
}
