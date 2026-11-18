-- LERNOVA core schema
-- Every user-owned table carries user_id and is protected by Row Level Security.
-- Writes to billing, roles, quotas and invitations happen only through the service role
-- or SECURITY DEFINER functions with explicit checks.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('student', 'admin', 'super_admin');
create type public.invite_type as enum ('general', 'plus', 'premium', 'private');
create type public.invite_status as enum ('active', 'disabled', 'revoked');
create type public.redemption_status as enum ('reserved', 'redeemed', 'released');
create type public.account_status as enum ('active', 'suspended');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.recording_status as enum ('recording', 'uploading', 'uploaded', 'processing', 'ready', 'failed');
create type public.note_kind as enum ('quick', 'detailed', 'exam');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Settings, plans
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.subscription_plans (
  id text primary key check (id in ('free', 'plus', 'premium')),
  name text not null,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  annual_price_cents integer not null default 0 check (annual_price_cents >= 0),
  currency text not null default 'eur',
  stripe_monthly_price_id text,
  stripe_annual_price_id text,
  -- limits per calendar month; -1 = unlimited (never used for AI by default)
  limits jsonb not null,
  features jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_plans_touch before update on public.subscription_plans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null,
  avatar_url text,
  country text check (country is null or char_length(country) = 2),
  ui_language text not null default 'hu' check (ui_language in ('hu', 'en')),
  ai_language text not null default 'hu' check (ai_language in ('hu', 'en')),
  timezone text not null default 'Europe/Budapest',
  status public.account_status not null default 'active',
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  training_consent boolean not null default false,
  notification_prefs jsonb not null default '{"transcription":true,"notes":true,"exams":true,"reminders":true,"billing":true}'::jsonb,
  daily_goal_minutes integer not null default 30 check (daily_goal_minutes between 5 and 600),
  xp integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.has_role(p_user uuid, p_role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = p_user and role = p_role);
$$;

create or replace function public.is_admin_user(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user and role in ('admin', 'super_admin')
  );
$$;

-- Used by RLS policies: only ever answers for the calling user.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_user(auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.subscription_plans (id),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'unpaid', 'expired')),
  source text not null check (source in ('free', 'stripe', 'invitation', 'admin')),
  billing_interval text check (billing_interval in ('month', 'year')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.subscriptions (user_id, status);
create trigger trg_subs_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

create table public.payment_events (
  id text primary key,                -- Stripe event id (idempotency)
  type text not null,
  user_id uuid references auth.users (id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

-- Effective plan: highest active, non-expired subscription; falls back to free.
create or replace function public.effective_plan(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.plan_id from public.subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.user_id = p_user
      and s.status in ('active', 'trialing', 'past_due')
      and (s.current_period_end is null or s.current_period_end > now())
    order by p.sort_order desc
    limit 1
  ), 'free');
$$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create table public.invitation_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{6,40}$'),
  type public.invite_type not null default 'general',
  status public.invite_status not null default 'active',
  usage_limit integer not null default 1 check (usage_limit between 1 and 100000),
  usage_count integer not null default 0 check (usage_count >= 0),
  expires_at timestamptz,
  plan_id text not null default 'free' references public.subscription_plans (id),
  benefit_days integer check (benefit_days is null or benefit_days between 1 and 3650),
  restricted_email text,              -- private invites can be locked to one address
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_within_limit check (usage_count <= usage_limit)
);
create trigger trg_codes_touch before update on public.invitation_codes
  for each row execute function public.touch_updated_at();

create table public.invitation_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.invitation_codes (id) on delete cascade,
  email text not null,
  user_id uuid references auth.users (id) on delete set null,
  status public.redemption_status not null default 'reserved',
  reserved_until timestamptz not null,
  ip_hash text,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  released_at timestamptz
);
create index on public.invitation_redemptions (code_id, status);
create index on public.invitation_redemptions (lower(email), status);
-- An email can hold at most one live reservation at a time.
create unique index invitation_one_live_reservation
  on public.invitation_redemptions (lower(email)) where status = 'reserved';

