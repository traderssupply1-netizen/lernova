-- No paid plans: every user gets the same monthly allowance, set by admins.
-- The plan tables stay (the allowance lives in the 'free' row) but paid plans
-- and subscriptions no longer affect anything.

create or replace function public.effective_plan(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select 'free'::text;
$$;
revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;

update public.subscription_plans
   set limits = '{"recording_minutes":300,"transcription_minutes":300,"ai_requests":50,"document_uploads":10,"exams_generated":10,"storage_mb":500}'::jsonb,
       name = 'Standard'
 where id = 'free';
update public.subscription_plans set is_active = false where id in ('plus', 'premium');

update public.app_settings set value = '"openai"' where key = 'ai_provider';

-- Audio retention: audio files are removed 30 days after the lesson; transcript and notes stay.
alter table public.recordings add column if not exists audio_deleted_at timestamptz;
insert into public.app_settings (key, value, description)
values ('audio_retention_days', '30', 'Days to keep recorded audio before it is deleted (transcripts and notes are kept)')
on conflict (key) do nothing;

-- Documents become lessons, so notes, flashcards, exams and the tutor work the same way for both.
alter table public.lessons add column if not exists document_id uuid references public.documents (id) on delete set null;
create index if not exists lessons_document_id_idx on public.lessons (document_id);
create index if not exists flashcard_sets_lesson_idx on public.flashcard_sets (user_id, lesson_id);
create index if not exists flashcards_set_idx on public.flashcards (set_id);
create index if not exists exams_user_idx on public.exams (user_id, created_at desc);
create index if not exists exam_questions_exam_idx on public.exam_questions (exam_id, position);
create index if not exists exam_attempts_exam_idx on public.exam_attempts (exam_id, started_at desc);
create index if not exists tutor_conv_lesson_idx on public.tutor_conversations (user_id, lesson_id);

-- Monthly allowance overview for the signed-in user: limit, used and remaining per metric.
create or replace function public.my_allowance()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object(
           'limit', (p.limits ->> k)::numeric,
           'used', public.usage_this_month(auth.uid(), k),
           'left', public.quota_remaining(auth.uid(), k))), '{}'::jsonb)
    from public.subscription_plans p,
         unnest(array['recording_minutes','transcription_minutes','ai_requests','document_uploads','exams_generated']) as k
   where p.id = 'free' and auth.uid() is not null;
$$;
revoke execute on function public.my_allowance() from public, anon;
grant execute on function public.my_allowance() to authenticated;

-- SM-2 review, applied atomically and only to the caller's own card.
create or replace function public.review_flashcard(p_card uuid, p_grade smallint)
returns public.flashcards language plpgsql security definer set search_path = public as $$
declare
  c public.flashcards;
  ef numeric;
  reps integer;
  ivl integer;
begin
  if p_grade < 0 or p_grade > 5 then raise exception 'INVALID_GRADE'; end if;
  select * into c from public.flashcards where id = p_card and user_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  ef := greatest(1.3, c.ease_factor + (0.1 - (5 - p_grade) * (0.08 + (5 - p_grade) * 0.02)));
  if p_grade < 3 then
    reps := 0; ivl := 0;
  else
    reps := c.repetitions + 1;
    ivl := case when reps = 1 then 1 when reps = 2 then 6 else greatest(1, round(c.interval_days * ef)::integer) end;
  end if;
  update public.flashcards set
    ease_factor = ef, repetitions = reps, interval_days = ivl,
    due_at = case when ivl = 0 then now() + interval '10 minutes' else now() + make_interval(days => ivl) end,
    correct_count = correct_count + (case when p_grade >= 3 then 1 else 0 end),
    incorrect_count = incorrect_count + (case when p_grade < 3 then 1 else 0 end)
  where id = p_card returning * into c;
  insert into public.flashcard_reviews (user_id, flashcard_id, grade) values (auth.uid(), p_card, p_grade);
  return c;
end $$;
revoke execute on function public.review_flashcard(uuid, smallint) from public, anon;
grant execute on function public.review_flashcard(uuid, smallint) to authenticated;

-- Paid-plan invitation types are no longer offered; existing codes keep working as standard access.
update public.invitation_codes set plan_id = 'free', benefit_days = null where plan_id <> 'free';
