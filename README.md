# LERNOVA

An AI study platform for students, available by invitation only.
The main flow: **record → transcribe → understand → generate notes** (practice and learning tools come in later phases).

Stack: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS) · Anthropic Claude / OpenAI (switchable) · OpenAI Whisper.

---

## Feature status (honest report)

| Area | Status | Notes |
|---|---|---|
| Design system (dark/lime, responsive, iPhone safe areas) | ✅ Done | `src/components/ui` |
| HU/EN interface, persistent language | ✅ Done | Separate settings for interface and AI-material language |
| Landing page, pricing (from the DB), FAQ, legal pages | ✅ Done | Legal text is a **draft**: needs review by a lawyer |
| **Invite-only registration** | ✅ Done + tested | Transactional reservation, DB trigger blocks bypassing the API, race-safe, rate limited |
| Login, logout, email verification, password reset, sign out of all devices | ✅ Done | Requires Supabase email templates (see below) |
| Google OAuth | ⚙️ Partial | The `/auth/confirm` code flow is ready. A new OAuth user only gets through with a live invite reservation. There is no UI button yet |
| Admin: invite generation, editing, revoking, redemptions, CSV export | ✅ Done | All changes go to the audit log |
| Admin: users (search, suspend, admin role), plan limits, AI provider switch, errors | ✅ Done | Only a super admin can grant roles, and never to themselves |
| Dashboard (real data: streak, weekly chart, allowance, recent lessons/notes) | ✅ Done | |
| **Smart Recorder** | ✅ Done | Pause/resume, waveform, level meter, 5-min segments, IndexedDB recovery, retrying upload, Wake Lock, iOS tips, consent |
| Whisper transcription (HU/EN/auto, timestamps, uncertainty flags) | ✅ Done* | Resumable per segment, retry limit, background job |
| AI notes (quick / detailed / exam, timestamp citations, AI explanation kept separate) | ✅ Done* | Claude or OpenAI, structured output with zod validation |
| Lesson page: transcript search/edit/copy, jump to timestamp, playback, note editing, MD/Word/PDF export, delete | ✅ Done | Word = HTML-based .doc |
| Usage quotas, refund on failure, AI cost tracking | ✅ Done + tested | |
| GDPR: data export (JSON), account deletion with files | ✅ Done | |
| Security headers (CSP, HSTS, Permissions-Policy) | ✅ Done | |
| Flashcards (SM-2), Exam Generator, AI Tutor, Document AI | 🗄️ Schema only | Tables and RLS exist, no UI/logic yet. The landing page labels them "In development" |
| Study planner, analytics page, gamification (XP/levels) | 🗄️ Partial | Achievements and study_sessions are recorded |
| Stripe subscriptions, webhooks | ❌ Not yet | Plans and `effective_plan` are ready, invite-based plans work |
| Notifications UI | ⚙️ Partial | Written to the DB (transcript/notes ready), but there is no bell/list in the UI yet |
| E2E tests (Playwright) | ❌ Not yet | Requires a live Supabase project |

\* Needs an API key: without one, it fails with a clear `INTEGRATION_NOT_CONFIGURED` message and is never simulated.

**This is not production-ready**: Stripe, the remaining learning modules and E2E tests are missing, and the legal texts are drafts.

---

## Testing report

```
npm run typecheck   # clean
npm run lint        # clean
npm run build       # clean
npm test            # 26/26 passed
```

- **Database (16 tests, real PostgreSQL 16 with a Supabase shim):** valid code → profile/role/plan; direct signUp without a code is **blocked**; invalid/disabled/revoked/expired codes; usage limit; **failed account creation does not consume the code**; reservation expiry; **15 parallel registrations on a 3-use code → exactly 3**; premium expiry; private code bound to an email; anon/authenticated cannot call internal functions; **data isolation** (cannot read or write another user's lesson); users cannot make themselves admin, change their plan or edit protected profile fields; admin/super admin permissions + audit log; quota + refund; rate limit; the job queue gives each job to exactly one worker.
- **Unit (10):** safe Markdown rendering (XSS-proof), timestamps, streak/time zones.
- **Manual:** pages render in HU and EN; layout checked at iPhone (390 px) and desktop (1440 px) sizes.
- **Not yet tested:** recording on a real iPhone, a real Whisper/Claude call, the email flow. These need a live project and keys.

Run the DB tests locally: `TEST_DATABASE_URL=postgres://user:pass@localhost/lernova_test npm run test:db`

---

## Installation

```bash
npm install
cp .env.example .env.local   # fill it in
npm run dev
```

### 1. Supabase
1. Create a **separate** project for LERNOVA. Don't put it in another app's project: the signup trigger would block registrations there too.
2. Apply the migrations in order (`supabase/migrations/*.sql`) with `supabase db push` or the SQL editor.
3. Auth → URL Configuration: Site URL = your domain; Redirect URLs: `https://YOUR-DOMAIN/auth/confirm`.
4. Auth → Email Templates: in the "Confirm signup" and "Reset password" templates the link should be
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next={{ .RedirectTo }}`
5. Set password policy to at least 10 characters. Set up your own SMTP for production (the built-in sender is rate limited).
6. Copy the publishable and secret keys into `.env.local`.

### 2. First admin
Run `supabase/bootstrap.sql` (enter your own email).

### 3. AI and transcription
- `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`. Whisper uses the OpenAI key.
- Switch the active provider in `/admin/system`.

### 4. Background worker
Long processing does not depend on a browser request: `processing_jobs` + `/api/jobs/run`.
- **Vercel:** `vercel.json` runs it every minute. Per-minute cron needs the Pro plan.
- **Or Supabase pg_cron:** see the end of `bootstrap.sql`.
- After uploading, the server also starts it right away with `after()`. The cron is the safety net.

### 5. Deployment (Vercel)
Set the env variables, then `vercel deploy`. `maxDuration` is 300 s for the worker.

---

## Architecture

- `src/proxy.ts`: session refresh, protected routes (Next 16: `proxy` replaces `middleware`)
- `src/lib/auth.ts`: server-side `requireUser` / `requireAdmin`
- `src/lib/ai/provider.ts`: Claude/OpenAI adapter with structured output
- `src/lib/stt/whisper.ts`: Whisper, uncertain segments flagged
- `src/lib/jobs/*`: job queue (SKIP LOCKED, backoff, refund on failure, resumable)
- `src/lib/recorder/*`: IndexedDB recovery, signed URLs uploaded straight to private storage
- `supabase/migrations`: full schema, RLS, invite and quota functions

## Known limitations
- iOS Safari cannot record with a locked screen or in the background. The app keeps the screen on (Wake Lock) and warns about this.
- Whisper limit is 25 MB per segment. The recorder makes 5-minute segments at 48 kbps (≈1.8 MB).
- Segments are separate files, so the timestamp on a segment boundary may be off by a few hundred ms.
- `cacheComponents` is turned off (the app is dynamic per user).
