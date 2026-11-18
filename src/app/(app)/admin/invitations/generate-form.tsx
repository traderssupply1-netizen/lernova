"use client";

import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { generateInvitationsAction, type GenerateState } from "../actions";
import type { Dictionary } from "@/lib/i18n/hu";
import { fmt } from "@/lib/i18n/format";
import { Alert, Button, Card, Input, Label, Select } from "@/components/ui";

const LIMIT_METRICS = ["recording_minutes", "transcription_minutes", "ai_requests", "document_uploads", "exams_generated"] as const;

export function GenerateForm({ t }: { t: Dictionary["admin"] }) {
  const [state, action, pending] = useActionState<GenerateState, FormData>(generateInvitationsAction, undefined);
  const [type, setType] = useState("general");
  const [copied, setCopied] = useState(false);

  return (
    <Card className="p-5">
      <h2 className="font-semibold">{t.generate}</h2>
      <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="type">{t.type}</Label>
          <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {(["general", "private"] as const).map((k) => <option key={k} value={k}>{t.types[k]}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="count">{t.count}</Label>
          <Input id="count" name="count" type="number" min={1} max={500} defaultValue={1} required />
        </div>
        <div>
          <Label htmlFor="usageLimit">{t.usageLimit}</Label>
          <Input id="usageLimit" name="usageLimit" type="number" min={1} max={type === "private" ? 5 : 100000} defaultValue={1} required />
        </div>
        <div>
          <Label htmlFor="expiresAt">{t.expiresAt}</Label>
          <Input id="expiresAt" name="expiresAt" type="date" />
        </div>
        <div>
          <Label htmlFor="prefix">{t.prefix}</Label>
          <Input id="prefix" name="prefix" defaultValue="LRN" maxLength={8} className="font-mono uppercase" />
        </div>
        {type === "private" && (
          <div>
            <Label htmlFor="restrictedEmail">{t.restrictedEmail}</Label>
            <Input id="restrictedEmail" name="restrictedEmail" type="email" />
          </div>
        )}
        <details className="rounded-xl border border-ink-700 p-3 sm:col-span-2 lg:col-span-4">
          <summary className="cursor-pointer text-sm font-medium">{t.customLimits}</summary>
          <p className="mt-2 text-xs text-subtle">{t.customLimitsHint}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {LIMIT_METRICS.map((m) => (
              <div key={m}>
                <Label htmlFor={`limit_${m}`}>{t.metrics[m]}</Label>
                <Input id={`limit_${m}`} name={`limit_${m}`} type="number" min={0} max={1000000} placeholder={t.standard} />
              </div>
            ))}
          </div>
        </details>
        <div className="sm:col-span-2">
          <Label htmlFor="note">{t.note}</Label>
          <Input id="note" name="note" maxLength={500} />
        </div>
        <div className="flex items-end">
          <Button type="submit" loading={pending} className="w-full">{t.generate}</Button>
        </div>
      </form>
      {state?.error && <Alert tone="error" className="mt-4">{state.error}</Alert>}
      {state?.codes && (
        <div className="mt-4 rounded-xl border border-lime/30 bg-lime/5 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-lime">{fmt(t.generated, { count: state.codes.length })}</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(state.codes!.join("\n"));
                setCopied(true);
              }}
            >
              <Copy className="size-3.5" aria-hidden /> {copied ? "✓" : "Copy"}
            </Button>
          </div>
          <pre className="mt-3 max-h-48 overflow-auto font-mono text-sm leading-relaxed">{state.codes.join("\n")}</pre>
        </div>
      )}
    </Card>
  );
}
