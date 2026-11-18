import { requireAdmin } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { setAccountStatusAction, setRoleAction, setUserLimitsAction } from "../actions";
import { monthStartIso } from "@/lib/stats";

export const metadata = { title: "Users" };
const LIMIT_METRICS = ["recording_minutes", "transcription_minutes", "ai_requests", "document_uploads", "exams_generated"] as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireAdmin();
  const { locale, t } = await getDictionary();
  const { q } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("profiles").select("id, full_name, email, status, created_at, country, limits_override").order("created_at", { ascending: false }).limit(100);
  if (q) {
    const term = q.replace(/[%,()]/g, "").slice(0, 80);
    query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  }
  const { data: users } = await query;
  const ids = (users ?? []).map((u) => u.id);
  const db = createAdminClient();
  const [{ data: roles }, { data: usage }, { data: plan }] = await Promise.all([
    db.from("user_roles").select("user_id, role").in("user_id", ids),
    db.from("usage_records").select("user_id, metric, amount").in("user_id", ids).gte("created_at", monthStartIso()),
    db.from("subscription_plans").select("limits").eq("id", "free").single(),
  ]);
  const standard = (plan?.limits ?? {}) as Record<string, number>;
  const df = new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { dateStyle: "medium" });

  return (
    <>
      <PageHeader title={t.admin.users} />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder={t.common.search} className="h-9 flex-1 rounded-lg border border-ink-600 bg-ink-850 px-3 text-sm" />
        <button className={buttonClass("secondary", "sm")}>{t.common.search}</button>
      </form>
      <Card className="divide-y divide-ink-800">
        {(users ?? []).map((u) => {
          const r = (roles ?? []).filter((x) => x.user_id === u.id).map((x) => x.role);
          const minutes = (usage ?? []).filter((x) => x.user_id === u.id && x.metric === "recording_minutes").reduce((a, x) => a + Number(x.amount), 0);
          const ai = (usage ?? []).filter((x) => x.user_id === u.id && x.metric === "ai_requests").reduce((a, x) => a + Number(x.amount), 0);
          const isSelf = u.id === session.userId;
          const isAdmin = r.includes("admin");
          return (
            <div key={u.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.full_name || "—"} <span className="text-sm font-normal text-muted">{u.email}</span></p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
                  {r.filter((x) => x !== "student").map((x) => <Badge key={x} tone="lime">{x}</Badge>)}
                  {u.status === "suspended" && <Badge tone="danger">suspended</Badge>}
                  {u.limits_override && <Badge tone="lime">{t.admin.customLimits}</Badge>}
                  <span>{df.format(new Date(u.created_at))} · {Math.round(minutes)} {t.common.minutes} · AI {ai}</span>
                </div>
              </div>
              {!isSelf && (
                <div className="flex gap-1.5">
                  <form action={setAccountStatusAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="status" value={u.status === "active" ? "suspended" : "active"} />
                    <button className={buttonClass(u.status === "active" ? "danger" : "secondary", "sm")}>
                      {u.status === "active" ? t.admin.suspend : t.admin.restore}
                    </button>
                  </form>
                  {session.isSuperAdmin && !r.includes("super_admin") && (
                    <form action={setRoleAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="grant" value={String(!isAdmin)} />
                      <button className={buttonClass("secondary", "sm")}>{isAdmin ? t.admin.removeAdmin : t.admin.makeAdmin}</button>
                    </form>
                  )}
                </div>
              )}
            </div>
            <details className="mt-3 rounded-xl border border-ink-700 px-3 py-2">
              <summary className="cursor-pointer text-sm text-muted">{t.admin.monthlyLimits}</summary>
              <form action={setUserLimitsAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <input type="hidden" name="userId" value={u.id} />
                {LIMIT_METRICS.map((m) => {
                  const own = (u.limits_override as Record<string, number> | null)?.[m];
                  const used = (usage ?? []).filter((x) => x.user_id === u.id && x.metric === m).reduce((a, x) => a + Number(x.amount), 0);
                  return (
                    <label key={m} className="text-xs text-muted">
                      {t.admin.metrics[m]} <span className="text-subtle">({Math.round(used)} {t.admin.usedShort})</span>
                      <input name={`limit_${m}`} type="number" min={0} max={1000000} defaultValue={own ?? ""} placeholder={`${t.admin.standard}: ${standard[m] ?? 0}`} className="mt-1 h-9 w-full rounded-md border border-ink-600 bg-ink-850 px-2 text-sm tabular-nums text-fg" />
                    </label>
                  );
                })}
                <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
                  <button className={buttonClass("primary", "sm")}>{t.common.save}</button>
                  {u.limits_override && <button name="reset" value="1" className={buttonClass("ghost", "sm")}>{t.admin.resetToStandard}</button>}
                </div>
              </form>
            </details>
            </div>
          );
        })}
        {!users?.length && <p className="p-6 text-center text-sm text-muted">{t.common.none}</p>}
      </Card>
    </>
  );
}
