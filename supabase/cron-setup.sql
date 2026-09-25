-- GYST: schedule the notify Edge Function (run once in SQL Editor)
--
-- BEFORE RUNNING:
-- 1. Dashboard → Database → Extensions → enable pg_cron and pg_net
-- 2. Deploy: supabase functions deploy notify
-- 3. Edge secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
-- 4. Find/replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY in this file

-- ── Extensions (skip if already enabled via Dashboard) ─────────────
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ── Remove old jobs (safe on first run) ──────────────────────────────
do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in (
      'gyst-notify',
      'gyst-notify-morning',
      'gyst-notify-afternoon',
      'gyst-notify-evening',
      'gyst-notify-test'
    )
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

-- ── Schedules (UTC): 08:00 morning, 13:00 afternoon, 18:00 evening ───
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY in all three blocks.

select cron.schedule(
  'gyst-notify-morning',
  '0 8 * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify',
      headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

select cron.schedule(
  'gyst-notify-afternoon',
  '0 13 * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify',
      headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

select cron.schedule(
  'gyst-notify-evening',
  '0 18 * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify',
      headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- ── Verify (should return 3 rows) ────────────────────────────────────
select jobid, jobname, schedule, active from cron.job where jobname like 'gyst-notify-%' and jobname != 'gyst-notify-test';
