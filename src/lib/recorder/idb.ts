/**
 * IndexedDB store for recording parts. Every MediaRecorder timeslice is written
 * here first, so a crash, reload or lost connection never loses captured audio.
 * Parts are deleted only after their segment is confirmed uploaded.
 */
export type StoredPart = {
  key: string; // `${recordingId}|${segment}|${part}`
  recordingId: string;
  segment: number;
  part: number;
  blob: Blob;
  mime: string;
  startOffset: number; // segment start in seconds of active recording time
  createdAt: number;
};
export type StoredSegment = { key: string; recordingId: string; segment: number; duration: number | null; lessonId: string; title: string };

const DB = "lernova-recorder";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("parts")) db.createObjectStore("parts", { keyPath: "key" }).createIndex("recordingId", "recordingId");
      if (!db.objectStoreNames.contains("segments")) db.createObjectStore("segments", { keyPath: "key" }).createIndex("recordingId", "recordingId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: "parts" | "segments", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? (req as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const idb = {
  supported: () => typeof indexedDB !== "undefined",
  putPart: (p: StoredPart) => tx("parts", "readwrite", (s) => s.put(p)),
  putSegment: (s: StoredSegment) => tx("segments", "readwrite", (st) => st.put(s)),
  async parts(recordingId: string, segment: number): Promise<StoredPart[]> {
    const all = ((await tx<StoredPart[]>("parts", "readonly", (s) => s.index("recordingId").getAll(recordingId))) ?? []) as StoredPart[];
    return all.filter((p) => p.segment === segment).sort((a, b) => a.part - b.part);
  },
  async deleteSegment(recordingId: string, segment: number) {
    const parts = await idb.parts(recordingId, segment);
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["parts", "segments"], "readwrite");
      parts.forEach((p) => t.objectStore("parts").delete(p.key));
      t.objectStore("segments").delete(`${recordingId}|${segment}`);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  /** Recordings that still have audio waiting to be uploaded. */
  async pending(): Promise<{ recordingId: string; lessonId: string; title: string; segments: number[] }[]> {
    const parts = ((await tx<StoredPart[]>("parts", "readonly", (s) => s.getAll())) ?? []) as StoredPart[];
    const segs = ((await tx<StoredSegment[]>("segments", "readonly", (s) => s.getAll())) ?? []) as StoredSegment[];
    const map = new Map<string, { recordingId: string; lessonId: string; title: string; segments: Set<number> }>();
    for (const p of parts) {
      const meta = segs.find((s) => s.recordingId === p.recordingId);
      if (!map.has(p.recordingId)) map.set(p.recordingId, { recordingId: p.recordingId, lessonId: meta?.lessonId ?? "", title: meta?.title ?? "", segments: new Set() });
      map.get(p.recordingId)!.segments.add(p.segment);
    }
    return [...map.values()].map((v) => ({ ...v, segments: [...v.segments].sort((a, b) => a - b) }));
  },
  async segmentMeta(recordingId: string, segment: number) {
    return (await tx<StoredSegment>("segments", "readonly", (s) => s.get(`${recordingId}|${segment}`))) as StoredSegment | undefined;
  },
  async discard(recordingId: string) {
    const p = await idb.pending();
    for (const r of p.filter((x) => x.recordingId === recordingId)) for (const s of r.segments) await idb.deleteSegment(recordingId, s);
  },
};
