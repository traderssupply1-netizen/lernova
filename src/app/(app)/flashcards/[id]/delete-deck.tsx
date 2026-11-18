"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/hu";
import { api } from "@/lib/recorder/uploader";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteDeck({ t, id, backHref }: { t: Dictionary; id: string; backHref: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title={t.study.deleteDeck}
      body={t.common.cannotUndo}
      confirmLabel={t.common.delete}
      cancelLabel={t.common.cancel}
      onConfirm={async () => {
        await api(`/api/flashcard-sets/${id}`, { method: "DELETE" });
        router.push(backHref);
        router.refresh();
      }}
      trigger={(open) => <Button variant="ghost" size="sm" onClick={open} aria-label={t.study.deleteDeck}><Trash2 className="size-4" aria-hidden /></Button>}
    />
  );
}
