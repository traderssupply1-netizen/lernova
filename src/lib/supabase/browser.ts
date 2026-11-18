"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client with the publishable key only (RLS-protected). */
export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("INTEGRATION_NOT_CONFIGURED:supabase");
  return createBrowserClient(url, key);
}
