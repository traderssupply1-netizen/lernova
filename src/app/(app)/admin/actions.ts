"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type GenerateState = { error?: string; codes?: string[] } | undefined;

const generateSchema = z.object({
  count: z.coerce.number().int().min(1).max(500),
  type: z.enum(["general", "private"]),
  usageLimit: z.coerce.number().int().min(1).max(100000),
  expiresAt: z.string().optional().transform((v) => (v ? new Date(v + "T23:59:59Z").toISOString() : null)),
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{0,8}$/).default("LRN"),
  note: z.string().max(500).optional(),
  restrictedEmail: z.string().trim().max(254).optional(),
});

export async function generateInvitationsAction(_: GenerateState, formData: FormData): Promise<GenerateState> {
  await requireAdmin();
  const parsed = generateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.path.join(".")).join(", ") };
  const d = parsed.data;
  if (d.restrictedEmail && !z.email().safeParse(d.restrictedEmail).success) return { error: "restrictedEmail" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_generate_invitations", {
    p_count: d.count,
    p_type: d.type,
    p_usage_limit: d.type === "private" ? Math.min(d.usageLimit, 5) : d.usageLimit,
    p_expires_at: d.expiresAt,
    p_plan_id: "free",
    p_benefit_days: null,
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

/** Updates the single monthly allowance every user gets, and the audio retention period. */
export async function updateAllowanceAction(formData: FormData) {
  const s = await requireAdmin();
  const metrics = ["recording_minutes", "transcription_minutes", "ai_requests", "document_uploads", "exams_generated"];
  const n = (v: FormDataEntryValue | null) => z.coerce.number().int().min(0).max(1_000_000).parse(v);
  const supabase = await createClient();
  const { data: current } = await supabase.from("subscription_plans").select("limits").eq("id", "free").single();
  const limits = { ...(current?.limits as Record<string, number>), ...Object.fromEntries(metrics.map((m) => [m, n(formData.get(m))])) };
  const retention = z.coerce.number().int().min(1).max(3650).parse(formData.get("audio_retention_days"));
  const { error } = await supabase.from("subscription_plans").update({ limits }).eq("id", "free");
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase.from("app_settings").upsert({ key: "audio_retention_days", value: retention, updated_by: s.userId });
  if (e2) throw new Error(e2.message);
  await audit(s.userId, "allowance_updated", "setting", "allowance", { limits, retention });
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
