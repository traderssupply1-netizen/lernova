"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE } from "@/lib/i18n";

export type ProfileState = { ok?: boolean; error?: string } | undefined;

const schema = z.object({
  full_name: z.string().trim().min(1).max(120),
  country: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/).transform((v) => v || null),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }),
  ui_language: z.enum(["hu", "en"]),
  ai_language: z.enum(["hu", "en"]),
  daily_goal_minutes: z.coerce.number().int().min(5).max(600),
  training_consent: z.string().optional().transform((v) => v === "on"),
});

export async function saveProfileAction(_: ProfileState, formData: FormData): Promise<ProfileState> {
  const s = await requireUser("/settings");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.path.join(".") };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", s.userId);
  if (error) return { error: "SAVE_FAILED" };
  (await cookies()).set(LOCALE_COOKIE, parsed.data.ui_language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true };
}
