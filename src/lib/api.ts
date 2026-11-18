import "server-only";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { apiUser, type SessionContext } from "@/lib/auth";
import { ConfigError, env } from "@/lib/env";
import { runJobs } from "@/lib/jobs/runner";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
export const fail = (code: string, status = 400) => json({ error: code }, status);

/** Wraps a route handler with authentication, JSON parsing and uniform errors. */
export function route<P>(
  handler: (ctx: { user: SessionContext; req: Request; params: P }) => Promise<Response>,
) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    try {
      const user = await apiUser();
      if (!user) return fail("UNAUTHORIZED", 401);
      return await handler({ user, req, params: await params });
    } catch (e) {
      if (e instanceof z.ZodError) return fail("VALIDATION", 422);
      if (e instanceof ConfigError) return fail(e.message, 503);
      console.error("api error", e);
      return fail("INTERNAL", 500);
    }
  };
}

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const raw = await req.json().catch(() => ({}));
  return schema.parse(raw);
}

/**
 * Starts the worker right after the response is sent; the scheduled job is the safety net.
 * On Netlify (WORKER_MODE=netlify) the work runs in a 15-minute background function,
 * elsewhere (e.g. Vercel) inside after() with the route's maxDuration.
 */
export function kickWorker() {
  after(async () => {
    try {
      if (process.env.WORKER_MODE === "netlify" && env.cronSecret) {
        const base = process.env.URL ?? env.siteUrl;
        await fetch(`${base}/.netlify/functions/jobs-worker`, { method: "POST", headers: { authorization: `Bearer ${env.cronSecret}` } });
        return;
      }
      await runJobs({ budgetMs: 240_000 });
    } catch (e) {
      console.error("background worker failed", e);
    }
  });
}
