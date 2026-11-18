import OpenAI, { toFile } from "openai";
import { ConfigError, env } from "@/lib/env";

export type TranscriptSegment = { start: number; end: number; text: string; low_confidence: boolean };
export type TranscriptionResult = { text: string; language: string | null; duration: number; segments: TranscriptSegment[] };

/** Whisper limits uploads to 25 MB; the recorder keeps each segment well below that. */
export const MAX_STT_BYTES = 25 * 1024 * 1024;

/**
 * Transcribes one audio segment with OpenAI Whisper. Segments with a very low
 * average log-probability or high no-speech probability are flagged as uncertain
 * so notes can mark them instead of silently trusting them.
 */
export async function transcribeSegment(audio: ArrayBuffer, fileName: string, mimeType: string, language: "hu" | "en" | "auto"): Promise<TranscriptionResult> {
  if (!env.openaiKey) throw new ConfigError("whisper");
  if (audio.byteLength > MAX_STT_BYTES) throw new Error("SEGMENT_TOO_LARGE");
  const client = new OpenAI({ apiKey: env.openaiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
  const res = await client.audio.transcriptions.create({
    file: await toFile(Buffer.from(audio), fileName, { type: mimeType }),
    model: env.whisperModel,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    ...(language !== "auto" ? { language } : {}),
  });
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

/** Whisper reports languages as names ("hungarian"); normalise to our codes. */
export function normaliseLanguage(lang: string | null): "hu" | "en" | null {
  if (!lang) return null;
  const l = lang.toLowerCase();
  if (l === "hu" || l.startsWith("hungar")) return "hu";
  if (l === "en" || l.startsWith("engl")) return "en";
  return null;
}
