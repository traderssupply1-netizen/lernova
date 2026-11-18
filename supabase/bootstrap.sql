-- Run ONCE in the Supabase SQL editor after the migrations, to create the first
-- super admin. Registration is invite-only, so the first account needs a code.

-- 1) Create a single-use code locked to your own email:
insert into public.invitation_codes (code, type, usage_limit, plan_id, restricted_email, note)
values ('LRN-OWNER-0001', 'private', 1, 'premium', 'you@example.com', 'Owner bootstrap');

-- 2) Register at /register with that email and code, confirm the email, then:
insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'you@example.com';

-- 3) Optional: run the job worker every minute from the database instead of Vercel Cron
--    (enable the pg_cron and pg_net extensions first):
-- select cron.schedule('lernova-worker', '* * * * *', $$
--   select net.http_post(
--     url := 'https://YOUR-DOMAIN/api/jobs/run',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
--   );
-- $$);
