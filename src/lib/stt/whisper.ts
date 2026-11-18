import OpenAI, { toFile } from "openai";
import { ConfigError, env } from "@/lib/env";

export type TranscriptSegment = { start: number; end: number; text: string; low_confidence: boolean };
export type TranscriptionResult = { text: string; language: string | null; duration: number; segments: TranscriptSegment[] };

/** OpenAI limits uploads to 25 MB; the recorder keeps each segment well below that. */
export const MAX_STT_BYTES = 25 * 1024 * 1024;

/** Price per audio minute, for cost tracking only. */
export function sttPricePerMinute(model = env.whisperModel) {
  if (model === "gpt-4o-mini-transcribe") return 0.003;
  return 0.006;
}

/** Splits text into sentences (keeps very long sentences whole). */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÖŐÚÜŰ0-9"„(])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The gpt-4o transcribe models return plain text without timestamps. Timestamps are
 * estimated by spreading the sentences over the segment's duration in proportion to
 * their length – good enough to jump to the right part of the recording.
 */
export function estimateSegments(text: string, durationSeconds: number, uncertain: (s: string) => boolean = () => false): TranscriptSegment[] {
  const sentences = splitSentences(text);
  const total = sentences.reduce((a, s) => a + s.length, 0) || 1;
  const duration = Math.max(durationSeconds, 0);
  let cursor = 0;
  return sentences.map((s) => {
    const len = (s.length / total) * duration;
    const seg = { start: Math.round(cursor * 100) / 100, end: Math.round((cursor + len) * 100) / 100, text: s, low_confidence: uncertain(s) };
    cursor += len;
    return seg;
  });
}

type Logprob = { token: string; logprob: number };

/** Marks sentences containing several very uncertain tokens. */
function uncertaintyFromLogprobs(logprobs: Logprob[] | undefined) {
  if (!logprobs?.length) return () => false;
  const weak = logprobs.filter((l) => l.logprob < -2.5).map((l) => l.token.trim().toLowerCase()).filter((t) => t.length > 2);
  if (!weak.length) return () => false;
  return (sentence: string) => {
    const lower = sentence.toLowerCase();
    return weak.filter((w) => lower.includes(w)).length >= 2;
  };
}

/**
 * Transcribes one audio segment. With whisper-1 real per-sentence timestamps and
 * confidence are used; with the cheaper gpt-4o transcribe models timestamps are
 * estimated and confidence comes from token log-probabilities. Uncertain parts are
 * flagged so notes can mark them instead of silently trusting them.
 */
export async function transcribeSegment(
  audio: ArrayBuffer,
  fileName: string,
  mimeType: string,
  language: "hu" | "en" | "auto",
  durationSeconds = 0,
  model = env.whisperModel,
): Promise<TranscriptionResult> {
  if (!env.openaiKey) throw new ConfigError("whisper");
  if (audio.byteLength > MAX_STT_BYTES) throw new Error("SEGMENT_TOO_LARGE");
  const client = new OpenAI({ apiKey: env.openaiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
  const file = await toFile(Buffer.from(audio), fileName, { type: mimeType });
  const lang = language !== "auto" ? { language } : {};

  if (model === "whisper-1") {
    const res = await client.audio.transcriptions.create({ file, model, response_format: "verbose_json", timestamp_granularities: ["segment"], ...lang });
    type Seg = { start: number; end: number; text: string; avg_logprob?: number; no_speech_prob?: number };
    const v = res as unknown as { text: string; language?: string; duration?: number; segments?: Seg[] };
    const segments = (v.segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
      low_confidence: (s.avg_logprob ?? 0) < -1 || (s.no_speech_prob ?? 0) > 0.6,
    }));
    return { text: v.text.trim(), language: v.language ?? null, duration: v.duration ?? segments.at(-1)?.end ?? 0, segments };
  }

  try {
    const res = await client.audio.transcriptions.create({ file, model, response_format: "json", include: ["logprobs"], ...lang } as Parameters<typeof client.audio.transcriptions.create>[0]);
    const v = res as unknown as { text: string; logprobs?: Logprob[] };
    const text = (v.text ?? "").trim();
    return { text, language: language === "auto" ? null : language, duration: durationSeconds, segments: estimateSegments(text, durationSeconds, uncertaintyFromLogprobs(v.logprobs)) };
  } catch (e) {
    // Formats or parameters the newer model rejects: fall back to whisper-1.
    if (e instanceof OpenAI.APIError && e.status === 400) return transcribeSegment(audio, fileName, mimeType, language, durationSeconds, "whisper-1");
    throw e;
  }
}

/** Whisper reports languages as names ("hungarian"); normalise to our codes. */
export function normaliseLanguage(lang: string | null): "hu" | "en" | null {
  if (!lang) return null;
  const l = lang.toLowerCase();
  if (l === "hu" || l.startsWith("hungar")) return "hu";
  if (l === "en" || l.startsWith("engl")) return "en";
  return null;
}
