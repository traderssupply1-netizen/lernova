import Link from "next/link";
import { BookOpenCheck, Brain, FileText, Layers, Mic, Plus, Sparkles } from "lucide-react";
import { getDictionary } from "@/lib/i18n";
import { Badge, buttonClass, Card, cn } from "@/components/ui";

// What is actually shipped; the landing page must not overclaim.
const LIVE = { recorder: true, notes: true, tutor: true, exams: true, flashcards: true } as const;

export default async function LandingPage() {
  const { t } = await getDictionary();
  const L = t.landing;
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
        <div className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-3xl rounded-full bg-lime/[0.06] blur-[120px]" aria-hidden />
        <div className="reveal relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-6 sm:pt-24">
          <Badge tone="lime" className="mb-6"><Sparkles className="size-3" aria-hidden /> {L.badge}</Badge>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">{L.heroTitle}</h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-pretty text-muted sm:text-lg">{L.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className={buttonClass("primary", "lg")}>{L.ctaPrimary}</Link>
            <a href="#features" className={buttonClass("secondary", "lg")}>{L.ctaSecondary}</a>
          </div>
        </div>
      </section>

      {/* Product demonstration */}
      <section className="mx-auto max-w-6xl px-5 sm:px-6" aria-labelledby="demo-title">
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
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-6 sm:py-32" aria-labelledby="how-title">
        <h2 id="how-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{L.howTitle}</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {L.howSteps.map((s, i) => (
            <li key={s.t}>
              <Card className="h-full p-6 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-ink-600">
                <span className="font-mono text-xs text-lime">0{i + 1}</span>
                <h3 className="mt-4 font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24 sm:px-6 sm:pb-32" aria-labelledby="features-title">
        <h2 id="features-title" className="sr-only">{t.nav.features}</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ key, icon: Icon }, i) => (
            <Card key={key} className={cn("p-6 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-ink-600", i === 0 && "lg:col-span-2")}>
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

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 pb-24 sm:px-6 sm:pb-32" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{L.faqTitle}</h2>
        <div className="mt-6 divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900">
          {L.faqs.map((f) => (
            <details key={f.q} className="group px-5 py-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-2 font-medium transition-colors hover:text-lime [&::-webkit-details-marker]:hidden">
                {f.q}
                <Plus className="size-4 shrink-0 text-lime transition-transform duration-200 ease-out group-open:rotate-45" aria-hidden />
              </summary>
              <p className="mb-3 mt-1 max-w-[65ch] text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-6 sm:pb-32">
        <Card className="relative overflow-hidden p-8 text-center sm:p-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(198_244_50/0.12),transparent_60%)]" aria-hidden />
          <h2 className="relative text-2xl font-semibold tracking-tight sm:text-4xl">{L.finalTitle}</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-pretty text-muted">{L.finalSubtitle}</p>
          <Link href="/register" className={buttonClass("primary", "lg", "relative mt-8")}>{L.ctaPrimary}</Link>
        </Card>
      </section>
    </>
  );
}
