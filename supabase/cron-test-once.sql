-- One-off: run notify every 2 minutes to confirm cron + pg_net work.
-- 1. Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY
-- 2. Run this script
-- 3. Wait 2–4 minutes, then run the verify queries below
-- 4. When done: select cron.unschedule((select jobid from cron.job where jobname = 'caddie-notify-test'));

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname = 'caddie-notify-test';
  if j is not null then
    perform cron.unschedule(j);
  end if;
end $$;

select cron.schedule(
  'caddie-notify-test',
  '*/2 * * * *',
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

-- Verify the job exists
select jobid, jobname, schedule, active from cron.job where jobname = 'caddie-notify-test';

-- After 2+ minutes: did cron run?
select jobid, jobname, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'caddie-notify-test')
order by start_time desc
limit 5;

-- Did the HTTP call succeed? (status_code 200 = good)
select id, status_code, error_msg, created
from net._http_response
order by created desc
limit 5;
