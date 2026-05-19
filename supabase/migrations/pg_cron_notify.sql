-- Scheduled push notifications via Edge Function `notify`
-- Prerequisites:
-- 1. Enable `pg_cron` and `pg_net` extensions (Supabase Dashboard → Database → Extensions)
-- 2. Deploy the Edge Function: supabase functions deploy notify
-- 3. Set Edge Function secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
--    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
-- 4. Replace placeholders below with your project URL and service role key
--    (Settings → API → Project URL and service_role key)

select cron.unschedule('caddie-notify');

select cron.schedule(
  'caddie-notify-morning',
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
  'caddie-notify-afternoon',
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
  'caddie-notify-evening',
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
