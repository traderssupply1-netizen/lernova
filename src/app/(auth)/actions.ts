"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { clientIp, dbErrorCode, hashIp, rateLimit } from "@/lib/security";
import { env, integrationStatus } from "@/lib/env";
import { getLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  email?: string;
  /** Echoed non-secret values so the form keeps them after a failed submit. */
  values?: Record<string, string>;
} | undefined;

const INVITE_ERRORS = ["INVITE_INVALID", "INVITE_INACTIVE", "INVITE_EXPIRED", "INVITE_EXHAUSTED", "INVITE_REQUIRED"] as const;

const passwordSchema = z
  .string()
  .min(10, "PASSWORD_WEAK")
  .max(128, "PASSWORD_WEAK")
  .regex(/[A-Za-zÀ-ž]/, "PASSWORD_WEAK")
  .regex(/\d/, "PASSWORD_WEAK");

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "VALIDATION").max(120, "VALIDATION"),
    email: z.email("VALIDATION").max(254).transform((v) => v.toLowerCase().trim()),
    password: passwordSchema,
    confirmPassword: z.string(),
    inviteCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{6,40}$/, "INVITE_INVALID"),
    terms: z.literal("on", { message: "TERMS_REQUIRED" }),
    privacy: z.literal("on", { message: "TERMS_REQUIRED" }),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "PASSWORD_MISMATCH" });

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const k = String(issue.path[0]);
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}

export async function registerAction(prev: FormState, formData: FormData): Promise<FormState> {
  const result = await register(formData);
  if (result?.success) return result;
  const keep = ["inviteCode", "fullName", "email"] as const;
  return { ...result, values: Object.fromEntries(keep.map((k) => [k, String(formData.get(k) ?? "").slice(0, 254)])) };
}

async function register(formData: FormData): Promise<FormState> {
  if (!integrationStatus().supabase_admin) return { error: "NOT_CONFIGURED" };
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const ip = await clientIp();
  const ipHash = hashIp(ip);
  // Brute-force protection on invitation codes: per IP and per email.
  const [ipOk, emailOk] = await Promise.all([
    rateLimit(`register:ip:${ipHash}`, 8, 600),
    rateLimit(`register:email:${d.email}`, 5, 3600),
  ]);
  if (!ipOk || !emailOk) return { error: "RATE_LIMITED" };

  const admin = createAdminClient();
  const { data: reservation, error: reserveError } = await admin.rpc("reserve_invitation", {
    p_code: d.inviteCode,
    p_email: d.email,
    p_ip_hash: ipHash,
  });
  if (reserveError || !reservation) {
    const code = dbErrorCode(reserveError?.message, INVITE_ERRORS);
    if (!code) console.error("reserve_invitation failed", reserveError?.message);
    return { fieldErrors: code ? { inviteCode: code } : undefined, error: code ? undefined : "UNKNOWN" };
  }

  const locale = await getLocale();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      emailRedirectTo: `${env.siteUrl}/auth/confirm?next=/dashboard`,
      data: { full_name: d.fullName, ui_language: locale, terms_accepted: true, privacy_accepted: true },
    },
  });

  // Account was not created: give the reservation back so the code is not consumed.
  const notCreated = Boolean(error) || !data.user || (data.user.identities?.length ?? 0) === 0;
  if (notCreated) {
    await admin.rpc("release_invitation", { p_reservation: reservation });
    if (error) {
      console.error("signUp failed", error.message);
      if (/password/i.test(error.message)) return { fieldErrors: { password: "PASSWORD_WEAK" } };
      if (error.status === 429) return { error: "RATE_LIMITED" };
      return { error: "UNKNOWN" };
    }
    // Existing email: same response as success, to avoid account enumeration.
  }
  return { success: "CHECK_EMAIL", email: d.email };
}

const loginSchema = z.object({
  email: z.email("VALIDATION").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "VALIDATION").max(128),
  next: z.string().optional(),
});

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  if (!integrationStatus().supabase) return { error: "NOT_CONFIGURED" };
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: { email: String(formData.get("email") ?? "") } };
  const ip = hashIp(await clientIp());
  if (integrationStatus().supabase_admin && !(await rateLimit(`login:${ip}`, 20, 600))) return { error: "RATE_LIMITED" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    const values = { email: parsed.data.email };
    if (/confirm/i.test(error.message)) return { error: "EMAIL_NOT_CONFIRMED", values };
    return { error: "INVALID_CREDENTIALS", values };
  }
  const { data: profile } = await supabase.from("profiles").select("status, ui_language").eq("id", data.user.id).single();
  if (profile?.status === "suspended") {
    await supabase.auth.signOut();
    return { error: "SUSPENDED" };
  }
  if (profile && isLocale(profile.ui_language)) {
    (await cookies()).set(LOCALE_COOKIE, profile.ui_language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  redirect(safeNext(parsed.data.next));
}

export async function forgotPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  if (!integrationStatus().supabase) return { error: "NOT_CONFIGURED" };
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { fieldErrors: { email: "VALIDATION" } };
  const ip = hashIp(await clientIp());
  if (integrationStatus().supabase_admin && !(await rateLimit(`forgot:${ip}`, 5, 900))) return { error: "RATE_LIMITED" };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${env.siteUrl}/auth/confirm?next=/reset-password` });
  return { success: "RESET_SENT" };
}

export async function resetPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { fieldErrors: { password: "PASSWORD_WEAK" } };
  if (formData.get("password") !== formData.get("confirmPassword")) return { fieldErrors: { confirmPassword: "PASSWORD_MISMATCH" } };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: "UNKNOWN" };
  return { success: "PASSWORD_UPDATED" };
}

export async function logoutAction(formData: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: formData.get("scope") === "global" ? "global" : "local" });
  redirect("/login");
}

export async function setLocaleAction(formData: FormData) {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  if (integrationStatus().supabase) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update({ ui_language: locale }).eq("id", user.id);
  }
}
