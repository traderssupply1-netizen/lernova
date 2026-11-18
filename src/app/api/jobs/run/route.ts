import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runJobs } from "@/lib/jobs/runner";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!env.cronSecret || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(env.cronSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Worker endpoint: call every minute from Vercel Cron, Supabase pg_cron or any scheduler. */
async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const result = await runJobs();
  return NextResponse.json(result);
}

export const GET = handle; // Vercel Cron uses GET with the CRON_SECRET bearer token
export const POST = handle;
