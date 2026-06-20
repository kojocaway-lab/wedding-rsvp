-- Run this on an existing Supabase database that already has wedding_rsvps.

alter table public.wedding_rsvps
  add column if not exists attendance_type text;

alter table public.wedding_rsvps
  drop constraint if exists wedding_rsvps_attendance_type_check;

update public.wedding_rsvps
set attendance_type = case attendance_type
  when 'Wedding banquet only' then 'Wedding Banquet only (7pm)'
  when 'ROM only' then 'ROM only (3.30pm)'
  else attendance_type
end
where attendance_type in ('Wedding banquet only','ROM only');

alter table public.wedding_rsvps
  add constraint wedding_rsvps_attendance_type_check
  check (
    attendance_type is null
    or attendance_type in ('Wedding Banquet only (7pm)','Wedding banquet + ROM','ROM only (3.30pm)')
  );
