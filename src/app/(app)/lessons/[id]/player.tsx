"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "@/lib/i18n/format";
import { Button } from "@/components/ui";

const EVENT = "lernova:seek";
export const seekTo = (seconds: number) => window.dispatchEvent(new CustomEvent(EVENT, { detail: seconds }));

type Segment = { url: string; start: number; duration: number };

/** Plays the recording's segments back-to-back on one global timeline. */
export function SegmentedPlayer({ lessonId, label }: { lessonId: string; label: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [segs, setSegs] = useState<Segment[]>([]);
  const [index, setIndex] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const pendingSeek = useRef<number | null>(null);
  const total = segs.length ? segs.at(-1)!.start + segs.at(-1)!.duration : 0;

  useEffect(() => {
    fetch(`/api/lessons/${lessonId}/audio`)
      .then((r) => (r.ok ? r.json() : { segments: [] }))
      .then((d) => setSegs(d.segments ?? []))
      .catch(() => undefined);
  }, [lessonId]);

  useEffect(() => {
    const onSeek = (e: Event) => go((e as CustomEvent<number>).detail, true);
    window.addEventListener(EVENT, onSeek);
    return () => window.removeEventListener(EVENT, onSeek);
  });

  function go(globalSeconds: number, play = false) {
    if (!segs.length || !audio.current) return;
    let i = segs.findIndex((s) => globalSeconds < s.start + s.duration);
    if (i < 0) i = segs.length - 1;
    const local = Math.max(0, globalSeconds - segs[i].start);
    if (i !== index) {
      pendingSeek.current = local;
      setIndex(i);
    } else {
      audio.current.currentTime = local;
    }
    if (play) audio.current.play().catch(() => undefined);
  }

  if (!segs.length) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-3">
      <audio
        ref={audio}
        src={segs[index]?.url}
        preload="metadata"
        onLoadedMetadata={() => {
          if (pendingSeek.current != null && audio.current) {
            audio.current.currentTime = pendingSeek.current;
            pendingSeek.current = null;
            if (playing) audio.current.play().catch(() => undefined);
          }
        }}
        onTimeUpdate={(e) => setTime(segs[index].start + e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          if (index < segs.length - 1) {
            pendingSeek.current = 0;
            setIndex(index + 1);
            setPlaying(true);
          }
        }}
      />
      <Button size="sm" variant="secondary" aria-label={label} onClick={() => (playing ? audio.current?.pause() : audio.current?.play())}>
        {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
      </Button>
      <input
        type="range"
        min={0}
        max={Math.max(1, total)}
        step={1}
        value={time}
        onChange={(e) => go(Number(e.target.value))}
        className="flex-1 accent-[var(--color-lime)]"
        aria-label={label}
      />
      <span className="font-mono text-xs tabular-nums text-muted">{formatDuration(time)} / {formatDuration(total)}</span>
    </div>
  );
}