create table public.invitation_audit_logs (
  id bigint generated always as identity primary key,
  code_id uuid references public.invitation_codes (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.invitation_audit_logs (code_id, created_at desc);

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.admin_audit_logs (created_at desc);

-- Brute-force / abuse protection buckets (fixed window).
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create or replace function public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return v_hits <= p_max;   -- true = allowed
end $$;

-- Reserve an invitation for an email. Locks the code row so concurrent
-- registrations cannot exceed the usage limit. Returns the reservation id,
-- or raises a coded exception the server maps to a user-facing message.
create or replace function public.reserve_invitation(p_code text, p_email text, p_ip_hash text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_code public.invitation_codes;
  v_live integer;
  v_id uuid;
  v_email text := lower(trim(p_email));
begin
  select * into v_code from public.invitation_codes
   where code = upper(trim(p_code))
   for update;

  if not found then raise exception 'INVITE_INVALID' using errcode = 'P0001'; end if;
  if v_code.status <> 'active' then raise exception 'INVITE_INACTIVE' using errcode = 'P0001'; end if;
  if v_code.expires_at is not null and v_code.expires_at <= now() then
    raise exception 'INVITE_EXPIRED' using errcode = 'P0001';
  end if;
  if v_code.restricted_email is not null and lower(v_code.restricted_email) <> v_email then
    raise exception 'INVITE_INVALID' using errcode = 'P0001';
  end if;

  -- Release this email's previous live reservation (retrying registration).
  update public.invitation_redemptions
     set status = 'released', released_at = now()
   where lower(email) = v_email and status = 'reserved';

  -- Expire stale reservations of this code.
  update public.invitation_redemptions
     set status = 'released', released_at = now()
   where code_id = v_code.id and status = 'reserved' and reserved_until <= now();

  select count(*) into v_live from public.invitation_redemptions
   where code_id = v_code.id and status = 'reserved';

  if v_code.usage_count + v_live >= v_code.usage_limit then
    raise exception 'INVITE_EXHAUSTED' using errcode = 'P0001';
  end if;

  insert into public.invitation_redemptions (code_id, email, status, reserved_until, ip_hash)
  values (v_code.id, v_email, 'reserved', now() + interval '20 minutes', p_ip_hash)
  returning id into v_id;

  insert into public.invitation_audit_logs (code_id, action, details)
  values (v_code.id, 'reserved', jsonb_build_object('redemption_id', v_id));

  return v_id;
end $$;

create or replace function public.release_invitation(p_reservation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.invitation_redemptions
     set status = 'released', released_at = now()
   where id = p_reservation and status = 'reserved';
  insert into public.invitation_audit_logs (code_id, action, details)
  select code_id, 'released', jsonb_build_object('redemption_id', p_reservation)
    from public.invitation_redemptions where id = p_reservation;
end $$;

-- Blocks account creation (email/password, OAuth or direct API calls) unless the
-- email holds a live invitation reservation. Runs in the same transaction as the
-- auth.users insert, so a failed signup never consumes a code.
create or replace function public.enforce_invitation_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_res public.invitation_redemptions;
  v_code public.invitation_codes;
  v_invite_only boolean;
begin
  select coalesce((value)::boolean, true) into v_invite_only
    from public.app_settings where key = 'invite_only';
  if v_invite_only is null then v_invite_only := true; end if;

  select * into v_res from public.invitation_redemptions
   where lower(email) = lower(new.email) and status = 'reserved' and reserved_until > now()
   order by created_at desc limit 1
   for update;

  if not found then
    if v_invite_only then
      raise exception 'INVITE_REQUIRED' using errcode = 'P0001';
    end if;
    return new;
  end if;

  select * into v_code from public.invitation_codes where id = v_res.code_id for update;
  if v_code.status <> 'active' or (v_code.expires_at is not null and v_code.expires_at <= now())
     or v_code.usage_count >= v_code.usage_limit then
    raise exception 'INVITE_INACTIVE' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_res public.invitation_redemptions;
  v_code public.invitation_codes;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_lang text := case when v_meta->>'ui_language' in ('hu', 'en') then v_meta->>'ui_language' else 'hu' end;
begin
  insert into public.profiles (id, email, full_name, ui_language, ai_language, terms_accepted_at, privacy_accepted_at)
  values (
    new.id, new.email,
    left(coalesce(v_meta->>'full_name', v_meta->>'name', ''), 120),
    v_lang, v_lang,
    case when (v_meta->>'terms_accepted')::boolean then now() end,
    case when (v_meta->>'privacy_accepted')::boolean then now() end
  );
  insert into public.user_roles (user_id, role) values (new.id, 'student');

  select * into v_res from public.invitation_redemptions
   where lower(email) = lower(new.email) and status = 'reserved' and reserved_until > now()
   order by created_at desc limit 1
   for update;

  if found then
    select * into v_code from public.invitation_codes where id = v_res.code_id for update;
    update public.invitation_codes set usage_count = usage_count + 1 where id = v_code.id;
    update public.invitation_redemptions
       set status = 'redeemed', redeemed_at = now(), user_id = new.id
     where id = v_res.id;
    insert into public.invitation_audit_logs (code_id, actor_id, action, details)
    values (v_code.id, new.id, 'redeemed', jsonb_build_object('redemption_id', v_res.id));

    if v_code.plan_id <> 'free' then
      insert into public.subscriptions (user_id, plan_id, status, source, current_period_start, current_period_end)
      values (new.id, v_code.plan_id, 'active', 'invitation', now(),
              case when v_code.benefit_days is not null then now() + make_interval(days => v_code.benefit_days) end);
    end if;
  end if;

  insert into public.subscriptions (user_id, plan_id, status, source)
  values (new.id, 'free', 'active', 'free');
  return new;
end $$;

create trigger on_auth_user_before_insert before insert on auth.users
  for each row execute function public.enforce_invitation_on_signup();
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bulk code generation for admins (called with an admin's JWT).
create or replace function public.admin_generate_invitations(
  p_count integer, p_type public.invite_type, p_usage_limit integer,
  p_expires_at timestamptz, p_plan_id text, p_benefit_days integer,
  p_prefix text default 'LRN', p_note text default null, p_restricted_email text default null
) returns setof public.invitation_codes
language plpgsql security definer set search_path = public as $$
declare
  i integer;
  v_code text;
  v_row public.invitation_codes;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_count < 1 or p_count > 500 then raise exception 'COUNT_OUT_OF_RANGE'; end if;
  if p_prefix !~ '^[A-Z0-9]{0,8}$' then raise exception 'BAD_PREFIX'; end if;
  for i in 1..p_count loop
    loop
      v_bytes := gen_random_bytes(10);
      v_code := '';
      for j in 0..9 loop
        v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, j) % 32) + 1, 1);
        if j = 4 then v_code := v_code || '-'; end if;
      end loop;
      if p_prefix <> '' then v_code := p_prefix || '-' || v_code; end if;
      exit when not exists (select 1 from public.invitation_codes where code = v_code);
    end loop;
    insert into public.invitation_codes (code, type, usage_limit, expires_at, plan_id, benefit_days, note, created_by, restricted_email)
    values (v_code, p_type,
            case when p_type = 'private' then least(p_usage_limit, 5) else p_usage_limit end,
            p_expires_at, p_plan_id, p_benefit_days, p_note, auth.uid(), nullif(lower(trim(p_restricted_email)), ''))
    returning * into v_row;
    insert into public.invitation_audit_logs (code_id, actor_id, action, details)
    values (v_row.id, auth.uid(), 'created', to_jsonb(v_row) - 'id');
    return next v_row;
  end loop;
end $$;

create or replace function public.admin_update_invitation(
  p_id uuid, p_status public.invite_status, p_usage_limit integer, p_expires_at timestamptz
) returns public.invitation_codes
language plpgsql security definer set search_path = public as $$
declare v_row public.invitation_codes; v_old public.invitation_codes;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_old from public.invitation_codes where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_old.status = 'revoked' and p_status <> 'revoked' then raise exception 'REVOKED_IS_FINAL'; end if;
  update public.invitation_codes
     set status = p_status,
         usage_limit = greatest(p_usage_limit, usage_count),
         expires_at = p_expires_at
   where id = p_id returning * into v_row;
  if p_status = 'revoked' then
    update public.invitation_redemptions set status = 'released', released_at = now()
     where code_id = p_id and status = 'reserved';
  end if;
  insert into public.invitation_audit_logs (code_id, actor_id, action, details)
  values (p_id, auth.uid(), 'updated', jsonb_build_object(
    'from', jsonb_build_object('status', v_old.status, 'usage_limit', v_old.usage_limit, 'expires_at', v_old.expires_at),
    'to', jsonb_build_object('status', v_row.status, 'usage_limit', v_row.usage_limit, 'expires_at', v_row.expires_at)));
  return v_row;
end $$;

-- Role changes: only super admins, never on themselves, always logged.
create or replace function public.admin_set_role(p_user uuid, p_role public.app_role, p_grant boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'CANNOT_CHANGE_OWN_ROLE'; end if;
  if p_role = 'student' then raise exception 'STUDENT_ROLE_IS_IMPLICIT'; end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid())
    on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), case when p_grant then 'role_granted' else 'role_revoked' end, 'user', p_user::text,
          jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_set_account_status(p_user uuid, p_status public.account_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'CANNOT_SUSPEND_SELF'; end if;
  if public.has_role(p_user, 'super_admin') and not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.profiles set status = p_status where id = p_user;
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'account_status', 'user', p_user::text, jsonb_build_object('status', p_status));
end $$;

-- ---------------------------------------------------------------------------
-- Learning content
-- ---------------------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#C6F432' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  lesson_date date not null default current_date,
  language text check (language in ('hu', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.lessons (user_id, created_at desc);
create trigger trg_lessons_touch before update on public.lessons
  for each row execute function public.touch_updated_at();

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  status public.recording_status not null default 'recording',
  mime_type text not null,
  duration_seconds numeric(10, 2) not null default 0,
  size_bytes bigint not null default 0,
  consent_confirmed_at timestamptz not null,
  transcription_language text check (transcription_language in ('hu', 'en', 'auto')),
  error text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);
create index on public.recordings (user_id, created_at desc);

-- One row per uploaded segment (each segment is an independently playable file).
create table public.recording_upload_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recording_id uuid not null references public.recordings (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0 and chunk_index < 1000),
  storage_path text not null,
  start_offset_seconds numeric(10, 2) not null default 0,
  duration_seconds numeric(10, 2) not null default 0,
  size_bytes bigint not null default 0,
  uploaded_at timestamptz not null default now(),
  unique (recording_id, chunk_index)
);

create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  recording_id uuid references public.recordings (id) on delete set null,
  language text,
  text text not null default '',
  segments jsonb not null default '[]'::jsonb,   -- [{start, end, text, low_confidence}]
  provider text,
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.transcripts (lesson_id);
create index transcripts_fts on public.transcripts using gin (to_tsvector('simple', text));
create trigger trg_transcripts_touch before update on public.transcripts
  for each row execute function public.touch_updated_at();

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete cascade,
  document_id uuid,
  kind public.note_kind not null,
  language text not null check (language in ('hu', 'en')),
  title text not null default '',
  content_md text not null default '',
  structured jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.notes (user_id, created_at desc);
create index on public.notes (lesson_id, kind);
create trigger trg_notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  storage_path text not null,
  extracted_text text,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
alter table public.notes add constraint notes_document_fk
  foreign key (document_id) references public.documents (id) on delete cascade;

create table public.flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  lesson_id uuid references public.lessons (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id uuid not null references public.flashcard_sets (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 2000),
  answer text not null check (char_length(answer) between 1 and 4000),
  topic text,
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  -- SM-2 state
  ease_factor numeric(4, 2) not null default 2.5,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  due_at timestamptz not null default now(),
  correct_count integer not null default 0,
  incorrect_count integer not null default 0,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_at timestamptz not null default now()
);
create index on public.flashcards (user_id, due_at);

create table public.flashcard_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  flashcard_id uuid not null references public.flashcards (id) on delete cascade,
  grade smallint not null check (grade between 0 and 5),
  reviewed_at timestamptz not null default now()
);
create index on public.flashcard_reviews (user_id, reviewed_at desc);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  lesson_id uuid references public.lessons (id) on delete set null,
  title text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  question_types text[] not null,
  language text not null check (language in ('hu', 'en')),
  scheduled_for date,                         -- real exam date for planner
  created_at timestamptz not null default now()
);

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  position integer not null,
  type text not null check (type in ('multiple_choice', 'true_false', 'short_answer', 'definition', 'fill_blank', 'written')),
  prompt text not null,
  options jsonb,
  correct_answer text,
  explanation text,
  topic text,
  unique (exam_id, position)
);

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(5, 2),
  weak_topics text[] not null default '{}',
  feedback text
);

