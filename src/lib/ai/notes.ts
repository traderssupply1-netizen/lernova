import "server-only";
import { z } from "zod";
import type { TranscriptSegment } from "@/lib/stt/whisper";

export const notesSchema = z.object({
  title: z.string().describe("Short, specific lesson title"),
  quick_md: z.string().describe("Quick review notes in Markdown: 5-12 bullet points"),
  detailed_md: z.string().describe("Detailed structured notes in Markdown with ## headings per main topic"),
  exam_md: z.string().describe("Exam-focused notes in Markdown: what is most likely to be tested"),
  topics: z.array(z.string()).describe("Main topics of the lesson"),
  key_terms: z.array(z.object({ term: z.string(), definition: z.string(), timestamp: z.string().nullable() })),
  possible_questions: z.array(z.string()).describe("Likely exam questions, phrased as questions"),
  coverage_warning: z.string().nullable().describe("Set when the transcript is too short, unclear or off-topic to make reliable notes"),
});
export type GeneratedNotes = z.infer<typeof notesSchema>;

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Transcript rendered for the model: one line per segment with timestamp and uncertainty flag. */
export function transcriptForPrompt(segments: TranscriptSegment[], maxChars = 180_000): string {
  const lines = segments.map((s) => `[${mmss(s.start)}]${s.low_confidence ? " (?)" : ""} ${s.text}`);
  let out = lines.join("\n");
  if (out.length > maxChars) out = out.slice(0, maxChars) + "\n[…transcript truncated…]";
  return out;
}

export function notesSystemPrompt(language: "hu" | "en") {
  const lang = language === "hu" ? "Hungarian" : "English";
  return `You are LERNOVA, an expert study-notes writer for high-school and university students.
You receive a lesson transcript produced by speech recognition. Each line starts with a [mm:ss] timestamp; lines marked (?) were transcribed with low confidence.

Write ALL output in ${lang}, regardless of the transcript's language.

Accuracy rules (critical):
- Only state what the lesson actually contains. Never invent statements, quotes, numbers, dates or examples and attribute them to the teacher.
- Do not silently fill gaps. If something is unclear or cut off, say so briefly.
- When you rely on a (?) line, wrap the uncertain words in <span class="uncertain">…</span>.
- Cite the source moment for important statements with its timestamp in square brackets, e.g. [12:40].
- If you add your own explanation or background that is NOT in the transcript, put it in a separate blockquote that starts with "**${language === "hu" ? "AI-magyarázat" : "AI explanation"}:**" so students can tell source material from AI additions.
- Highlight the most important concepts with <mark>…</mark> sparingly.
- Identify: main topics, definitions, key concepts, explanations, examples, important numbers, dates, processes and relationships.
- If the transcript is too short, mostly noise, or not a lesson, set coverage_warning and keep notes minimal.`;
}

export function notesUserPrompt(opts: { subject: string | null; title: string; transcript: string }) {
  return `Subject: ${opts.subject ?? "unknown"}
Lesson title given by the student: ${opts.title}

<transcript>
${opts.transcript}
</transcript>

Create three note versions:
1. quick_md – short, easy-to-review bullet notes.
2. detailed_md – thorough structured study material with headings, definitions, examples and relationships.
3. exam_md – what is most likely to appear in an exam: key definitions, facts, numbers, dates, processes, and a short "possible questions" list.
Also return topics, key_terms (with timestamp like "12:40" when known) and possible_questions.`;
}
