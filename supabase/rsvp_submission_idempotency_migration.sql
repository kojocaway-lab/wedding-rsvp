-- Prevent duplicate guest RSVP rows when the same submission is sent more than once.

update public.wedding_rsvps
set
  submission_id = coalesce(submission_id, gen_random_uuid()),
  guest_index = coalesce(guest_index, 1)
where submission_id is null or guest_index is null;

alter table public.wedding_rsvps
  drop constraint if exists wedding_rsvps_submission_guest_index_key;

alter table public.wedding_rsvps
  add constraint wedding_rsvps_submission_guest_index_key
  unique (submission_id, guest_index);
