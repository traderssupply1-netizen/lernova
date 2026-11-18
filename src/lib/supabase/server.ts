import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { ConfigError, env } from "@/lib/env";

/** Supabase client acting as the signed-in user (RLS applies). */
export async function createClient() {
  if (!env.supabaseUrl || !env.supabasePublishableKey) throw new ConfigError("supabase");
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS: use only in server code after an explicit
 * authorization check. Never import from client components.
 */
export function createAdminClient() {
  if (!env.supabaseUrl || !env.supabaseSecretKey) throw new ConfigError("supabase_admin");
  return createRawClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