create table public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  question_id uuid not null references public.exam_questions (id) on delete cascade,
  answer text,
  is_correct boolean,
  points numeric(5, 2),
  feedback text,
  unique (attempt_id, question_id)
);

create table public.tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete set null,
  subject_id uuid references public.subjects (id) on delete set null,
  mode text not null default 'simple' check (mode in ('simple', 'detailed', 'exam_prep', 'practice', 'oral')),
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.tutor_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  grounded boolean,
  created_at timestamptz not null default now()
);
create index on public.tutor_messages (conversation_id, created_at);

create table public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  title text not null,
  kind text not null default 'task' check (kind in ('task', 'homework', 'exam', 'deadline', 'session')),
  due_at timestamptz,
  completed_at timestamptz,
  ai_suggested boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.study_tasks (user_id, due_at);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  activity text not null check (activity in ('recording', 'notes', 'flashcards', 'exam', 'tutor', 'document', 'manual')),
  started_at timestamptz not null default now(),
  duration_seconds integer not null check (duration_seconds between 0 and 86400)
);
create index on public.study_sessions (user_id, started_at desc);

create table public.achievements (
  id text primary key,
  name_hu text not null,
  name_en text not null,
  description_hu text not null,
  description_en text not null,
  xp integer not null default 0
);

