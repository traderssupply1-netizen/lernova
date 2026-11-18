import "server-only";
import { integrationStatus } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type Plan = {
  id: "free" | "plus" | "premium";
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  currency: string;
  limits: Record<string, number>;
  features: string[];
};

/** Mirrors supabase/migrations/*_seed_config.sql; used only when the database is not configured. */
const DEFAULT_PLANS: Plan[] = [
  { id: "free", name: "Free", monthly_price_cents: 0, annual_price_cents: 0, currency: "eur",
    limits: { recording_minutes: 120, transcription_minutes: 120, ai_requests: 60, document_uploads: 5, exams_generated: 3 },
    features: ["basic_notes", "basic_flashcards", "limited_quizzes"] },
  { id: "plus", name: "Plus", monthly_price_cents: 999, annual_price_cents: 9590, currency: "eur",
    limits: { recording_minutes: 900, transcription_minutes: 900, ai_requests: 600, document_uploads: 40, exams_generated: 30 },
    features: ["advanced_notes", "flashcards", "tutor", "exams", "documents"] },
  { id: "premium", name: "Premium", monthly_price_cents: 1999, annual_price_cents: 19190, currency: "eur",
    limits: { recording_minutes: 2400, transcription_minutes: 2400, ai_requests: 2000, document_uploads: 150, exams_generated: 120 },
    features: ["advanced_notes", "flashcards", "advanced_tutor", "advanced_exams", "documents", "advanced_analytics", "study_plans", "exports", "priority"] },
];

export async function getPlans(): Promise<Plan[]> {
  if (!integrationStatus().supabase) return DEFAULT_PLANS;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("id, name, monthly_price_cents, annual_price_cents, currency, limits, features")
    .eq("is_active", true)
    .order("sort_order");
  if (error || !data?.length) return DEFAULT_PLANS;
  return data as Plan[];
}

export function formatPrice(cents: number, currency: string, locale: "hu" | "en") {
  return new Intl.NumberFormat(locale === "hu" ? "hu-HU" : "en-IE", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

export const FEATURE_LABELS: Record<string, { hu: string; en: string }> = {
  basic_notes: { hu: "Alap AI-jegyzetek", en: "Basic AI notes" },
  basic_flashcards: { hu: "Alap kártyák", en: "Basic flashcards" },
  limited_quizzes: { hu: "Korlátozott kvízek", en: "Limited quizzes" },
  advanced_notes: { hu: "Fejlett AI-jegyzetek", en: "Advanced AI notes" },
  flashcards: { hu: "Okos kártyák", en: "Smart flashcards" },
  tutor: { hu: "AI tutor keret", en: "AI tutor allowance" },
  advanced_tutor: { hu: "Fejlett AI tutor", en: "Advanced AI tutor" },
  exams: { hu: "Több vizsgagenerálás", en: "More exam generation" },
  advanced_exams: { hu: "Fejlett vizsgaeszközök", en: "Advanced exam tools" },
  documents: { hu: "Dokumentum-feldolgozás", en: "Document processing" },
  advanced_analytics: { hu: "Részletes statisztikák", en: "Advanced analytics" },
  study_plans: { hu: "Személyre szabott tanulási terv", en: "Personalised study plans" },
  exports: { hu: "PDF és Word export", en: "PDF and Word export" },
  priority: { hu: "Elsőbbségi feldolgozás", en: "Priority processing" },
};
