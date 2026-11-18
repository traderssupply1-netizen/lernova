import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { runJobs } from "../../src/lib/jobs/runner";

/**
 * Background worker (up to 15 minutes): transcription and note generation take
 * longer than the 60 s limit of normal functions. Triggered right after an
 * upload and every minute by jobs-cron. Protected by CRON_SECRET.
 */
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req: Request) => {
  if (!authorized(req)) {
    console.warn("jobs-worker: unauthorized call ignored");
    return;
  }
  const result = await runJobs({ budgetMs: 13 * 60_000 });
  console.log("jobs-worker finished", result);
};

export const config: Config = { background: true };
