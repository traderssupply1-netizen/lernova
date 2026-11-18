import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { integrationStatus } from "@/lib/env";
import { fmt } from "@/lib/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { Alert, Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { logoutAction } from "@/app/(auth)/actions";
import { ProfileForm, DeleteAccount } from "./settings-forms";

export const metadata = { title: "Settings" };
const METRICS = ["recording_minutes", "transcription_minutes", "ai_requests", "document_uploads", "exams_generated"] as const;

export default async function SettingsPage() {
  const s = await requireUser("/settings");
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const quotas = await Promise.all(METRICS.map((m) => supabase.rpc("my_quota", { p_metric: m }).then((r) => [m, Number(r.data ?? 0)] as const)));
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan_id, source, current_period_end")
    .in("status", ["active", "trialing", "past_due"])
    .neq("plan_id", "free")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const df = new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { dateStyle: "long" });
  const labels: Record<string, { hu: string; en: string }> = {
    recording_minutes: { hu: "Felvétel (perc)", en: "Recording (min)" },
    transcription_minutes: { hu: "Átírás (perc)", en: "Transcription (min)" },
    ai_requests: { hu: "AI-kérések", en: "AI requests" },
    document_uploads: { hu: "Dokumentumok", en: "Documents" },
    exams_generated: { hu: "Vizsgák", en: "Exams" },
  };

  return (
    <>
      <PageHeader title={t.settings.title} />
      <div className="space-y-4">
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">{t.settings.profile}</h2>
          <ProfileForm t={t} profile={s.profile} email={s.email} />
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t.settings.subscription}</h2>
            <Badge tone="lime">{s.plan}</Badge>
          </div>
          {sub && (
            <p className="mt-2 text-sm text-muted">
              {sub.source === "invitation" ? (locale === "hu" ? "Meghívóból" : "From invitation") : sub.source}
              {sub.current_period_end && ` · ${df.format(new Date(sub.current_period_end))}`}
            </p>
          )}
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {quotas.map(([m, left]) => (
              <li key={m} className="flex justify-between rounded-lg bg-ink-850 px-3 py-2">
                <span className="text-muted">{labels[m][locale]}</span>
                <span className="tabular-nums">{left >= 1e8 ? "∞" : Math.floor(left)}</span>
              </li>
            ))}
          </ul>
          {!integrationStatus().stripe && <Alert tone="info" className="mt-4">{fmt(t.common.notConfigured, { name: "Stripe" })}</Alert>}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">{t.settings.privacy}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/api/account" className={buttonClass("secondary", "sm")}>{t.settings.exportData}</a>
            <form action={logoutAction}>
              <input type="hidden" name="scope" value="global" />
              <button className={buttonClass("secondary", "sm")}>{t.settings.signOutAll}</button>
            </form>
          </div>
          <div className="mt-6 border-t border-ink-700 pt-5">
            <DeleteAccount t={t} />
          </div>
        </Card>
      </div>
    </>
  );
}
