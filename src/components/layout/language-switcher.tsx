import { setLocaleAction } from "@/app/(auth)/actions";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/components/ui";

/** Works without JavaScript: a tiny form that posts to a server action. */
export function LanguageSwitcher({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <form action={setLocaleAction} className={cn("flex rounded-lg border border-ink-600 p-0.5 text-xs font-medium", className)}>
      {(["hu", "en"] as const).map((l) => (
        <button
          key={l}
          name="locale"
          value={l}
          aria-pressed={locale === l}
          className={cn("rounded-md px-2.5 py-1 uppercase transition-colors", locale === l ? "bg-ink-600 text-fg" : "text-subtle hover:text-fg")}
        >
          {l}
        </button>
      ))}
    </form>
  );
}