create table public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Usage, quotas, jobs
-- ---------------------------------------------------------------------------
create table public.usage_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  metric text not null check (metric in ('recording_minutes', 'transcription_minutes', 'ai_requests', 'document_uploads', 'exams_generated', 'storage_mb')),
  amount numeric(12, 3) not null check (amount >= 0),
  cost_usd numeric(12, 6) not null default 0,
  provider text,
  job_id uuid,
  created_at timestamptz not null default now()
);
create index on public.usage_records (user_id, metric, created_at);

create or replace function public.usage_this_month(p_user uuid, p_metric text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from public.usage_records
   where user_id = p_user and metric = p_metric and created_at >= date_trunc('month', now());
$$;

create or replace function public.quota_remaining(p_user uuid, p_metric text)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when (p.limits ->> p_metric) is null then 0
    when (p.limits ->> p_metric)::numeric < 0 then 1e9
    else greatest((p.limits ->> p_metric)::numeric - public.usage_this_month(p_user, p_metric), 0)
  end
  from public.subscription_plans p where p.id = public.effective_plan(p_user);
$$;

-- Atomically checks and records usage. Advisory lock per user+metric prevents
-- parallel requests from overshooting the quota.
create or replace function public.consume_quota(p_user uuid, p_metric text, p_amount numeric,
  p_provider text default null, p_job uuid default null, p_cost numeric default 0)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text || p_metric));
  if public.quota_remaining(p_user, p_metric) < p_amount then
    return false;
  end if;
  insert into public.usage_records (user_id, metric, amount, provider, job_id, cost_usd)
  values (p_user, p_metric, p_amount, p_provider, p_job, p_cost);
  return true;
