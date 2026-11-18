import Link from "next/link";
import { BookOpenCheck, Brain, Check, FileText, Layers, Mic, Sparkles } from "lucide-react";
import { getDictionary } from "@/lib/i18n";
import { FEATURE_LABELS, formatPrice, getPlans } from "@/lib/plans";
import { Badge, buttonClass, Card, cn } from "@/components/ui";

// What is actually shipped; the landing page must not overclaim.
const LIVE = { recorder: true, notes: true, tutor: false, exams: false, flashcards: false } as const;

export default async function LandingPage() {
  const { locale, t } = await getDictionary();
  const L = t.landing;
  const plans = await getPlans();
  const features = [
    { key: "recorder", icon: Mic },
    { key: "notes", icon: FileText },
    { key: "tutor", icon: Brain },
    { key: "exams", icon: BookOpenCheck },
    { key: "flashcards", icon: Layers },
  ] as const;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-3xl rounded-full bg-lime/10 blur-[120px]" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <Badge tone="lime" className="mb-6"><Sparkles className="size-3" aria-hidden /> {L.badge}</Badge>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">{L.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">{L.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className={buttonClass("primary", "lg")}>{L.ctaPrimary}</Link>
            <a href="#features" className={buttonClass("secondary", "lg")}>{L.ctaSecondary}</a>
          </div>
        </div>
      </section>

      {/* Product demonstration */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6" aria-labelledby="demo-title">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
            <h2 id="demo-title" className="text-sm font-medium text-muted">{L.demoTitle}</h2>
            <span className="text-xs text-subtle">{L.demoNote}</span>
          </div>
          <div className="grid grid-cols-1 gap-0 md:grid-cols-[1.1fr_1fr]">
            <div className="min-w-0 border-b border-ink-700 p-5 md:border-b-0 md:border-r sm:p-7">
              <p className="text-xs uppercase tracking-wider text-subtle">{L.demoLesson}</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="size-2.5 rounded-full bg-danger animate-pulse-rec" aria-hidden />
                <span className="font-mono text-2xl tabular-nums">24:16</span>
              </div>
              <div className="mt-5 flex h-16 items-center gap-[3px] overflow-hidden" aria-hidden>
                {Array.from({ length: 56 }, (_, i) => (
                  <span key={i} className="w-1 shrink-0 rounded-full bg-lime/70" style={{ height: `${18 + Math.abs(Math.sin(i * 0.7) * 70) + (i % 5) * 3}%` }} />
                ))}
              </div>
            </div>
            <div className="min-w-0 p-5 sm:p-7">
              <p className="text-xs uppercase tracking-wider text-lime">{L.demoQuick}</p>
              <ul className="mt-4 space-y-3 text-sm text-fg/90">
                {L.demoPoints.map((p, i) => (
                  <li key={p} className="flex gap-3">
                    <span className="mt-0.5 font-mono text-xs text-lime">[{String(3 + i * 6).padStart(2, "0")}:{i ? "40" : "12"}]</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" aria-labelledby="how-title">
        <h2 id="how-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{L.howTitle}</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {L.howSteps.map((s, i) => (
            <li key={s.t}>
              <Card className="h-full p-5">
                <span className="font-mono text-xs text-lime">0{i + 1}</span>
                <h3 className="mt-3 font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-20 sm:px-6" aria-labelledby="features-title">
        <h2 id="features-title" className="sr-only">{t.nav.features}</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ key, icon: Icon }, i) => (
            <Card key={key} className={cn("p-6", i === 0 && "lg:col-span-2")}>
              <div className="flex items-start justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-ink-700 text-lime"><Icon className="size-5" aria-hidden /></span>
                <Badge tone={LIVE[key] ? "ok" : "neutral"}>{LIVE[key] ? L.statusLive : L.statusSoon}</Badge>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{L.features[key].t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{L.features[key].d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-20 sm:px-6" aria-labelledby="pricing-title">
        <h2 id="pricing-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{L.pricingTitle}</h2>
        <p className="mt-2 text-muted">{L.pricingSubtitle}</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className={cn("flex flex-col p-6", p.id === "plus" && "border-lime/40")}>
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-3">
                <span className="text-4xl font-semibold tabular-nums">{formatPrice(p.monthly_price_cents, p.currency, locale)}</span>
                {p.monthly_price_cents > 0 && <span className="text-muted">{L.perMonth}</span>}
              </p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-muted">
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-lime" aria-hidden />{p.limits.recording_minutes} {t.common.minutes} / {locale === "hu" ? "hó felvétel" : "mo recording"}</li>
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-lime" aria-hidden />{FEATURE_LABELS[f]?.[locale] ?? f}</li>
                ))}
              </ul>
              <Link href="/register" className={buttonClass(p.id === "plus" ? "primary" : "secondary", "md", "mt-6 w-full")}>{L.planCta}</Link>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 sm:px-6" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{L.faqTitle}</h2>
        <div className="mt-6 divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900">
          {L.faqs.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.q}
                <span className="text-lime transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Card className="relative overflow-hidden p-8 text-center sm:p-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(198_244_50/0.12),transparent_60%)]" aria-hidden />
          <h2 className="relative text-2xl font-semibold tracking-tight sm:text-4xl">{L.finalTitle}</h2>
          <p className="relative mt-3 text-muted">{L.finalSubtitle}</p>
          <Link href="/register" className={buttonClass("primary", "lg", "relative mt-8")}>{L.ctaPrimary}</Link>
        </Card>
      </section>
    </>
  );
}
