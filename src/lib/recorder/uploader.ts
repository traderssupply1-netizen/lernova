"use client";

import { createBrowserSupabase } from "@/lib/supabase/browser";
import { idb } from "./idb";

export class ApiError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "HTTP_" + res.status, res.status);
  return data as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Uploads one segment from IndexedDB: signed URL → direct upload to private
 * storage → server confirmation. Retries with exponential backoff and waits for
 * connectivity; local copy is deleted only after the server confirms.
 */
export async function uploadSegment(recordingId: string, segment: number, duration: number | null, startOffset: number) {
  const parts = await idb.parts(recordingId, segment);
  if (!parts.length) return;
  const mime = parts[0].mime;
  const blob = new Blob(parts.map((p) => p.blob), { type: mime.split(";")[0] });
  const dur = duration ?? parts.length * 4; // timeslice estimate for recovered, unclosed segments
  const supabase = createBrowserSupabase();

  for (let attempt = 0; ; attempt++) {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await new Promise<void>((r) => window.addEventListener("online", () => r(), { once: true }));
      }
      const signed = await api<{ path: string; token: string }>(`/api/recordings/${recordingId}/segments`, {
        method: "POST",
        json: { index: segment, size: blob.size },
      });
      const { error } = await supabase.storage.from("recordings").uploadToSignedUrl(signed.path, signed.token, blob, { contentType: mime.split(";")[0], upsert: true });
      if (error) throw new Error(error.message);
      await api(`/api/recordings/${recordingId}/segments`, { method: "PUT", json: { index: segment, startOffset, duration: Math.round(dur * 100) / 100 } });
      await idb.deleteSegment(recordingId, segment);
      return;
    } catch (e) {
      if (e instanceof ApiError && [401, 403, 404, 409, 422].includes(e.status) && e.code !== "UPLOAD_MISSING") throw e;
      if (attempt >= 7) throw e;
      await sleep(Math.min(30_000, 1000 * 2 ** attempt));
    }
  }
}

/** Finishes an interrupted recording from what is still stored locally. */
export async function recoverRecording(recordingId: string, onProgress?: (done: number, total: number) => void) {
  const pending = (await idb.pending()).find((p) => p.recordingId === recordingId);
  if (!pending) return;
  let done = 0;
  for (const seg of pending.segments) {
    const meta = await idb.segmentMeta(recordingId, seg);
    const parts = await idb.parts(recordingId, seg);
    await uploadSegment(recordingId, seg, meta?.duration ?? null, parts[0]?.startOffset ?? 0);
    onProgress?.(++done, pending.segments.length);
  }
  await api(`/api/recordings/${recordingId}/finalize`, { method: "POST", json: {} });
}
