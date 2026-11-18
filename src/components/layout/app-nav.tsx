"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Home, Layers, Mic, Settings, Shield } from "lucide-react";
import { cn } from "@/components/ui";

const icons = { home: Home, mic: Mic, book: BookOpen, cards: Layers, settings: Settings, shield: Shield };
export type NavItem = { href: string; label: string; icon: keyof typeof icons };

export function AppNav({ items, variant }: { items: NavItem[]; variant: "side" | "bottom" }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/");

  if (variant === "side") {
    return (
      <nav className="mt-4 flex flex-col gap-1" aria-label="App">
        {items.map(({ href, label, icon }) => {
          const Icon = icons[icon];
          return (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active(href) ? "bg-ink-800 text-fg" : "text-muted hover:bg-ink-850 hover:text-fg",
              )}
            >
              <Icon className={cn("size-4", active(href) && "text-lime")} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-800 bg-ink-950/90 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:hidden"
    >
      {/* Admin is reached from Settings on phones, to keep five tabs. */}
      {items.filter((i) => i.icon !== "shield").map(({ href, label, icon }) => {
        const Icon = icons[icon];
        const isRecord = icon === "mic";
        return (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cn("flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px]", active(href) ? "text-fg" : "text-subtle")}
          >
            <span className={cn("grid place-items-center rounded-full", isRecord ? "size-9 bg-lime text-lime-ink" : "size-6")}>
              <Icon className={cn(isRecord ? "size-4.5" : "size-5", !isRecord && active(href) && "text-lime")} aria-hidden />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
