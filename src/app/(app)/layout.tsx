import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { integrationStatus } from "@/lib/env";
import { fmt } from "@/lib/i18n/format";
import { Alert } from "@/components/ui";
import { AppNav, type NavItem } from "@/components/layout/app-nav";
import { Logo } from "@/components/layout/logo";
import { logoutAction } from "@/app/(auth)/actions";
import { LogOut } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getDictionary();
  if (!integrationStatus().supabase) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <Alert tone="warn">{fmt(t.common.notConfigured, { name: "Supabase" })}</Alert>
      </main>
    );
  }
  const session = await requireUser();
  const items = [
    { href: "/dashboard", label: t.nav.dashboard, icon: "home" as const },
    { href: "/record", label: t.nav.record, icon: "mic" as const },
    { href: "/lessons", label: t.nav.lessons, icon: "book" as const },
    { href: "/settings", label: t.nav.settings, icon: "settings" as const },
    ...(session.isAdmin ? [{ href: "/admin", label: t.nav.admin, icon: "shield" as const }] : []),
  ] satisfies NavItem[];

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-ink-800 bg-ink-950 p-4 md:flex">
        <div className="px-2 py-3"><Logo href="/dashboard" /></div>
        <AppNav items={items} variant="side" />
        <div className="mt-auto border-t border-ink-800 pt-4">
          <p className="truncate px-2 text-sm font-medium">{session.profile.full_name || session.email}</p>
          <p className="truncate px-2 text-xs text-subtle">{session.plan.toUpperCase()}</p>
          <form action={logoutAction} className="mt-3">
            <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted hover:bg-ink-800 hover:text-fg">
              <LogOut className="size-4" aria-hidden /> {t.nav.logout}
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-800 bg-ink-950/85 px-4 backdrop-blur-xl pt-[env(safe-area-inset-top)] md:hidden">
          <Logo href="/dashboard" />
          <form action={logoutAction}>
            <button className="rounded-lg p-2 text-muted hover:text-fg" aria-label={t.nav.logout}><LogOut className="size-5" aria-hidden /></button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-10">{children}</main>
        <AppNav items={items} variant="bottom" />
      </div>
    </div>
  );
}
