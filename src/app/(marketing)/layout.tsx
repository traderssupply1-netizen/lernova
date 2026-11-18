import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getSession } from "@/lib/auth";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { buttonClass } from "@/components/ui";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getDictionary();
  const session = await getSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6" aria-label="Main">
          <Logo />
          <div className="hidden items-center gap-6 text-sm text-muted md:flex">
            <Link href="/#features" className="hover:text-fg">{t.nav.features}</Link>
            <Link href="/#faq" className="hover:text-fg">{t.nav.faq}</Link>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher locale={locale} />
            {session ? (
              <Link href="/dashboard" className={buttonClass("primary", "sm")}>{t.nav.dashboard}</Link>
            ) : (
              <>
                <Link href="/login" className={buttonClass("ghost", "sm", "max-sm:hidden")}>{t.nav.login}</Link>
                <Link href="/register" className={buttonClass("primary", "sm")}>{t.nav.register}</Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-ink-800 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <div className="flex flex-wrap gap-5 text-sm text-muted">
            <Link href="/privacy" className="hover:text-fg">{t.landing.privacy}</Link>
            <Link href="/terms" className="hover:text-fg">{t.landing.terms}</Link>
            <Link href="/privacy#cookies" className="hover:text-fg">{t.landing.cookies}</Link>
          </div>
          <p className="text-xs text-subtle">© {new Date().getFullYear()} LERNOVA. {t.landing.footerRights}</p>
        </div>
      </footer>
    </div>
  );
}
