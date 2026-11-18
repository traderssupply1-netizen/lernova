import { requireAdmin } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { integrationStatus } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { setAiProviderAction, updatePlanLimitsAction } from "../actions";

export const metadata = { title: "System" };

const METRICS = ["recording_minutes", "transcription_minutes", "ai_requests", "document_uploads", "exams_generated", "storage_mb"] as const;

export default async function SystemPage() {
  await requireAdmin();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: plans }, { data: setting }, { data: errors }] = await Promise.all([
    supabase.from("subscription_plans").select("*").order("sort_order"),
    supabase.from("app_settings").select("value").eq("key", "ai_provider").maybeSingle(),
    supabase.from("processing_jobs").select("id, type, error, attempts, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(20),
  ]);
  const integrations = integrationStatus();
  const provider = (setting?.value as string) ?? "anthropic";
  const df = new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <PageHeader title={t.admin.system} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">{t.admin.integrations}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {Object.entries(integrations).map(([k, ok]) => (
              <li key={k} className="flex justify-between">
                <span className="font-mono text-muted">{k}</span>
                <Badge tone={ok ? "ok" : "warn"}>{ok ? t.admin.configured : t.admin.missing}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">{t.admin.activeAi}</h2>
          <form action={setAiProviderAction} className="mt-3 flex gap-2">
            {(["anthropic", "openai"] as const).map((p) => (
              <button
                key={p}
                name="provider"
                value={p}
                disabled={!integrations[p]}
                className={buttonClass(provider === p ? "primary" : "secondary", "sm")}
                title={!integrations[p] ? t.admin.missing : undefined}
              >
                {p === "anthropic" ? "Anthropic Claude" : "OpenAI"}
              </button>
            ))}
          </form>
          <p className="mt-3 text-xs text-subtle">Speech-to-text: OpenAI Whisper · {integrations.whisper ? t.admin.configured : t.admin.missing}</p>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 font-semibold">{t.admin.plans}</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {(plans ?? []).map((p) => (
          <Card key={p.id} className="p-5">
            <form action={updatePlanLimitsAction} className="space-y-2 text-sm">
              <input type="hidden" name="id" value={p.id} />
              <p className="font-semibold">{p.name}</p>
              {(["monthly_price_cents", "annual_price_cents"] as const).map((f) => (
                <label key={f} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted">{f}</span>
                  <input name={f} type="number" min={0} defaultValue={p[f]} className="h-8 w-28 rounded-md border border-ink-600 bg-ink-850 px-2 text-right tabular-nums" />
                </label>
              ))}
              {METRICS.map((m) => (
                <label key={m} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted">{m}</span>
                  <input name={m} type="number" min={0} defaultValue={(p.limits as Record<string, number>)[m] ?? 0} className="h-8 w-28 rounded-md border border-ink-600 bg-ink-850 px-2 text-right tabular-nums" />
                </label>
              ))}
              <button className={buttonClass("secondary", "sm", "mt-2 w-full")}>{t.common.save}</button>
            </form>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 font-semibold">{t.admin.recentErrors}</h2>
      <Card className="divide-y divide-ink-800 text-sm">
        {(errors ?? []).map((e) => (
          <div key={e.id} className="p-4">
            <p className="font-mono text-xs text-subtle">{e.type} · {df.format(new Date(e.created_at))} · ×{e.attempts}</p>
            <p className="mt-1 break-words text-danger">{e.error}</p>
          </div>
        ))}
        {!errors?.length && <p className="p-6 text-center text-muted">{t.common.none}</p>}
      </Card>
    </>
  );
}
