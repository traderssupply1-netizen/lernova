import { requireAdmin } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { setAccountStatusAction, setRoleAction } from "../actions";
import { monthStartIso } from "@/lib/stats";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireAdmin();
  const { locale, t } = await getDictionary();
  const { q } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("profiles").select("id, full_name, email, status, created_at, country").order("created_at", { ascending: false }).limit(100);
  if (q) {
    const term = q.replace(/[%,()]/g, "").slice(0, 80);
    query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  }
  const { data: users } = await query;
  const ids = (users ?? []).map((u) => u.id);
  const db = createAdminClient();
  const [{ data: roles }, { data: usage }] = await Promise.all([
    db.from("user_roles").select("user_id, role").in("user_id", ids),
    db.from("usage_records").select("user_id, metric, amount").in("user_id", ids).gte("created_at", monthStartIso()),
  ]);
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
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.full_name || "—"} <span className="text-sm font-normal text-muted">{u.email}</span></p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
                  {r.filter((x) => x !== "student").map((x) => <Badge key={x} tone="lime">{x}</Badge>)}
                  {u.status === "suspended" && <Badge tone="danger">suspended</Badge>}
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
          );
        })}
        {!users?.length && <p className="p-6 text-center text-sm text-muted">{t.common.none}</p>}
      </Card>
    </>
  );
}
