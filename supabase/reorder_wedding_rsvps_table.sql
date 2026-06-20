-- Rebuilds public.wedding_rsvps with the requested physical column order.
-- PostgreSQL cannot reorder existing columns with ALTER TABLE, so this
-- migration copies data into a replacement table and swaps it into place.

begin;

drop view if exists public.wedding_rsvps_ordered;

create table public.wedding_rsvps_reordered (
  id bigint generated always as identity primary key,
  invite_id uuid references public.wedding_invites(id) on delete set null,
  passkey text not null,
  guest_name text,
  status text not null check (status in ('attending','declined')),
  attendance_type text check (attendance_type is null or attendance_type in ('Wedding Banquet only (7pm)','Wedding banquet + ROM','ROM only (3.30pm)')),
  dietary text,
  email text,
  submission_id uuid,
  guest_index integer,
  guests jsonb not null default '[]'::jsonb,
  message text,
  user_agent text,
  page_path text,
  submitted_at timestamptz not null default now(),
  confirmation_email_sent_at timestamptz,
  confirmation_email_error text
);

insert into public.wedding_rsvps_reordered (
  id,
  invite_id,
  passkey,
  guest_name,
  status,
  attendance_type,
  dietary,
  email,
  submission_id,
  guest_index,
  guests,
  message,
  user_agent,
  page_path,
  submitted_at,
  confirmation_email_sent_at,
  confirmation_email_error
)
overriding system value
select
  id,
  invite_id,
  passkey,
  guest_name,
  status,
  attendance_type,
  dietary,
  email,
  submission_id,
  guest_index,
  guests,
  message,
  user_agent,
  page_path,
  submitted_at,
  confirmation_email_sent_at,
  confirmation_email_error
from public.wedding_rsvps;

drop table public.wedding_rsvps;
alter table public.wedding_rsvps_reordered rename to wedding_rsvps;

alter table public.wedding_rsvps rename constraint wedding_rsvps_reordered_pkey to wedding_rsvps_pkey;
alter table public.wedding_rsvps rename constraint wedding_rsvps_reordered_invite_id_fkey to wedding_rsvps_invite_id_fkey;
alter table public.wedding_rsvps rename constraint wedding_rsvps_reordered_status_check to wedding_rsvps_status_check;
alter table public.wedding_rsvps rename constraint wedding_rsvps_reordered_attendance_type_check to wedding_rsvps_attendance_type_check;

alter table public.wedding_rsvps enable row level security;

select setval(
  pg_get_serial_sequence('public.wedding_rsvps', 'id'),
  coalesce((select max(id) from public.wedding_rsvps), 1),
  (select exists(select 1 from public.wedding_rsvps))
);

commit;
