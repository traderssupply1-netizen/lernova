-- Custom allowances: an invitation code can carry its own monthly limits, which the
-- new user receives; admins can also override any user's limits later.
-- NULL (or a missing metric) means "use the standard allowance".

alter table public.invitation_codes add column if not exists limits jsonb;
alter table public.profiles add column if not exists limits_override jsonb;

-- Keeps only known metrics with whole, non-negative values.
create or replace function public.clean_limits(p jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select nullif(coalesce(jsonb_object_agg(k, (v #>> '{}')::numeric::integer), '{}'::jsonb), '{}'::jsonb)
    from jsonb_each(coalesce(p, '{}'::jsonb)) as e(k, v)
   where k in ('recording_minutes', 'transcription_minutes', 'ai_requests', 'document_uploads', 'exams_generated')
     and jsonb_typeof(v) in ('number', 'string')
     and (v #>> '{}') ~ '^[0-9]{1,7}$';
$$;

alter table public.invitation_codes drop constraint if exists invitation_limits_clean;
alter table public.invitation_codes add constraint invitation_limits_clean check (limits is null or limits is not distinct from public.clean_limits(limits));
alter table public.profiles drop constraint if exists profile_limits_clean;
alter table public.profiles add constraint profile_limits_clean check (limits_override is null or limits_override is not distinct from public.clean_limits(limits_override));

-- The limit that applies to a user: personal override first, then the standard allowance.
create or replace function public.effective_limit(p_user uuid, p_metric text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (limits_override ->> p_metric)::numeric from public.profiles where id = p_user),
    (select (limits ->> p_metric)::numeric from public.subscription_plans where id = 'free'));
$$;
revoke execute on function public.effective_limit(uuid, text) from public, anon, authenticated;

create or replace function public.quota_remaining(p_user uuid, p_metric text)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when l is null then 0
    when l < 0 then 1e9
    else greatest(l - public.usage_this_month(p_user, p_metric), 0)
  end
  from (select public.effective_limit(p_user, p_metric) as l) x;
$$;
revoke execute on function public.quota_remaining(uuid, text) from public, anon, authenticated;

create or replace function public.my_allowance()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object(
           'limit', public.effective_limit(auth.uid(), k),
           'used', public.usage_this_month(auth.uid(), k),
           'left', public.quota_remaining(auth.uid(), k),
           'custom', (select limits_override ? k from public.profiles where id = auth.uid())
         )), '{}'::jsonb)
    from unnest(array['recording_minutes','transcription_minutes','ai_requests','document_uploads','exams_generated']) as k
   where auth.uid() is not null;
$$;
revoke execute on function public.my_allowance() from public, anon;
grant execute on function public.my_allowance() to authenticated;

-- When an invitation is redeemed, the new user gets the code's custom limits.
create or replace function public.apply_invitation_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limits jsonb;
begin
  if new.status = 'redeemed' and old.status is distinct from 'redeemed' and new.user_id is not null then
    select limits into v_limits from public.invitation_codes where id = new.code_id;
    if v_limits is not null then
      update public.profiles set limits_override = public.clean_limits(v_limits) where id = new.user_id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.apply_invitation_limits() from public, anon, authenticated;

drop trigger if exists trg_apply_invitation_limits on public.invitation_redemptions;
create trigger trg_apply_invitation_limits after update on public.invitation_redemptions
  for each row execute function public.apply_invitation_limits();
