-- Per-segment transcription results, so a retried or resumed job never re-bills
-- segments that already succeeded.
alter table public.recording_upload_chunks add column transcript jsonb;
alter table public.recording_upload_chunks add column transcribed_at timestamptz;

-- Re-queue a long-running job without counting it as a failed attempt.
create or replace function public.requeue_job(p_job uuid)
returns void language sql security definer set search_path = public as $$
  update public.processing_jobs
     set status = 'queued', attempts = greatest(attempts - 1, 0), locked_at = null, run_after = now()
   where id = p_job;
$$;
revoke execute on function public.requeue_job(uuid) from public, anon, authenticated;