end $$;

-- Refund for failed processing (policy: users are never charged for failures).
create or replace function public.refund_usage(p_job uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.usage_records where job_id = p_job;
$$;

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('transcribe_recording', 'generate_notes', 'generate_flashcards', 'generate_exam', 'grade_exam', 'process_document')),
  status public.job_status not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  error text,
  idempotency_key text unique,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index on public.processing_jobs (status, run_after);
create index on public.processing_jobs (user_id, created_at desc);

-- Claims jobs for a worker. SKIP LOCKED lets several workers run safely;
-- jobs stuck in "running" for 15 minutes are reclaimed.
create or replace function public.claim_jobs(p_limit integer default 3)
returns setof public.processing_jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.processing_jobs j
     set status = 'running', attempts = j.attempts + 1, locked_at = now(),
         started_at = coalesce(j.started_at, now())
   where j.id in (
     select id from public.processing_jobs
      where (status = 'queued' and run_after <= now())
         or (status = 'running' and locked_at < now() - interval '15 minutes')
      order by created_at
      limit p_limit
      for update skip locked)
  returning j.*;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'subjects', 'lessons', 'recordings', 'recording_upload_chunks', 'transcripts', 'notes',
    'documents', 'flashcard_sets', 'flashcards', 'flashcard_reviews', 'exams', 'exam_questions',
    'exam_attempts', 'exam_answers', 'tutor_conversations', 'tutor_messages', 'study_tasks',
    'study_sessions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Read-only to the owner; written by server/service role only.
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar_url, country, ui_language, ai_language, timezone, notification_prefs, daily_goal_minutes, training_consent)
  on public.profiles to authenticated;

