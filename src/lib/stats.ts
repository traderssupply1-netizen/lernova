/** Pure helpers for learning statistics (unit tested). */

export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Consecutive days with any study activity, ending today (or yesterday, so a streak survives until midnight). */
export function computeStreak(sessionDates: Date[], timeZone: string, now = new Date()): number {
  const days = new Set(sessionDates.map((d) => dayKey(d, timeZone)));
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor, timeZone))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (days.has(dayKey(cursor, timeZone))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Minutes studied per day for the last `n` days (oldest first). */
export function lastNDays(sessions: { started_at: string; duration_seconds: number }[], timeZone: string, n = 7, now = new Date()) {
  const out: { key: string; minutes: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({ key: dayKey(d, timeZone), minutes: 0 });
  }
  const idx = new Map(out.map((o, i) => [o.key, i]));
  for (const s of sessions) {
    const i = idx.get(dayKey(new Date(s.started_at), timeZone));
    if (i !== undefined) out[i].minutes += s.duration_seconds / 60;
  }
  return out.map((o) => ({ ...o, minutes: Math.round(o.minutes) }));
}

/** ISO timestamp `days` ago. Kept outside components so render stays pure. */
export function daysAgoIso(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 864e5).toISOString();
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function monthStartIso(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
