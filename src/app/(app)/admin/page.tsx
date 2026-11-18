import { requireAdmin } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, PageHeader, Stat } from "@/components/ui";
import { daysAgoIso } from "@/lib/stats";

export const metadata = { title: "Admin" };

export default async function AdminOverview() {
  await requireAdmin();
  const { t } = await getDictionary();
  const db = createAdminClient();
  const since7 = daysAgoIso(7);
  const since30 = daysAgoIso(30);
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);

  const [users, newUsers, activeCodes, redemptions, failedJobs, aiRows, subs, recMinutes] = await Promise.all([
    count(db.from("profiles").select("id", { count: "exact", head: true })),
    count(db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since7)),
    count(db.from("invitation_codes").select("id", { count: "exact", head: true }).eq("status", "active")),
    count(db.from("invitation_redemptions").select("id", { count: "exact", head: true }).eq("status", "redeemed")),
    count(db.from("processing_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since30)),
    db.from("usage_records").select("amount, cost_usd").eq("metric", "ai_requests").gte("created_at", since30),
    db.from("subscriptions").select("plan_id").in("status", ["active", "trialing", "past_due"]).neq("plan_id", "free"),
    db.from("usage_records").select("amount").eq("metric", "recording_minutes").gte("created_at", since30),
  ]);
  const aiRequests = (aiRows.data ?? []).reduce((a, r) => a + Number(r.amount), 0);
  const aiCost = (aiRows.data ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);
  const dist = (subs.data ?? []).reduce<Record<string, number>>((a, r) => ({ ...a, [r.plan_id]: (a[r.plan_id] ?? 0) + 1 }), {});
  const minutes = (recMinutes.data ?? []).reduce((a, r) => a + Number(r.amount), 0);

  return (
    <>
      <PageHeader title={t.admin.title} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t.admin.totalUsers} value={users} />
        <Stat label={t.admin.newUsers7d} value={newUsers} />
        <Stat label={t.admin.activeCodes} value={activeCodes} />
        <Stat label={t.admin.redemptions} value={redemptions} />
        <Stat label={t.admin.aiRequests30d} value={aiRequests} sub={`≈ $${aiCost.toFixed(2)}`} />
        <Stat label={t.admin.failedJobs} value={failedJobs} />
      </div>
      <Card className="mt-4 p-5">
        <p className="text-xs uppercase tracking-wider text-subtle">Plus / Premium · {t.common.minutes} (30d)</p>
        <p className="mt-2 text-sm text-muted">
          Plus: <span className="text-fg">{dist.plus ?? 0}</span> · Premium: <span className="text-fg">{dist.premium ?? 0}</span> · {Math.round(minutes)} {t.common.minutes}
        </p>
      </Card>
    </>
  );
}
