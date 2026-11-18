import { getDictionary } from "@/lib/i18n";
import { integrationStatus } from "@/lib/env";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Alert } from "@/components/ui";
import { fmt } from "@/lib/i18n/format";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getDictionary();
  const configured = integrationStatus().supabase_admin;
  return (
    <div className="flex min-h-dvh flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="mx-auto flex h-16 w-full max-w-md items-center justify-between">
        <Logo />
        <LanguageSwitcher locale={locale} />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
        {!configured && <Alert tone="warn" className="mb-6">{fmt(t.common.notConfigured, { name: "Supabase" })}</Alert>}
        {children}
      </main>
    </div>
  );
}
