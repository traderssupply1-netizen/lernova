"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Input } from "./index";

/** Accessible confirmation dialog built on <dialog>. Optional typed confirmation word. */
export function ConfirmDialog({
  trigger,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  requireWord,
  requireWordLabel,
  tone = "danger",
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => Promise<void> | void;
  requireWord?: string;
  requireWordLabel?: string;
  tone?: "danger" | "primary";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [word, setWord] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      {trigger(() => setOpen(true))}
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        className="m-auto w-[min(92vw,420px)] rounded-2xl border border-ink-600 bg-ink-900 p-0 text-fg backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="mt-2 text-sm text-muted">{body}</div>
          {requireWord && (
            <div className="mt-4">
              <label className="mb-1.5 block text-sm" htmlFor="confirm-word">
                {requireWordLabel}
              </label>
              <Input id="confirm-word" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button
              variant={tone}
              loading={busy}
              disabled={Boolean(requireWord) && word.trim() !== requireWord}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
