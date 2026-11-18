"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, X } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/hu";
import { api, ApiError } from "@/lib/recorder/uploader";
import { Alert, Badge, Button, Card, Textarea, cn } from "@/components/ui";

export type ExamQuestion = {
  id: string;
  type: string;
  prompt: string;
  options: string[] | null;
  topic: string | null;
  correctAnswer?: string | null;
  explanation?: string | null;
};
export type AttemptResult = {
  score: number | null;
  weakTopics: string[];
  feedback: string | null;
  answers: Record<string, { answer: string | null; correct: boolean | null; points: number | null; feedback: string | null }>;
};

export function ExamRunner({ t, examId, questions, result }: { t: Dictionary; examId: string; questions: ExamQuestion[]; result: AttemptResult | null }) {
  const S = t.study;
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = Object.values(answers).filter((a) => a.trim()).length;
  const set = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }));

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await api<{ attemptId: string }>(`/api/exams/${examId}/submit`, { method: "POST", json: { answers } });
      router.replace(`/exams/${examId}?attempt=${r.attemptId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError && e.code === "QUOTA_EXCEEDED" ? S.quotaExceeded : t.common.somethingWrong);
      setSubmitting(false);
    }
  }

  const tf = (v: string) => (v === "true" ? S.true : S.false);

  return (
    <div className="space-y-4">
      {result && (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{S.yourScore}</p>
              <p className={cn("text-4xl font-semibold tabular-nums", (result.score ?? 0) >= 75 ? "text-lime" : (result.score ?? 0) >= 50 ? "text-warn" : "text-danger")}>
                {result.score !== null ? `${Math.round(result.score)}%` : "–"}
              </p>
            </div>
            <Button variant="secondary" onClick={() => { router.replace(`/exams/${examId}`); router.refresh(); }}>
              <RotateCcw className="size-4" aria-hidden /> {S.retake}
            </Button>
          </div>
          {result.feedback && <p className="mt-4 text-sm leading-relaxed text-fg/90">{result.feedback}</p>}
          {result.weakTopics.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-muted">{S.weakTopics}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{result.weakTopics.map((w) => <Badge key={w} tone="warn">{w}</Badge>)}</div>
            </div>
          )}
        </Card>
      )}

      {questions.map((q, i) => {
        const r = result?.answers[q.id];
        const value = result ? (r?.answer ?? "") : (answers[q.id] ?? "");
        return (
          <Card key={q.id} className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium leading-relaxed"><span className="mr-2 font-mono text-sm text-lime">{i + 1}.</span>{q.prompt}</p>
              {r && (
                r.points === null ? <Badge>{S.notGraded}</Badge>
                : r.correct ? <Check className="size-5 shrink-0 text-lime" aria-label={S.correct} />
                : r.points && r.points > 0 ? <Badge tone="warn">{S.partial}</Badge>
                : <X className="size-5 shrink-0 text-danger" aria-label={S.wrong} />
              )}
            </div>

            {q.type === "multiple_choice" && q.options && (
              <div className="mt-4 grid gap-2">
                {q.options.map((o) => {
                  const chosen = value === o;
                  const isCorrect = result && q.correctAnswer === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      disabled={!!result}
                      onClick={() => set(q.id, o)}
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                        isCorrect ? "border-lime/60 bg-lime/10" : chosen && result ? "border-danger/50 bg-danger/10" : chosen ? "border-lime bg-ink-700" : "border-ink-600 bg-ink-850 hover:bg-ink-800",
                      )}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "true_false" && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {["true", "false"].map((o) => {
                  const chosen = value === o;
                  const isCorrect = result && q.correctAnswer === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      disabled={!!result}
                      onClick={() => set(q.id, o)}
                      className={cn(
                        "rounded-xl border px-4 py-3 text-sm font-medium",
                        isCorrect ? "border-lime/60 bg-lime/10" : chosen && result ? "border-danger/50 bg-danger/10" : chosen ? "border-lime bg-ink-700" : "border-ink-600 bg-ink-850 hover:bg-ink-800",
                      )}
                    >
                      {tf(o)}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "short_answer" && (
              <Textarea
                className="mt-4 text-sm"
                rows={3}
                value={value}
                readOnly={!!result}
                onChange={(e) => set(q.id, e.target.value)}
                placeholder={S.yourAnswer}
                maxLength={4000}
              />
            )}

            {result && (
              <div className="mt-4 space-y-2 rounded-xl bg-ink-850 p-4 text-sm">
                {r?.feedback && <p className="text-fg/90">{r.feedback}</p>}
                {q.type === "short_answer" && q.correctAnswer && <p><span className="text-muted">{S.modelAnswer}:</span> {q.correctAnswer}</p>}
                {q.type === "true_false" && q.correctAnswer && <p><span className="text-muted">{S.correctAnswer}:</span> {tf(q.correctAnswer)}</p>}
                {q.explanation && <p className="text-muted">{q.explanation}</p>}
              </div>
            )}
          </Card>
        );
      })}

      {!result && (
        <div className="sticky bottom-24 md:bottom-4">
          {error && <Alert tone="warn" className="mb-3">{error}</Alert>}
          <Button size="lg" className="w-full shadow-lg" loading={submitting} disabled={!answered} onClick={submit}>
            {submitting ? S.grading : `${S.submit} (${answered}/${questions.length})`}
          </Button>
        </div>
      )}
    </div>
  );
}
