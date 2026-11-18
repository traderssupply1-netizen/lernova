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
| Landing page, FAQ, legal pages | ✅ Done | No pricing: the app is free. Legal text is a **draft**: needs review by a lawyer |
| **Invite-only registration** | ✅ Done + tested | Transactional reservation, DB trigger blocks bypassing the API, race-safe, rate limited |
| Login, logout, email verification, password reset, sign out of all devices | ✅ Done | Requires Supabase email templates (see below) |
| Google OAuth | ⚙️ Partial | The `/auth/confirm` code flow is ready. A new OAuth user only gets through with a live invite reservation. There is no UI button yet |
| Admin: invite generation, editing, revoking, redemptions, CSV export | ✅ Done | All changes go to the audit log |
| Admin: users (search, suspend, admin role), monthly allowance, audio retention, AI provider switch, costs, errors | ✅ Done | Only a super admin can grant roles, and never to themselves |
| Dashboard (real data: streak, weekly chart, allowance, recent lessons/notes) | ✅ Done | |
| **Smart Recorder** | ✅ Done | Pause/resume, waveform, level meter, 5-min segments, IndexedDB recovery, retrying upload, Wake Lock, iOS tips, consent |
| Transcription (gpt-4o-mini-transcribe, HU/EN/auto, uncertainty flags) | ✅ Done* | Resumable per segment, background job. Timestamps are estimated per sentence (exact with `OPENAI_TRANSCRIBE_MODEL=whisper-1`) |
| AI notes (quick / detailed / exam, timestamp citations, AI explanation kept separate) | ✅ Done* | gpt-4.1-mini by default (Claude optional), structured output with zod validation |
| Lesson page: transcript search/edit/copy, jump to timestamp, playback, note editing, MD/Word/PDF export, delete | ✅ Done | Word = HTML-based .doc |
| One monthly allowance for everyone (admin-set), refund on failure, AI cost tracking | ✅ Done + tested | Default: 300 recording min, 50 AI requests, 10 exams, 10 documents |
| Audio retention (default 30 days) | ✅ Done | Daily job deletes old audio; transcript and notes stay |
| GDPR: data export (JSON), account deletion with files | ✅ Done | |
| Security headers (CSP, HSTS, Permissions-Policy) | ✅ Done | |
| Flashcards (AI-generated decks, SM-2 review, daily review) | ✅ Done* | SM-2 runs in the DB (`review_flashcard`), tested |
| Practice exams (multiple choice, true/false, short answer; AI grading of written answers; weak topics) | ✅ Done* | |
| AI tutor per lesson (4 modes, grounded in the lesson, says when something was not covered) | ✅ Done* | Last 12 messages as context |
| Document AI (PDF, Word, .txt → lesson with notes, flashcards, exams, tutor) | ✅ Done* | Scanned (image-only) PDFs are reported, not guessed (no OCR) |
| Study planner, analytics page, gamification (XP/levels) | 🗄️ Partial | Achievements and study_sessions are recorded |
| Paid subscriptions | ➖ Removed | By decision: invite-only, free, one shared monthly allowance. Plan tables remain; `effective_plan` always returns the standard allowance |
| Notifications UI | ⚙️ Partial | Written to the DB (transcript/notes ready), but there is no bell/list in the UI yet |
| E2E tests (Playwright) | ❌ Not yet | Requires a live Supabase project |

\* Needs an API key: without one, it fails with a clear `INTEGRATION_NOT_CONFIGURED` message and is never simulated.

**Status:** suitable for a small invite-only group (20–30 users). Not yet covered: E2E tests, study planner/analytics UI, notifications UI; the legal texts are drafts.

---

## Testing report

```
npm run typecheck   # clean
npm run lint        # clean
npm run build       # clean
npm test            # 35/35 passed
```

- **Database (17 tests, real PostgreSQL 16 with a Supabase shim):** valid code → profile/role/plan; direct signUp without a code is **blocked**; invalid/disabled/revoked/expired codes; usage limit; **failed account creation does not consume the code**; reservation expiry; **15 parallel registrations on a 3-use code → exactly 3**; legacy paid-plan codes give the standard allowance; SM-2 scheduling and card ownership; private code bound to an email; anon/authenticated cannot call internal functions; **data isolation** (cannot read or write another user's lesson); users cannot make themselves admin, change their plan or edit protected profile fields; admin/super admin permissions + audit log; quota + refund; rate limit; the job queue gives each job to exactly one worker.
- **Unit (18):** safe Markdown rendering (XSS-proof), timestamps, streak/time zones, exam answer checking, estimated transcript timestamps, document text extraction.
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
- `OPENAI_API_KEY` (required: text and speech). `ANTHROPIC_API_KEY` is optional.
- Defaults: `gpt-4.1-mini` for text and `gpt-4o-mini-transcribe` for speech. Override with `OPENAI_MODEL` / `OPENAI_TRANSCRIBE_MODEL`.
- Rough cost: 1 hour of lecture ≈ $0.18 transcription + ~$0.02 notes; a flashcard deck, exam or tutor answer ≈ $0.01.
- Switch the active provider in `/admin/system`.

### 4. Background worker
Long processing does not depend on a browser request: `processing_jobs` + `/api/jobs/run`.
- **Vercel Hobby:** `vercel.json` runs it once a day (safety net + audio clean-up). Per-minute cron needs the Pro plan.
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
