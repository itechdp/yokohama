-- Periodic cleanup for auth_nonces: each row is a single-use login challenge
-- nonce that expires after 60s (see api/_lib/jwt.ts), so anything older than
-- a day is permanently useless and would otherwise just grow forever since
-- nothing else deletes these rows. Run once in the Supabase SQL Editor.
--
-- Uses pg_cron, which Supabase supports directly. If the `create extension`
-- line below errors with a permissions issue, enable it instead via
-- Dashboard -> Database -> Extensions -> search "pg_cron" -> Enable, then
-- re-run just the do $$ ... $$ block below.

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-auth-nonces') then
    perform cron.unschedule('prune-auth-nonces');
  end if;
end $$;

-- Daily at 03:00 UTC.
select cron.schedule(
  'prune-auth-nonces',
  '0 3 * * *',
  $$ delete from public.auth_nonces where created_at < now() - interval '1 day' $$
);
