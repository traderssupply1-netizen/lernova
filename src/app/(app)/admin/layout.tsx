import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const { t } = await getDictionary();
  const tabs = [
    ["/admin", t.admin.overview],
    ["/admin/invitations", t.admin.invitations],
    ["/admin/users", t.admin.users],
    ["/admin/system", t.admin.system],
  ] as const;
  return (
    <div>
      <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto pb-1" aria-label={t.admin.title}>
        {tabs.map(([href, label]) => (
          <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-ink-800 hover:text-fg">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
