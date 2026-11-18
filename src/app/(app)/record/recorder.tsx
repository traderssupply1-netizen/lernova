"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Mic, Pause, Play, ShieldCheck, Square, Smartphone } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/hu";
import { fmt, formatDuration } from "@/lib/i18n/format";
import { idb } from "@/lib/recorder/idb";
import { api, ApiError, recoverRecording, uploadSegment } from "@/lib/recorder/uploader";
import { Alert, Button, Card, Input, Label, Select, cn } from "@/components/ui";

type T = Dictionary["recorder"];
type Subject = { id: string; name: string };
type Phase = "setup" | "starting" | "recording" | "paused" | "finishing" | "done" | "error";

/** Each segment is a standalone audio file (Whisper limit 25 MB; 5 min at 48 kbps ≈ 1.8 MB). */
const SEGMENT_SECONDS = 300;
const TIMESLICE_MS = 4000;
const BITRATE = 48_000;

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function Recorder({ t, subjects, initialSubject }: { t: T; subjects: Subject[]; initialSubject?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [uploads, setUploads] = useState({ done: 0, total: 0 });
  const [pending, setPending] = useState<{ recordingId: string; lessonId: string; title: string; segments: number[] }[]>([]);
  const [recovering, setRecovering] = useState<string | null>(null);

  const [subjectId, setSubjectId] = useState(initialSubject ?? subjects[0]?.id ?? "new");
  const [newSubject, setNewSubject] = useState("");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<"hu" | "en" | "auto">("auto");
  const [consent, setConsent] = useState(false);

  const ids = useRef<{ recordingId: string; lessonId: string } | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const mime = useRef("");
  const segIndex = useRef(0);
  const segStart = useRef(0);
  const writes = useRef(new Map<number, Promise<unknown>[]>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const uploadFailed = useRef(false);
  const activeMs = useRef(0);
  const runningSince = useRef<number | null>(null);
  const stopping = useRef(false);
  const limitSeconds = useRef(Infinity);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const history = useRef<number[]>([]);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const raf = useRef(0);

  const activeSeconds = () => (activeMs.current + (runningSince.current ? performance.now() - runningSince.current : 0)) / 1000;

  // Interrupted recordings left in local storage.
  useEffect(() => {
    if (!idb.supported()) return;
    idb.pending().then(setPending).catch(() => undefined);
  }, []);

  // Warn before leaving while audio is not safely uploaded.
  useEffect(() => {
    const busy = phase === "recording" || phase === "paused" || phase === "finishing";
    if (!busy) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t.leaveWarning;
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase, t.leaveWarning]);

  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) wakeLock.current = await navigator.wakeLock.request("screen");
    } catch {
      /* not supported or denied: the iOS tip covers it */
    }
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && (phase === "recording" || phase === "paused")) requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase, requestWakeLock]);

  const enqueueUpload = useCallback((segment: number, startOffset: number, duration: number) => {
    setUploads((u) => ({ ...u, total: u.total + 1 }));
    const recId = ids.current!.recordingId;
    queue.current = queue.current.then(async () => {
      try {
        await uploadSegment(recId, segment, duration, startOffset);
        setUploads((u) => ({ ...u, done: u.done + 1 }));
      } catch (e) {
        // Audio stays in IndexedDB and can be recovered later.
        uploadFailed.current = true;
        console.error("segment upload failed", e);
      }
    });
  }, []);

  const finish = useCallback(async () => {
    setPhase("finishing");
    await queue.current;
    cleanupMedia();
    if (uploadFailed.current) {
      setError("UPLOAD_FAILED");
      setPhase("error");
      idb.pending().then(setPending);
      return;
    }
    try {
      await api(`/api/recordings/${ids.current!.recordingId}/finalize`, { method: "POST", json: {} });
      setPhase("done");
      router.push(`/lessons/${ids.current!.lessonId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "UNKNOWN");
      setPhase("error");
    }
  }, [router]);

  const startSegment = useCallback(async () => {
    const s = stream.current!;
    const index = segIndex.current;
    const startOffset = activeSeconds();
    segStart.current = startOffset;
    const recId = ids.current!.recordingId;
    let part = 0;
    writes.current.set(index, []);
    await idb.putSegment({ key: `${recId}|${index}`, recordingId: recId, segment: index, duration: null, lessonId: ids.current!.lessonId, title });
    const mr = new MediaRecorder(s, { mimeType: mime.current, audioBitsPerSecond: BITRATE });
    mr.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      const p = idb.putPart({ key: `${recId}|${index}|${part}`, recordingId: recId, segment: index, part: part++, blob: e.data, mime: mime.current, startOffset, createdAt: Date.now() });
      writes.current.get(index)!.push(p);
    };
    mr.onstop = async () => {
      const duration = Math.max(0.5, activeSeconds() - startOffset);
      await Promise.all(writes.current.get(index) ?? []);
      await idb.putSegment({ key: `${recId}|${index}`, recordingId: recId, segment: index, duration, lessonId: ids.current!.lessonId, title });
      enqueueUpload(index, startOffset, duration);
      if (stopping.current && recorder.current === mr) finish();
    };
    mr.start(TIMESLICE_MS);
    recorder.current = mr;
  }, [enqueueUpload, finish, title]);

  const stop = useCallback(() => {
    if (!recorder.current || stopping.current) return;
    stopping.current = true;
    if (runningSince.current) {
      activeMs.current += performance.now() - runningSince.current;
      runningSince.current = null;
    }
    if (recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  // Timer, segment rotation, allowance limit, level meter.
  useEffect(() => {
    if (phase !== "recording" && phase !== "paused") return;
    const id = setInterval(async () => {
      const a = activeSeconds();
      setElapsed(a);
      if (phase !== "recording") return;
      if (a >= limitSeconds.current) {
        setWarning("QUOTA");
        stop();
        return;
      }
      if (a - segStart.current >= SEGMENT_SECONDS && recorder.current?.state === "recording") {
        const old = recorder.current;
        segIndex.current += 1;
        await startSegment();
        old.stop();
      }
    }, 250);
    return () => clearInterval(id);
  }, [phase, startSegment, stop]);

  useEffect(() => {
    if (phase !== "recording" && phase !== "paused") return;
    const buf = new Uint8Array(1024);
    const draw = () => {
      const an = analyser.current;
      const c = canvas.current;
      if (an && c) {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = phase === "paused" ? 0 : Math.min(1, Math.sqrt(sum / buf.length) * 4);
        setLevel(rms);
        history.current.push(rms);
        const bars = Math.floor(c.clientWidth / 5);
        if (history.current.length > bars) history.current.splice(0, history.current.length - bars);
        const ctx = c.getContext("2d")!;
        const dpr = window.devicePixelRatio || 1;
        c.width = c.clientWidth * dpr;
        c.height = c.clientHeight * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
        const h = c.clientHeight;
        history.current.forEach((v, i) => {
          const bh = Math.max(3, v * h * 0.9);
          ctx.fillStyle = phase === "paused" ? "#45484f" : "#c6f432";
          ctx.globalAlpha = 0.35 + 0.65 * (i / history.current.length);
          ctx.beginPath();
          ctx.roundRect(i * 5, (h - bh) / 2, 3, bh, 1.5);
          ctx.fill();
        });
      }
      raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [phase]);

  function cleanupMedia() {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
  }

  async function start() {
    setError(null);
    setWarning(null);
    const m = pickMime();
    if (!m || !navigator.mediaDevices?.getUserMedia || !idb.supported()) {
      setError("UNSUPPORTED");
      return;
    }
    mime.current = m;
    setPhase("starting");
    try {
      // Explicit user action: the browser shows its own permission prompt here.
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      stream.current = s;
      const track = s.getAudioTracks()[0];
      track.onended = () => {
        setWarning("MIC_LOST");
        stop();
      };
      track.onmute = () => setWarning("MIC_MUTED");
      track.onunmute = () => setWarning(null);

      const created = await api<{ recordingId: string; lessonId: string; minutesLeft: number }>("/api/recordings", {
        method: "POST",
        json: {
          subjectId: subjectId === "new" ? null : subjectId,
          newSubject: subjectId === "new" && newSubject.trim() ? newSubject.trim() : undefined,
          title: title.trim(),
          language,
          mimeType: m.split(";")[0],
          consent: true,
        },
      });
      ids.current = { recordingId: created.recordingId, lessonId: created.lessonId };
      limitSeconds.current = created.minutesLeft * 60;

      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx.current = new Ctx();
      await audioCtx.current.resume();
      analyser.current = audioCtx.current.createAnalyser();
      analyser.current.fftSize = 2048;
      audioCtx.current.createMediaStreamSource(s).connect(analyser.current);

      await requestWakeLock();
      activeMs.current = 0;
      runningSince.current = performance.now();
      segIndex.current = 0;
      await startSegment();
      setPhase("recording");
    } catch (e) {
      cleanupMedia();
      const name = (e as DOMException)?.name;
      setError(name === "NotAllowedError" || name === "SecurityError" ? "MIC_DENIED" : e instanceof ApiError ? e.code : "UNKNOWN");
      setPhase("setup");
    }
  }

  function pause() {
    if (recorder.current?.state !== "recording") return;
    recorder.current.pause();
    activeMs.current += performance.now() - (runningSince.current ?? performance.now());
    runningSince.current = null;
    setPhase("paused");
  }

  function resume() {
    if (recorder.current?.state !== "paused") return;
    recorder.current.resume();
    runningSince.current = performance.now();
    setPhase("recording");
  }

  async function recover(recId: string) {
    setRecovering(recId);
    try {
      await recoverRecording(recId, () => undefined);
      const item = pending.find((p) => p.recordingId === recId);
      setPending(await idb.pending());
      if (item?.lessonId) router.push(`/lessons/${item.lessonId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "UPLOAD_FAILED");
    } finally {
      setRecovering(null);
    }
  }

  const errorText: Record<string, string> = {
    MIC_DENIED: t.micDenied,
    UNSUPPORTED: t.unsupported,
    QUOTA_EXCEEDED: t.quotaExceeded,
  };
  const live = phase === "recording" || phase === "paused";
  const canStart = consent && title.trim().length > 0 && (subjectId !== "new" || newSubject.trim().length > 0);
  const recoverable = pending.filter((p) => p.recordingId !== ids.current?.recordingId);

  return (
    <div className="space-y-4">
      {recoverable.map((p) => (
        <Alert key={p.recordingId} tone="warn">
          <p className="font-medium">{t.recoverTitle}{p.title ? `: ${p.title}` : ""}</p>
          <p className="mt-1">{fmt(t.recoverBody, { count: p.segments.length })}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => recover(p.recordingId)} loading={recovering === p.recordingId}>
              <CloudUpload className="size-4" aria-hidden /> {t.recoverUpload}
            </Button>
            <Button size="sm" variant="ghost" onClick={async () => { await idb.discard(p.recordingId); setPending(await idb.pending()); }}>
              {t.recoverDiscard}
            </Button>
          </div>
        </Alert>
      ))}

      {error && <Alert tone="error">{errorText[error] ?? error}</Alert>}
      {warning && (
        <Alert tone="warn">
          {warning === "QUOTA" ? t.quotaExceeded : warning === "MIC_LOST" ? t.micDenied : t.iosTip}
        </Alert>
      )}

      {!live && phase !== "finishing" && phase !== "done" && (
        <Card className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="subject">{t.subject}</Label>
              <Select id="subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="new">+ {t.newSubject}</option>
              </Select>
              {subjectId === "new" && (
                <Input className="mt-2" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder={t.subjectPlaceholder} maxLength={80} aria-label={t.newSubject} />
              )}
            </div>
            <div>
              <Label htmlFor="title">{t.lessonTitle}</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.lessonPlaceholder} maxLength={160} />
            </div>
            <div>
              <Label htmlFor="language">{t.transcriptionLanguage}</Label>
              <Select id="language" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
                <option value="auto">{t.auto}</option>
                <option value="hu">Magyar</option>
                <option value="en">English</option>
              </Select>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-ink-600 bg-ink-850 p-4">
            <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-lime" aria-hidden /> {t.consentTitle}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.consentBody}</p>
            <label className="mt-3 flex items-start gap-3 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-lime)]" />
              <span>{t.consentCheck}</span>
            </label>
          </div>
          <p className="mt-4 flex gap-2 text-xs text-subtle"><Mic className="size-3.5 shrink-0" aria-hidden /> {t.micExplain}</p>
          <p className="mt-1.5 flex gap-2 text-xs text-subtle"><Smartphone className="size-3.5 shrink-0" aria-hidden /> {t.iosTip}</p>
          <Button size="lg" className="mt-6 w-full sm:w-auto" disabled={!canStart} loading={phase === "starting"} onClick={start}>
            <Mic className="size-5" aria-hidden /> {t.start}
          </Button>
        </Card>
      )}

      {(live || phase === "finishing") && (
        <Card className="p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3" role="status" aria-live="polite">
              <span className={cn("size-3 rounded-full", phase === "recording" ? "animate-pulse-rec bg-danger" : "bg-warn")} aria-hidden />
              <span className="text-sm font-medium">{phase === "recording" ? t.recording : phase === "paused" ? t.paused : fmt(t.uploading, uploads)}</span>
            </div>
            <span className="font-mono text-3xl tabular-nums sm:text-4xl">{formatDuration(elapsed)}</span>
          </div>
          <canvas ref={canvas} className="mt-6 h-24 w-full" aria-hidden />
          <div className="mt-3 flex items-center gap-3" aria-label={t.level}>
            <span className="text-xs text-subtle">{t.level}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
              <div className="h-full rounded-full bg-lime transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          </div>
          {uploads.total > 0 && phase !== "finishing" && (
            <p className="mt-3 text-xs text-subtle">{fmt(t.uploading, uploads)}</p>
          )}
          <div className="mt-8 flex gap-3">
            {phase === "recording" && <Button variant="secondary" size="lg" className="flex-1" onClick={pause}><Pause className="size-5" aria-hidden /> {t.pause}</Button>}
            {phase === "paused" && <Button variant="secondary" size="lg" className="flex-1" onClick={resume}><Play className="size-5" aria-hidden /> {t.resume}</Button>}
            <Button variant="danger" size="lg" className="flex-1" onClick={stop} loading={phase === "finishing"} disabled={phase === "finishing"}>
              <Square className="size-5" aria-hidden /> {t.stop}
            </Button>
          </div>
        </Card>
      )}

      {phase === "done" && <Alert tone="success">{t.uploaded}</Alert>}
    </div>
  );
}
