"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/hu";
import { api, ApiError } from "@/lib/recorder/uploader";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Alert, Button, Card } from "@/components/ui";

const ACCEPT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/plain",
};
const MAX_BYTES = 15 * 1024 * 1024;

export function UploadForm({ t, left }: { t: Dictionary; left: number }) {
  const S = t.study;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"idle" | "uploading" | "processing">("idle");
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPT[ext]) return setError(S.uploadErrors.UNSUPPORTED_TYPE);
    if (f.size > MAX_BYTES) return setError(S.uploadErrors.TOO_LARGE);
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setError(null);
    const ext = file.name.split(".").pop()!.toLowerCase();
    const mimeType = ACCEPT[ext];
    try {
      setStep("uploading");
      const reg = await api<{ documentId: string; path: string; token: string }>("/api/documents", { method: "POST", json: { fileName: file.name, mimeType, size: file.size } });
      const { error: upError } = await createBrowserSupabase().storage.from("documents").uploadToSignedUrl(reg.path, reg.token, file, { contentType: mimeType });
      if (upError) throw new ApiError("UPLOAD_FAILED", 500);
      setStep("processing");
      const r = await api<{ lessonId: string }>(`/api/documents/${reg.documentId}/process`, { method: "POST" });
      router.push(`/lessons/${r.lessonId}`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "UNKNOWN";
      setError((S.uploadErrors as Record<string, string>)[code] ?? t.common.somethingWrong);
      setStep("idle");
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-ink-600 px-4 py-10 text-center hover:border-lime/60"
      >
        <FileUp className="size-8 text-lime" aria-hidden />
        <span className="font-medium">{file ? file.name : S.chooseFile}</span>
        <span className="text-sm text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : S.fileTypes}</span>
      </button>
      <input ref={input} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      {error && <Alert tone="warn" className="mt-4">{error}</Alert>}
      <Button size="lg" className="mt-4 w-full" disabled={!file || left < 1} loading={step !== "idle"} onClick={upload}>
        {step === "uploading" ? S.uploading : step === "processing" ? S.processingDoc : S.uploadButton}
      </Button>
      <p className="mt-3 text-xs text-subtle">{S.uploadsLeft.replace("{n}", String(Math.floor(left)))} · {S.scannedNote}</p>
    </Card>
  );
}
