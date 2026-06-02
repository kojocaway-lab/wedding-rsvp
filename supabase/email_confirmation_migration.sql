-- Run this on an existing Supabase database that already has wedding_rsvps.

alter table public.wedding_rsvps
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists confirmation_email_error text;
