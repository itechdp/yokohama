-- Login now uses public.users (users.sql), so nothing reads or writes the
-- old login tables (and their nightly pg_cron cleanup job) anymore:
--   app_users, auth_nonces, device_reset_log
--
-- Run users.sql FIRST - it copies the accounts out of app_users. Then run
-- this once in the Supabase SQL Editor. Safe to re-run.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'prune-auth-nonces') then
    perform cron.unschedule('prune-auth-nonces');
  end if;
end $$;

drop table if exists public.device_reset_log;
drop table if exists public.auth_nonces;
drop table if exists public.app_users;
