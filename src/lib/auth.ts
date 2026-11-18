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

/** Verified server-side session (getUser re-validates the JWT with Supabase Auth). */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  if (!integrationStatus().supabase) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: roles }, { data: plan }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.rpc("my_plan"),
  ]);
  if (!profile) return null;
  const r = (roles ?? []).map((x) => x.role as Role);
  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile,
    roles: r,
    isAdmin: r.includes("admin") || r.includes("super_admin"),
    isSuperAdmin: r.includes("super_admin"),
    plan: (plan as SessionContext["plan"]) ?? "free",
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
