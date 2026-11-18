import Link from "next/link";
import { Shield } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { buttonClass, Card, PageHeader } from "@/components/ui";
import { logoutAction } from "@/app/(auth)/actions";
import { ProfileForm, DeleteAccount } from "./settings-forms";

export const metadata = { title: "Settings" };
const METRICS = ["recording_minutes", "transcription_minutes", "ai_requests", "document_uploads", "exams_generated"] as const;

export default async function SettingsPage() {
  const s = await requireUser("/settings");
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const { data: allowance } = await supabase.rpc("my_allowance");
  const al = (allowance ?? {}) as Record<string, { limit: number; used: number; left: number }>;
  const resetDate = new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { month: "long", day: "numeric" }).format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1));
  const labels: Record<string, { hu: string; en: string }> = {
    recording_minutes: { hu: "Felvétel (perc)", en: "Recording (min)" },
    transcription_minutes: { hu: "Átírás (perc)", en: "Transcription (min)" },
    ai_requests: { hu: "AI-kérések (jegyzet, kártya, tanár)", en: "AI requests (notes, cards, tutor)" },
    document_uploads: { hu: "Feltöltött dokumentumok", en: "Uploaded documents" },
    exams_generated: { hu: "Gyakorló vizsgák", en: "Practice exams" },
  };

  return (
    <>
      <PageHeader title={t.settings.title} actions={s.isAdmin ? <Link href="/admin" className={buttonClass("secondary", "sm")}><Shield className="size-4" aria-hidden /> {t.nav.admin}</Link> : undefined} />
      <div className="space-y-4">
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">{t.settings.profile}</h2>
          <ProfileForm t={t} profile={s.profile} email={s.email} />
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">{t.settings.allowance}</h2>
          <p className="mt-1 text-sm text-muted">{fmt(t.settings.allowanceReset, { date: resetDate })}</p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {METRICS.filter((m) => al[m]).map((m) => {
              const { limit, used } = al[m];
              const pct = limit > 0 ? Math.min(100, (Number(used) / Number(limit)) * 100) : 100;
              return (
                <li key={m} className="rounded-lg bg-ink-850 px-3 py-2">
                  <div className="flex justify-between">
                    <span className="text-muted">{labels[m][locale]}</span>
                    <span className="tabular-nums">{Math.floor(Number(used))} / {Number(limit)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <div className={pct >= 90 ? "h-full bg-danger" : "h-full bg-lime"} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
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
