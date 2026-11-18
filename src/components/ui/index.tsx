import clsx from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";

export const cn = clsx;

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-lime text-lime-ink hover:bg-lime-strong font-semibold",
  secondary: "bg-ink-700 text-fg hover:bg-ink-600 border border-ink-600",
  ghost: "text-muted hover:text-fg hover:bg-ink-800",
  danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
};
const sizes = { sm: "h-9 px-3 text-sm rounded-lg", md: "h-11 px-4 text-sm rounded-xl", lg: "h-13 px-6 text-base rounded-2xl" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none select-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" }) {
  return <As className={cn("rounded-[var(--radius-card)] border border-ink-700 bg-ink-900 shadow-[var(--shadow-card)]", className)}>{children}</As>;
}

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-fg">
      <span>{children}</span>
      {hint && <span className="text-xs font-normal text-subtle">{hint}</span>}
    </label>
  );
}

const fieldBase =
  "w-full rounded-xl border border-ink-600 bg-ink-850 px-3.5 text-[16px] text-fg placeholder:text-subtle transition-colors focus:border-lime/60 focus:outline-none aria-[invalid=true]:border-danger/70";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-11", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "py-3 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, "h-11 appearance-none bg-[length:16px] pr-9", className)} {...rest}>
      {children}
    </select>
  );
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-danger">
      {children}
    </p>
  );
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "error" | "success" | "warn"; children: ReactNode; className?: string }) {
  const map = {
    info: ["border-ink-600 bg-ink-850 text-muted", Info],
    error: ["border-danger/30 bg-danger/10 text-danger", AlertTriangle],
    success: ["border-ok/30 bg-ok/10 text-ok", CheckCircle2],
    warn: ["border-warn/30 bg-warn/10 text-warn", AlertTriangle],
  } as const;
  const [cls, Icon] = map[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "lime" | "danger" | "warn" | "ok"; children: ReactNode; className?: string }) {
  const map = {
    neutral: "bg-ink-700 text-muted",
    lime: "bg-lime/12 text-lime",
    danger: "bg-danger/12 text-danger",
    warn: "bg-warn/12 text-warn",
    ok: "bg-ok/12 text-ok",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", map[tone], className)}>{children}</span>;
}

export function EmptyState({ icon, title, action }: { icon?: ReactNode; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-600 px-6 py-10 text-center">
      {icon && <div className="text-subtle">{icon}</div>}
      <p className="max-w-xs text-sm text-muted">{title}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-ink-800", className)} aria-hidden />;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  );
}
