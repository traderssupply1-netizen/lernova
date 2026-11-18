
/**
 * Server-side configuration. Missing integrations are reported, never faked:
 * features that need them return a clear "requires configuration" error.
 */
const read = (k: string) => {
  const v = process.env[k];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

export const env = {
  siteUrl: read("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000",
  supabaseUrl: read("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseSecretKey: read("SUPABASE_SECRET_KEY") ?? read("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicKey: read("ANTHROPIC_API_KEY"),
  anthropicModel: read("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5",
  openaiKey: read("OPENAI_API_KEY"),
  openaiModel: read("OPENAI_MODEL") ?? "gpt-4.1-mini",
  whisperModel: read("OPENAI_TRANSCRIBE_MODEL") ?? "gpt-4o-mini-transcribe",
  stripeSecretKey: read("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: read("STRIPE_WEBHOOK_SECRET"),
  cronSecret: read("CRON_SECRET"),
  ipHashSalt: read("IP_HASH_SALT") ?? "lernova-dev-salt",
};

export type Integration = "supabase" | "supabase_admin" | "anthropic" | "openai" | "whisper" | "stripe";

export function integrationStatus(): Record<Integration, boolean> {
  return {
    supabase: Boolean(env.supabaseUrl && env.supabasePublishableKey),
    supabase_admin: Boolean(env.supabaseUrl && env.supabaseSecretKey),
    anthropic: Boolean(env.anthropicKey),
    openai: Boolean(env.openaiKey),
    whisper: Boolean(env.openaiKey),
    stripe: Boolean(env.stripeSecretKey && env.stripeWebhookSecret),
  };
}

export class ConfigError extends Error {
  constructor(public integration: Integration) {
    super(`INTEGRATION_NOT_CONFIGURED:${integration}`);
  }
}
