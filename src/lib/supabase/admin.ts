import { createClient as createRawClient } from "@supabase/supabase-js";
import { ConfigError, env } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS: use only in server code after an explicit
 * authorization check. Has no Next.js dependency so background workers can use it.
 */
export function createAdminClient() {
  if (!env.supabaseUrl || !env.supabaseSecretKey) throw new ConfigError("supabase_admin");
  return createRawClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
