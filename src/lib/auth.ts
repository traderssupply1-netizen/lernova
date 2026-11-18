import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { integrationStatus } from "@/lib/env";

export type Role = "student" | "admin" | "super_admin";

export type SessionContext = {
  userId: string;
  email: string;
  profile: {
    id: string;
    full_name: string;
    email: string;
    ui_language: "hu" | "en";
    ai_language: "hu" | "en";
    timezone: string;
    country: string | null;
    status: "active" | "suspended";
    training_consent: boolean;
    daily_goal_minutes: number;
    created_at: string;
  };
  roles: Role[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  plan: "free" | "plus" | "premium";
};

/**
 * Server-side session. getClaims() verifies the JWT signature (locally when the
 * project uses asymmetric keys, otherwise via Supabase Auth); one RPC then loads
 * profile, roles and plan in a single round trip.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  if (!integrationStatus().supabase) return null;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;
  const { data } = await supabase.rpc("my_context");
  const ctx = data as { profile: SessionContext["profile"] | null; roles: Role[]; plan: SessionContext["plan"] } | null;
  if (!ctx?.profile) return null;
  const r = ctx.roles ?? [];
  return {
    userId: claims.sub,
    email: (claims.email as string | undefined) ?? ctx.profile.email,
    profile: ctx.profile,
    roles: r,
    isAdmin: r.includes("admin") || r.includes("super_admin"),
    isSuperAdmin: r.includes("super_admin"),
    plan: ctx.plan ?? "free",
  };
});

export async function requireUser(next = "/dashboard"): Promise<SessionContext> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (s.profile.status === "suspended") redirect("/login?error=SUSPENDED");
  return s;
}

export async function requireAdmin(): Promise<SessionContext> {
  const s = await requireUser("/admin");
  if (!s.isAdmin) redirect("/dashboard");
  return s;
}

/** For route handlers: returns null instead of redirecting. */
export async function apiUser(): Promise<SessionContext | null> {
  const s = await getSession();
  if (!s || s.profile.status === "suspended") return null;
  return s;
}
