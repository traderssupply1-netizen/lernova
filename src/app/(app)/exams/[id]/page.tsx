import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { buttonClass, PageHeader } from "@/components/ui";
import { ExamRunner, type ExamQuestion, type AttemptResult } from "./exam-runner";

export const metadata = { title: "Exam" };

export default async function ExamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ attempt?: string }> }) {
  const { id } = await params;
  const { attempt: attemptId } = await searchParams;
  await requireUser(`/exams/${id}`);
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { data: exam } = await supabase.from("exams").select("id, title, difficulty, lesson_id").eq("id", id).maybeSingle();
  if (!exam) notFound();
  const { data: questions } = await supabase
    .from("exam_questions")
    .select("id, position, type, prompt, options, correct_answer, explanation, topic")
    .eq("exam_id", id)
    .order("position");

  let result: AttemptResult | null = null;
  if (attemptId) {
    const { data: attempt } = await supabase.from("exam_attempts").select("id, score, weak_topics, feedback").eq("id", attemptId).eq("exam_id", id).maybeSingle();
    if (attempt) {
      const { data: answers } = await supabase.from("exam_answers").select("question_id, answer, is_correct, points, feedback").eq("attempt_id", attempt.id);
      result = {
        score: attempt.score !== null ? Number(attempt.score) : null,
        weakTopics: attempt.weak_topics ?? [],
        feedback: attempt.feedback,
        answers: Object.fromEntries((answers ?? []).map((a) => [a.question_id, { answer: a.answer, correct: a.is_correct, points: a.points !== null ? Number(a.points) : null, feedback: a.feedback }])),
      };
    }
  }

  // Answers and explanations are only sent to the browser together with a result.
  const qs: ExamQuestion[] = (questions ?? []).map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: (q.options as string[] | null) ?? null,
    topic: q.topic,
    ...(result ? { correctAnswer: q.correct_answer, explanation: q.explanation } : {}),
  }));

  return (
    <>
      <PageHeader
        title={exam.title}
        subtitle={`${qs.length} ${t.study.questions} · ${t.study.difficulties[exam.difficulty as "easy" | "medium" | "hard"]}`}
        actions={exam.lesson_id ? <Link href={`/lessons/${exam.lesson_id}`} className={buttonClass("ghost", "sm")}>{t.study.backToLesson}</Link> : undefined}
      />
      <ExamRunner key={attemptId ?? "new"} t={t} examId={exam.id} questions={qs} result={result} />
    </>
  );
}
