import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { GenerateForm } from "./generate-form";
import { CodeActions } from "./code-actions";

export const metadata = { title: "Invitations" };
const PAGE = 50;

export default async function InvitationsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string; code?: string }> }) {
  await requireAdmin();
  const { locale, t } = await getDictionary();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const supabase = await createClient();

  let query = supabase
    .from("invitation_codes")
    .select("id, code, type, status, usage_limit, usage_count, expires_at, plan_id, benefit_days, note, restricted_email, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (sp.status && ["active", "disabled", "revoked"].includes(sp.status)) query = query.eq("status", sp.status);
  if (sp.q) query = query.ilike("code", `%${sp.q.replace(/[^A-Za-z0-9-]/g, "")}%`);
  const { data: codes, count } = await query;

  const selected = sp.code ? codes?.find((c) => c.id === sp.code) : undefined;
  const { data: redemptions } = selected
    ? await supabase
        .from("invitation_redemptions")
        .select("id, email, status, created_at, redeemed_at, user_id")
        .eq("code_id", selected.id)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: null };

  const df = new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { dateStyle: "medium" });
  const tone = { active: "ok", disabled: "warn", revoked: "danger" } as const;

  return (
    <>
      <PageHeader
        title={t.admin.invitations}
        actions={<a href="/admin/invitations/export" className={buttonClass("secondary", "sm")}>{t.admin.exportCsv}</a>}
      />
      <GenerateForm t={t.admin} />

      <form className="mt-8 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder={t.common.search} className="h-9 rounded-lg border border-ink-600 bg-ink-850 px-3 text-sm" />
        <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-lg border border-ink-600 bg-ink-850 px-2 text-sm">
          <option value="">—</option>
          {(["active", "disabled", "revoked"] as const).map((s) => <option key={s} value={s}>{t.admin.statuses[s]}</option>)}
        </select>
        <button className={buttonClass("secondary", "sm")}>{t.common.search}</button>
      </form>

      <Card className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-ink-700 text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-4 py-3">{t.admin.code}</th>
              <th className="px-4 py-3">{t.admin.type}</th>
              <th className="px-4 py-3">{t.admin.status}</th>
              <th className="px-4 py-3">{t.admin.used}</th>
              <th className="px-4 py-3">{t.admin.expiresAt}</th>
              <th className="px-4 py-3">{t.admin.created}</th>
              <th className="px-4 py-3 text-right">{t.admin.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {(codes ?? []).map((c) => (
              <tr key={c.id} className={c.id === selected?.id ? "bg-ink-850" : undefined}>
                <td className="px-4 py-3">
                  <span className="font-mono">{c.code}</span>
                  {c.note && <p className="text-xs text-subtle">{c.note}</p>}
                  {c.restricted_email && <p className="text-xs text-subtle">→ {c.restricted_email}</p>}
                </td>
                <td className="px-4 py-3">
                  {t.admin.types[c.type as keyof typeof t.admin.types]}
                  {c.plan_id !== "free" && <span className="text-xs text-subtle"> · {c.plan_id}{c.benefit_days ? ` ${c.benefit_days}d` : ""}</span>}
                </td>
                <td className="px-4 py-3"><Badge tone={tone[c.status as keyof typeof tone]}>{t.admin.statuses[c.status as keyof typeof t.admin.statuses]}</Badge></td>
                <td className="px-4 py-3 tabular-nums">
                  <Link href={`?code=${c.id}`} className="hover:text-lime">{c.usage_count} / {c.usage_limit}</Link>
                </td>
                <td className="px-4 py-3 text-muted">{c.expires_at ? df.format(new Date(c.expires_at)) : "—"}</td>
                <td className="px-4 py-3 text-muted">{df.format(new Date(c.created_at))}</td>
                <td className="px-4 py-3"><CodeActions code={c} t={t.admin} common={t.common} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!codes?.length && <p className="p-6 text-center text-sm text-muted">{t.common.none}</p>}
      </Card>
      <div className="mt-3 flex justify-between text-sm text-muted">
        <span>{count ?? 0}</span>
        <span className="flex gap-3">
          {page > 0 && <Link href={`?page=${page - 1}&status=${sp.status ?? ""}&q=${sp.q ?? ""}`}>←</Link>}
          {(count ?? 0) > (page + 1) * PAGE && <Link href={`?page=${page + 1}&status=${sp.status ?? ""}&q=${sp.q ?? ""}`}>→</Link>}
        </span>
      </div>

      {selected && (
        <Card className="mt-6 p-5">
          <h2 className="font-semibold">{t.admin.viewRedemptions}: <span className="font-mono">{selected.code}</span></h2>
          <ul className="mt-3 divide-y divide-ink-800 text-sm">
            {(redemptions ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{r.email}</span>
                <span className="text-muted">{r.status} · {df.format(new Date(r.redeemed_at ?? r.created_at))}</span>
              </li>
            ))}
            {!redemptions?.length && <li className="py-2 text-muted">{t.common.none}</li>}
          </ul>
        </Card>
      )}
    </>
  );
}
