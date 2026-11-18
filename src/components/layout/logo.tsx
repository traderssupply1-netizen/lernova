import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-[0.18em] text-fg" aria-label="LERNOVA">
      <span className="grid size-7 place-items-center rounded-lg bg-lime text-lime-ink">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
          <path d="M5 4v16h14" />
          <path d="M10 14l3-6 3 6" />
        </svg>
      </span>
      <span className="text-sm">LERNOVA</span>
    </Link>
  );
}
