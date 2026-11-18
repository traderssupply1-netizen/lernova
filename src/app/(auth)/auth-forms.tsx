"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, loginAction, resetPasswordAction, type FormState } from "./actions";
import type { Dictionary } from "@/lib/i18n/hu";
import { Alert, Button, Card, FieldError, Input, Label } from "@/components/ui";

type T = Dictionary["auth"];
const msg = (t: T, code?: string) => (code ? (t.errors as Record<string, string>)[code] ?? t.errors.UNKNOWN : undefined);

export function LoginForm({ t, next, initialError }: { t: T; next?: string; initialError?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, undefined);
  const error = state?.error ?? initialError;
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t.loginTitle}</h1>
      <p className="mt-1 text-sm text-muted">{t.loginSubtitle}</p>
      {error && <Alert tone="error" className="mt-5">{msg(t, error)}</Alert>}
      <form key={state?.values?.email ?? ""} action={action} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div>
          <Label htmlFor="email">{t.email}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.values?.email} />
          <FieldError>{msg(t, state?.fieldErrors?.email)}</FieldError>
        </div>
        <div>
          <Label htmlFor="password" hint={<Link href="/forgot-password" className="text-lime hover:underline">{t.forgot}</Link>}>{t.password}</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" className="w-full" loading={pending}>{t.submitLogin}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t.noAccount} <Link href="/register" className="text-lime hover:underline">{t.submitRegister}</Link>
      </p>
    </Card>
  );
}

export function ForgotForm({ t }: { t: T }) {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, undefined);
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t.forgotTitle}</h1>
      <p className="mt-1 text-sm text-muted">{t.forgotSubtitle}</p>
      {state?.success && <Alert tone="success" className="mt-5">{t.resetSent}</Alert>}
      {state?.error && <Alert tone="error" className="mt-5">{msg(t, state.error)}</Alert>}
      <form action={action} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">{t.email}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
          <FieldError>{msg(t, state?.fieldErrors?.email)}</FieldError>
        </div>
        <Button type="submit" className="w-full" loading={pending}>{t.sendReset}</Button>
      </form>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-lime hover:underline">{t.submitLogin}</Link></p>
    </Card>
  );
}

export function ResetForm({ t }: { t: T }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, undefined);
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t.newPasswordTitle}</h1>
      {state?.success ? (
        <>
          <Alert tone="success" className="mt-5">{t.passwordUpdated}</Alert>
          <Link href="/dashboard" className="mt-4 inline-block text-lime hover:underline">→</Link>
        </>
      ) : (
        <form action={action} className="mt-6 space-y-4">
          {state?.error && <Alert tone="error">{msg(t, state.error)}</Alert>}
          <div>
            <Label htmlFor="password">{t.password}</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
            <FieldError>{msg(t, state?.fieldErrors?.password)}</FieldError>
          </div>
          <div>
            <Label htmlFor="confirmPassword">{t.confirmPassword}</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
            <FieldError>{msg(t, state?.fieldErrors?.confirmPassword)}</FieldError>
          </div>
          <Button type="submit" className="w-full" loading={pending}>{t.setPassword}</Button>
        </form>
      )}
    </Card>
  );
}
