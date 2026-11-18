"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { registerAction, type FormState } from "../actions";
import type { Dictionary } from "@/lib/i18n/hu";
import { fmt } from "@/lib/i18n/format";
import { Alert, Button, Card, FieldError, Input, Label } from "@/components/ui";

type T = Dictionary["auth"];

export function RegisterForm({ t, initialCode }: { t: T; initialCode: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, undefined);
  const err = (k: string) => {
    const code = state?.fieldErrors?.[k];
    return code ? (t.errors as Record<string, string>)[code] ?? t.errors.VALIDATION : undefined;
  };

  if (state?.success === "CHECK_EMAIL") {
    return (
      <Card className="p-8 text-center">
        <MailCheck className="mx-auto size-10 text-lime" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">{t.checkEmailTitle}</h1>
        <p className="mt-2 text-sm text-muted">{fmt(t.checkEmailBody, { email: state.email ?? "" })}</p>
      </Card>
    );
  }

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-invalid={Boolean(err(name))} aria-describedby={`${name}-err`} required {...props} />
      <FieldError id={`${name}-err`}>{err(name)}</FieldError>
    </div>
  );

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t.registerTitle}</h1>
      <p className="mt-1 text-sm text-muted">{t.registerSubtitle}</p>
      {state?.error && (
        <Alert tone="error" className="mt-5">
          {state.error === "NOT_CONFIGURED" ? "Supabase" : (t.errors as Record<string, string>)[state.error] ?? t.errors.UNKNOWN}
        </Alert>
      )}
      <form key={JSON.stringify(state?.values ?? {})} action={action} className="mt-6 space-y-4" noValidate>
        {field("inviteCode", t.inviteCode, {
          defaultValue: state?.values?.inviteCode ?? initialCode,
          placeholder: t.invitePlaceholder,
          autoCapitalize: "characters",
          autoComplete: "off",
          spellCheck: false,
          className: "font-mono uppercase tracking-wider",
        })}
        {field("fullName", t.fullName, { autoComplete: "name", maxLength: 120, defaultValue: state?.values?.fullName })}
        {field("email", t.email, { type: "email", autoComplete: "email", inputMode: "email", defaultValue: state?.values?.email })}
        {field("password", t.password, { type: "password", autoComplete: "new-password", minLength: 10 })}
        {field("confirmPassword", t.confirmPassword, { type: "password", autoComplete: "new-password" })}
        <div className="space-y-3 pt-1 text-sm">
          {(["terms", "privacy"] as const).map((k) => {
            const [before, after] = (k === "terms" ? t.acceptTerms : t.acceptPrivacy).split(/\{\w+\}/);
            return (
              <div key={k}>
                <label className="flex items-start gap-3 text-muted">
                  <input type="checkbox" name={k} required className="mt-0.5 size-4 accent-[var(--color-lime)]" aria-invalid={Boolean(err(k))} />
                  <span>
                    {before}
                    <Link href={`/${k}`} target="_blank" className="text-fg underline underline-offset-2">{k === "terms" ? t.termsLink : t.privacyLink}</Link>
                    {after}
                  </span>
                </label>
                <FieldError>{err(k)}</FieldError>
              </div>
            );
          })}
        </div>
        <Button type="submit" className="w-full" loading={pending}>{t.submitRegister}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t.haveAccount} <Link href="/login" className="text-lime hover:underline">{t.submitLogin}</Link>
      </p>
    </Card>
  );
}
