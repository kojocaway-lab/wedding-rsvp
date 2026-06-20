-- Wedding RSVP Supabase schema.
-- Run this in Supabase SQL Editor before importing your guest CSV.

create extension if not exists pgcrypto;

create table if not exists public.wedding_invites (
  id uuid primary key default gen_random_uuid(),
  passkey text not null unique,
  guest_label text not null,
  guest_email text,
  max_guests integer not null default 1 check (max_guests between 1 and 20),
  notes text,
  is_active boolean not null default true,
  access_count integer not null default 0,
  first_accessed_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.wedding_invite_events (
  id bigint generated always as identity primary key,
  invite_id uuid references public.wedding_invites(id) on delete cascade,
  passkey text not null,
  event_type text not null check (event_type in ('access_granted','access_denied','rsvp_submitted')),
  user_agent text,
  page_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.wedding_rsvps (
  id bigint generated always as identity primary key,
  invite_id uuid references public.wedding_invites(id) on delete set null,
  passkey text not null,
  status text not null check (status in ('attending','declined')),
  email text,
  attendance_type text check (attendance_type is null or attendance_type in ('Wedding banquet only','Wedding banquet + ROM','ROM only')),
  guests jsonb not null default '[]'::jsonb,
  message text,
  confirmation_email_sent_at timestamptz,
  confirmation_email_error text,
  user_agent text,
  page_path text,
  submitted_at timestamptz not null default now()
);

alter table public.wedding_rsvps
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists confirmation_email_error text,
  add column if not exists attendance_type text;

alter table public.wedding_rsvps
  drop constraint if exists wedding_rsvps_attendance_type_check;

alter table public.wedding_rsvps
  add constraint wedding_rsvps_attendance_type_check
  check (
    attendance_type is null
    or attendance_type in ('Wedding banquet only','Wedding banquet + ROM','ROM only')
  );

alter table public.wedding_invites enable row level security;
alter table public.wedding_invite_events enable row level security;
alter table public.wedding_rsvps enable row level security;

-- No public browser policies are added intentionally.
-- Edge Functions use the service role key to read/write these tables privately.
