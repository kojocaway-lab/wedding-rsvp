-- Run this on an existing Supabase database that already has wedding_rsvps.

alter table public.wedding_rsvps
  add column if not exists submission_id uuid,
  add column if not exists guest_name text,
  add column if not exists dietary text,
  add column if not exists guest_index integer;

update public.wedding_rsvps
set
  submission_id = coalesce(submission_id, gen_random_uuid()),
  guest_name = coalesce(guest_name, nullif(guests->0->>'name', '')),
  dietary = coalesce(dietary, nullif(guests->0->>'dietary', '')),
  guest_index = coalesce(guest_index, 1)
where guests is not null;
