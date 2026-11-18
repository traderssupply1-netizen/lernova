import type { Config } from "@netlify/functions";

/** Every minute: wake the background worker (safety net if an upload-time trigger was missed). */
export default async () => {
  const site = process.env.URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.CRON_SECRET;
  if (!site || !secret) return;
  await fetch(`${site}/.netlify/functions/jobs-worker`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
};

export const config: Config = { schedule: "* * * * *" };
