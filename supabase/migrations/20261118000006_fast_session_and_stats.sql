-- One round trip for everything the app shell needs about the signed-in user.
create or replace function public.my_context()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', to_jsonb(p),
    'roles', coalesce((select jsonb_agg(role) from public.user_roles r where r.user_id = p.id), '[]'::jsonb),
    'plan', public.effective_plan(p.id)
  )
  from public.profiles p where p.id = auth.uid();
$$;
revoke execute on function public.my_context() from public, anon;
grant execute on function public.my_context() to authenticated;

-- Dashboard numbers computed in the database instead of shipping rows to the server.
create or replace function public.my_dashboard(p_since timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'lessons', (select count(*) from public.lessons where user_id = auth.uid()),
    'total_seconds', (select coalesce(sum(duration_seconds), 0) from public.study_sessions where user_id = auth.uid()),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('started_at', started_at, 'duration_seconds', duration_seconds))
                           from public.study_sessions where user_id = auth.uid() and started_at >= p_since), '[]'::jsonb),
    'recording_left', public.quota_remaining(auth.uid(), 'recording_minutes')
  );
$$;
revoke execute on function public.my_dashboard(timestamptz) from public, anon;
grant execute on function public.my_dashboard(timestamptz) to authenticated;