alter table public.user_roles enable row level security;
create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());

alter table public.subscriptions enable row level security;
create policy "read own subscriptions" on public.subscriptions for select to authenticated using (user_id = auth.uid() or public.is_admin());

alter table public.usage_records enable row level security;
create policy "read own usage" on public.usage_records for select to authenticated using (user_id = auth.uid() or public.is_admin());

alter table public.processing_jobs enable row level security;
create policy "read own jobs" on public.processing_jobs for select to authenticated using (user_id = auth.uid() or public.is_admin());

alter table public.notifications enable row level security;
create policy "read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "mark own notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

alter table public.user_achievements enable row level security;
create policy "read own achievements" on public.user_achievements for select to authenticated using (user_id = auth.uid());

alter table public.achievements enable row level security;
create policy "achievements readable" on public.achievements for select to anon, authenticated using (true);

alter table public.subscription_plans enable row level security;
create policy "plans readable" on public.subscription_plans for select to anon, authenticated using (is_active or public.is_admin());
create policy "admins edit plans" on public.subscription_plans for update to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.app_settings enable row level security;
create policy "admins read settings" on public.app_settings for select to authenticated using (public.is_admin());
create policy "admins write settings" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.invitation_codes enable row level security;
create policy "admins read codes" on public.invitation_codes for select to authenticated using (public.is_admin());

alter table public.invitation_redemptions enable row level security;
create policy "admins read redemptions" on public.invitation_redemptions for select to authenticated using (public.is_admin());

alter table public.invitation_audit_logs enable row level security;
create policy "admins read invite audit" on public.invitation_audit_logs for select to authenticated using (public.is_admin());

alter table public.admin_audit_logs enable row level security;
create policy "admins read admin audit" on public.admin_audit_logs for select to authenticated using (public.is_admin());

alter table public.payment_events enable row level security;   -- service role only
alter table public.rate_limits enable row level security;      -- service role only

-- Functions that must never be callable from the browser.
revoke execute on function public.reserve_invitation(text, text, text) from public, anon, authenticated;
revoke execute on function public.release_invitation(uuid) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.consume_quota(uuid, text, numeric, text, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.refund_usage(uuid) from public, anon, authenticated;
revoke execute on function public.claim_jobs(integer) from public, anon, authenticated;
revoke execute on function public.enforce_invitation_on_signup() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- quota_remaining / usage_this_month take any user id: keep them server-side too.
revoke execute on function public.quota_remaining(uuid, text) from public, anon, authenticated;
revoke execute on function public.usage_this_month(uuid, text) from public, anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.is_admin_user(uuid) from public, anon, authenticated;
revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;

-- Safe self-service variants for the browser.
create or replace function public.my_plan() returns text
language sql stable security definer set search_path = public as $$ select public.effective_plan(auth.uid()); $$;
create or replace function public.my_quota(p_metric text) returns numeric
language sql stable security definer set search_path = public as $$ select public.quota_remaining(auth.uid(), p_metric); $$;
