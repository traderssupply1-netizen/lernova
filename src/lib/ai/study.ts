import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TranscriptSegment } from "@/lib/stt/whisper";
import { transcriptForPrompt } from "./notes";

export type Lang = "hu" | "en";

/** Study material of one lesson (notes + transcript), trimmed to keep AI costs predictable. */
export type LessonSource = { id: string; title: string; subject: string | null; language: Lang; text: string };

const SOURCE_MAX_CHARS = 60_000;

export async function loadLessonSource(lessonId: string, userId: string): Promise<LessonSource | null> {
  const db = createAdminClient();
  const { data: lesson } = await db.from("lessons").select("id, user_id, title, subjects(name)").eq("id", lessonId).maybeSingle();
  if (!lesson || lesson.user_id !== userId) return null;
  const [{ data: transcript }, { data: notes }, { data: profile }] = await Promise.all([
    db.from("transcripts").select("text, segments").eq("lesson_id", lessonId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("notes").select("kind, content_md").eq("lesson_id", lessonId).in("kind", ["detailed", "exam"]),
    db.from("profiles").select("ai_language").eq("id", userId).single(),
  ]);
  const detailed = notes?.find((n) => n.kind === "detailed")?.content_md ?? "";
  const segs = (transcript?.segments ?? []) as TranscriptSegment[];
  const raw = segs.length ? transcriptForPrompt(segs, SOURCE_MAX_CHARS) : (transcript?.text ?? "");
  let text = "";
  if (detailed) text += `<notes>\n${detailed}\n</notes>\n\n`;
  if (raw) text += `<transcript>\n${raw}\n</transcript>`;
  if (!text.trim()) return null;
  if (text.length > SOURCE_MAX_CHARS) text = text.slice(0, SOURCE_MAX_CHARS) + "\n[…truncated…]";
  return {
    id: lesson.id,
    title: lesson.title,
    subject: (lesson.subjects as unknown as { name: string } | null)?.name ?? null,
    language: profile?.ai_language === "en" ? "en" : "hu",
    text,
  };
}

const langName = (l: Lang) => (l === "hu" ? "Hungarian" : "English");

const ACCURACY = `Accuracy rules (critical):
- Use ONLY facts that appear in the lesson material. Never invent facts, numbers, dates, names or quotes.
- Lines marked (?) were transcribed with low confidence: avoid building questions on them.
- If the material is too short or not a lesson, return fewer items rather than padding with made-up content.`;

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------
export const flashcardsSchema = z.object({
  title: z.string().describe("Short deck title"),
  cards: z
    .array(
      z.object({
        question: z.string().describe("Front side: one clear question or term"),
        answer: z.string().describe("Back side: short, precise answer (1-3 sentences)"),
        topic: z.string().describe("Topic the card belongs to"),
        difficulty: z.number().int().min(1).max(3).describe("1 easy, 2 medium, 3 hard"),
      }),
    )
    .describe("Flashcards covering the most important content"),
});

export function flashcardsPrompt(src: LessonSource, count: number) {
  return {
    system: `You create study flashcards for students. Write ALL output in ${langName(src.language)}.
${ACCURACY}
Good cards test one idea each: definitions, key facts, causes and effects, processes, dates, formulas. Avoid yes/no questions and trivia.`,
    prompt: `Subject: ${src.subject ?? "unknown"}
Lesson: ${src.title}

${src.text}

Create up to ${count} flashcards covering the most important content of this lesson.`,
  };
}

// ---------------------------------------------------------------------------
// Practice exams
// ---------------------------------------------------------------------------
export const QUESTION_TYPES = ["multiple_choice", "true_false", "short_answer"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const examSchema = z.object({
  title: z.string(),
  questions: z.array(
    z.object({
      type: z.enum(QUESTION_TYPES),
      prompt: z.string().describe("The question"),
      options: z.array(z.string()).nullable().describe("4 options for multiple_choice; null otherwise"),
      correct_answer: z
        .string()
        .describe("multiple_choice: the exact text of the correct option. true_false: 'true' or 'false'. short_answer: a model answer"),
      explanation: z.string().describe("Why this is the answer, based on the lesson"),
      topic: z.string(),
    }),
  ),
});
export type GeneratedExam = z.infer<typeof examSchema>;

export function examPrompt(src: LessonSource, opts: { count: number; difficulty: "easy" | "medium" | "hard"; types: QuestionType[] }) {
  return {
    system: `You write practice exams for students. Write ALL output in ${langName(src.language)}.
${ACCURACY}
Multiple-choice questions have exactly 4 plausible options with one correct answer. Mix topics; do not repeat the same fact.`,
    prompt: `Subject: ${src.subject ?? "unknown"}
Lesson: ${src.title}

${src.text}

Create a ${opts.difficulty} practice exam with ${opts.count} questions. Allowed question types: ${opts.types.join(", ")}.`,
  };
}

export const gradeSchema = z.object({
  results: z.array(
    z.object({
      question_id: z.string(),
      score: z.number().min(0).max(1).describe("1 = fully correct, 0.5 = partly correct, 0 = wrong"),
      feedback: z.string().describe("One or two sentences: what was right or missing"),
    }),
  ),
  summary: z.string().describe("Short overall feedback: strengths and what to review"),
});

export function gradePrompt(language: Lang, items: { question_id: string; prompt: string; model_answer: string; student_answer: string }[]) {
  return {
    system: `You grade short written answers of students fairly and kindly. Write feedback in ${langName(language)}.
Accept answers that are correct in meaning even if worded differently or with spelling mistakes. Give partial credit (0.5) when the answer is partly right.`,
    prompt: `Grade each answer against the model answer.\n\n${JSON.stringify(items, null, 2)}`,
  };
}

/** Deterministic check for objective questions. */
export function checkObjective(type: string, correct: string | null, answer: string | null): boolean {
  if (!answer || correct == null) return false;
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  if (type === "true_false") return ["true", "igaz"].includes(norm(answer)) === ["true", "igaz"].includes(norm(correct));
  return norm(answer) === norm(correct);
}

// ---------------------------------------------------------------------------
// Tutor
// ---------------------------------------------------------------------------
export const TUTOR_MODES = ["simple", "detailed", "exam_prep", "practice"] as const;
export type TutorMode = (typeof TUTOR_MODES)[number];

export function tutorSystemPrompt(src: LessonSource, mode: TutorMode) {
  const style: Record<TutorMode, string> = {
    simple: "Explain simply and briefly, like to a 14-year-old. Use an everyday example when helpful.",
    detailed: "Explain thoroughly and precisely, step by step.",
    exam_prep: "Focus on what is likely to be tested; point out key definitions and typical mistakes.",
    practice: "Act as an examiner: ask the student one question at a time about the lesson, wait for the answer, then give feedback and the next question.",
  };
  return `You are LERNOVA's AI tutor helping a student understand their own lesson. Reply in ${langName(src.language)} unless the student writes in another language.
${style[mode]}
Ground your answers in the lesson material below. If the answer is not in the material, say so clearly (e.g. "${src.language === "hu" ? "Ez nem szerepelt az órán, de általánosságban:" : "This was not covered in the lesson, but in general:"}") before giving general knowledge, and never claim the teacher said something that is not in the material.
Keep answers focused and reasonably short. Use Markdown for lists and emphasis.

Subject: ${src.subject ?? "unknown"}
Lesson: ${src.title}

${src.text}`;
}
