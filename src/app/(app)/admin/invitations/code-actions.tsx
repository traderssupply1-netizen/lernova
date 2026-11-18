"use client";

import { useTransition } from "react";
import { updateInvitationAction } from "../actions";
import type { Dictionary } from "@/lib/i18n/hu";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Code = { id: string; status: string; usage_limit: number; expires_at: string | null };

export function CodeActions({ code, t, common }: { code: Code; t: Dictionary["admin"]; common: Dictionary["common"] }) {
  const [pending, start] = useTransition();
  const submit = (status: string) => {
    const fd = new FormData();
    fd.set("id", code.id);
    fd.set("status", status);
    fd.set("usageLimit", String(code.usage_limit));
    if (code.expires_at) fd.set("expiresAt", code.expires_at);
    return new Promise<void>((resolve) => start(async () => { await updateInvitationAction(fd); resolve(); }));
  };
  if (code.status === "revoked") return null;
  return (
    <div className="flex justify-end gap-1.5">
      <Button size="sm" variant="secondary" loading={pending} onClick={() => submit(code.status === "active" ? "disabled" : "active")}>
        {code.status === "active" ? t.disable : t.enable}
      </Button>
      <ConfirmDialog
        title={t.revoke}
        body={t.revokeBody}
        confirmLabel={t.revoke}
        cancelLabel={common.cancel}
        onConfirm={() => submit("revoked")}
        trigger={(open) => <Button size="sm" variant="danger" onClick={open}>{t.revoke}</Button>}
      />
    </div>
  );
}
