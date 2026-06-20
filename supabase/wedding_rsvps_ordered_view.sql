-- Creates a reporting view with the requested RSVP column order.
-- PostgreSQL does not support reordering physical table columns with ALTER TABLE.

create or replace view public.wedding_rsvps_ordered as
select
  id,
  invite_id,
  submission_id,
  passkey,
  guest_name,
  status,
  attendance_type,
  dietary,
  email,
  guest_index,
  guests,
  message,
  confirmation_email_sent_at,
  confirmation_email_error,
  user_agent,
  page_path,
  submitted_at
from public.wedding_rsvps;
