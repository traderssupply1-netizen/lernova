"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/hu";
import { api } from "@/lib/recorder/uploader";
import { Alert, Button, buttonClass, Card, cn } from "@/components/ui";

export type ReviewCard = { id: string; question: string; answer: string; topic: string | null };

/** SM-2 grades for the four answer buttons. */
const GRADES = [
  { key: "again", grade: 1, tone: "danger" },
  { key: "hard", grade: 3, tone: "secondary" },
  { key: "good", grade: 4, tone: "secondary" },
  { key: "easy", grade: 5, tone: "primary" },
] as const;

/** Card-by-card review: show question, reveal answer, grade it; "again" cards come back at the end. */
export function Reviewer({ t, cards, backHref }: { t: Dictionary; cards: ReviewCard[]; backHref: string }) {
  const S = t.study;
  const router = useRouter();
  const [queue, setQueue] = useState(cards);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [again, setAgain] = useState(0);
  const [error, setError] = useState(false);
  const card = queue[0];

  async function grade(g: number) {
    if (!card) return;
    setError(false);
    const current = card;
    // Optimistic: move on immediately, retry silently on failure.
    setQueue((q) => (g < 3 ? [...q.slice(1), current] : q.slice(1)));
    setRevealed(false);
    if (g < 3) setAgain((n) => n + 1);
    else setDone((n) => n + 1);
    try {
      await api(`/api/flashcards/${current.id}/review`, { method: "POST", json: { grade: g } });
    } catch {
      setError(true);
    }
  }

  if (!card) {
    return (
      <Card className="p-8 text-center">
        <p className="text-4xl" aria-hidden>🎉</p>
        <h2 className="mt-3 text-xl font-semibold">{S.sessionDone}</h2>
        <p className="mt-2 text-muted">{S.sessionStats.replace("{done}", String(done)).replace("{again}", String(again))}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href={backHref} className={buttonClass("secondary", "md")}>{t.common.back}</Link>
          <Button variant="ghost" onClick={() => { setQueue(cards); setDone(0); setAgain(0); router.refresh(); }}>
            <RotateCcw className="size-4" aria-hidden /> {S.reviewAgain}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <p className="mb-3 text-sm text-subtle tabular-nums">{S.remaining.replace("{n}", String(queue.length))}</p>
      {error && <Alert tone="warn" className="mb-3">{S.saveFailed}</Alert>}
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="block w-full text-left"
        aria-label={revealed ? undefined : S.showAnswer}
      >
        <Card className="min-h-64 p-6 sm:p-8">
          {card.topic && <p className="text-xs uppercase tracking-wider text-subtle">{card.topic}</p>}
          <p className="mt-2 text-lg font-medium leading-relaxed">{card.question}</p>
          <div className={cn("mt-6 border-t border-ink-700 pt-5", !revealed && "hidden")}>
            <p className="leading-relaxed text-fg/90 whitespace-pre-line">{card.answer}</p>
          </div>
          {!revealed && <p className="mt-10 text-center text-sm text-lime">{S.tapToReveal}</p>}
        </Card>
      </button>
      {revealed ? (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {GRADES.map((g) => (
            <Button key={g.key} variant={g.tone} onClick={() => grade(g.grade)} className="px-1">{S.grades[g.key]}</Button>
          ))}
        </div>
      ) : (
        <Button className="mt-4 w-full" size="lg" onClick={() => setRevealed(true)}>{S.showAnswer}</Button>
      )}
    </div>
  );
}
