import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection and quote every field.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Usage report: one row per code with redemption totals, plus one row per redemption. */
export async function GET() {
  const s = await apiUser();
  if (!s?.isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const supabase = await createClient();
  const { data: codes } = await supabase
    .from("invitation_codes")
    .select("id, code, type, status, plan_id, benefit_days, usage_count, usage_limit, expires_at, created_at, note")
    .order("created_at", { ascending: false })
    .limit(10000);
  const { data: reds } = await supabase
    .from("invitation_redemptions")
    .select("code_id, email, status, redeemed_at, created_at")
    .eq("status", "redeemed")
    .limit(50000);
  const byCode = new Map((codes ?? []).map((c) => [c.id, c.code]));
  const lines = [
    ["record", "code", "type", "status", "plan", "benefit_days", "used", "limit", "expires_at", "created_at", "note", "email", "redeemed_at"].map(esc).join(","),
    ...(codes ?? []).map((c) =>
      ["code", c.code, c.type, c.status, c.plan_id, c.benefit_days, c.usage_count, c.usage_limit, c.expires_at, c.created_at, c.note, "", ""].map(esc).join(","),
    ),
    ...(reds ?? []).map((r) =>
      ["redemption", byCode.get(r.code_id), "", r.status, "", "", "", "", "", r.created_at, "", r.email, r.redeemed_at].map(esc).join(","),
    ),
  ];
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lernova-invitations-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
