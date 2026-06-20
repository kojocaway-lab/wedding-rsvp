-- Run this on an existing Supabase database that already has wedding_rsvps.

alter table public.wedding_rsvps
  add column if not exists attendance_type text;

alter table public.wedding_rsvps
  drop constraint if exists wedding_rsvps_attendance_type_check;

alter table public.wedding_rsvps
  add constraint wedding_rsvps_attendance_type_check
  check (
    attendance_type is null
    or attendance_type in ('Wedding banquet only','Wedding banquet + ROM','ROM only')
  );
