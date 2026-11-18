"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type GenerateState = { error?: string; codes?: string[] } | undefined;

const generateSchema = z.object({
  count: z.coerce.number().int().min(1).max(500),
  type: z.enum(["general", "plus", "premium", "private"]),
  usageLimit: z.coerce.number().int().min(1).max(100000),
  expiresAt: z.string().optional().transform((v) => (v ? new Date(v + "T23:59:59Z").toISOString() : null)),
  benefitDays: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1).max(3650).nullable()),
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{0,8}$/).default("LRN"),
  note: z.string().max(500).optional(),
  restrictedEmail: z.string().trim().max(254).optional(),
});

const PLAN_FOR_TYPE = { general: "free", plus: "plus", premium: "premium", private: "free" } as const;

export async function generateInvitationsAction(_: GenerateState, formData: FormData): Promise<GenerateState> {
  await requireAdmin();
  const parsed = generateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.path.join(".")).join(", ") };
  const d = parsed.data;
  const privatePlan = z.enum(["free", "plus", "premium"]).catch("free").parse(formData.get("privatePlan"));
  const plan = d.type === "private" ? privatePlan : PLAN_FOR_TYPE[d.type];
  if (d.restrictedEmail && !z.email().safeParse(d.restrictedEmail).success) return { error: "restrictedEmail" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_generate_invitations", {
    p_count: d.count,
    p_type: d.type,
    p_usage_limit: d.type === "private" ? Math.min(d.usageLimit, 5) : d.usageLimit,
    p_expires_at: d.expiresAt,
    p_plan_id: plan,
    p_benefit_days: plan === "free" ? null : d.benefitDays,
    p_prefix: d.prefix,
    p_note: d.note || null,
    p_restricted_email: d.restrictedEmail || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/invitations");
  return { codes: (data as { code: string }[]).map((r) => r.code) };
}

export async function updateInvitationAction(formData: FormData) {
  await requireAdmin();
  const d = z
    .object({
      id: z.uuid(),
      status: z.enum(["active", "disabled", "revoked"]),
      usageLimit: z.coerce.number().int().min(1).max(100000),
      expiresAt: z.string().optional(),
    })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_invitation", {
    p_id: d.id,
    p_status: d.status,
    p_usage_limit: d.usageLimit,
    p_expires_at: d.expiresAt ? d.expiresAt : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/invitations");
}

export async function setAccountStatusAction(formData: FormData) {
  await requireAdmin();
  const d = z.object({ userId: z.uuid(), status: z.enum(["active", "suspended"]) }).parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_account_status", { p_user: d.userId, p_status: d.status });
  if (error) throw new Error(error.message);
  if (d.status === "suspended") {
    // End their sessions immediately.
    await createAdminClient().auth.admin.signOut(d.userId).catch(() => undefined);
  }
  revalidatePath("/admin/users");
}

export async function setRoleAction(formData: FormData) {
  const s = await requireAdmin();
  if (!s.isSuperAdmin) throw new Error("FORBIDDEN");
  const d = z.object({ userId: z.uuid(), grant: z.enum(["true", "false"]) }).parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role", { p_user: d.userId, p_role: "admin", p_grant: d.grant === "true" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

async function audit(actor: string, action: string, targetType: string, targetId: string, details: unknown) {
  await createAdminClient().from("admin_audit_logs").insert({ actor_id: actor, action, target_type: targetType, target_id: targetId, details });
}

export async function updatePlanLimitsAction(formData: FormData) {
  const s = await requireAdmin();
  const id = z.enum(["free", "plus", "premium"]).parse(formData.get("id"));
  const metrics = ["recording_minutes", "transcription_minutes", "ai_requests", "document_uploads", "exams_generated", "storage_mb"];
  const limits = Object.fromEntries(metrics.map((m) => [m, z.coerce.number().int().min(0).max(1_000_000).parse(formData.get(m))]));
  const monthly = z.coerce.number().int().min(0).max(1_000_000).parse(formData.get("monthly_price_cents"));
  const annual = z.coerce.number().int().min(0).max(10_000_000).parse(formData.get("annual_price_cents"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("subscription_plans")
    .update({ limits, monthly_price_cents: monthly, annual_price_cents: annual })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await audit(s.userId, "plan_updated", "plan", id, { limits, monthly, annual });
  revalidatePath("/admin/system");
}

export async function setAiProviderAction(formData: FormData) {
  const s = await requireAdmin();
  const provider = z.enum(["anthropic", "openai"]).parse(formData.get("provider"));
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert({ key: "ai_provider", value: provider, updated_by: s.userId });
  if (error) throw new Error(error.message);
  await audit(s.userId, "ai_provider_changed", "setting", "ai_provider", { provider });
  revalidatePath("/admin/system");
}
