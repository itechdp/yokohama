-- The Dispatch page has been removed from the app (Outward now takes tires
-- out of stock instead), so nothing reads or writes these tables anymore:
--   dispatch_plans            (dispatch_plans.sql)
--   dispatch_logs             (dispatch_logs.sql)
--   shipment_tracking_updates (shipment_tracking_updates.sql)
--
-- WARNING: this PERMANENTLY deletes every dispatch plan, dispatch log and
-- shipment tracking update. It cannot be undone. Export anything you want to
-- keep first (Table Editor -> each table -> Export to CSV).
--
-- Tires that were dispatched are NOT affected — they stay in public.tires at
-- the dispatch stage, and their movement history stays in tire_history.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Safe to re-run.

drop table if exists public.shipment_tracking_updates;
drop table if exists public.dispatch_logs;
drop table if exists public.dispatch_plans;

notify pgrst, 'reload schema';
