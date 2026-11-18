import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

export function hashIp(ip: string) {
  return createHash("sha256").update(env.ipHashSalt + ip).digest("hex").slice(0, 32);
}

/** Fixed-window rate limit stored in Postgres, so it works across serverless instances. */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) {
    console.error("rate limit check failed", error.message);
    return false; // fail closed for abuse-sensitive endpoints
  }
  return data === true;
}

/** Maps a Postgres exception raised by our functions (e.g. "INVITE_EXPIRED") to its code. */
export function dbErrorCode(message: string | undefined, allowed: readonly string[]): string | null {
  if (!message) return null;
  return allowed.find((c) => message.includes(c)) ?? null;
}
