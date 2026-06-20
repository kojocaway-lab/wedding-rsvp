import { createClient } from 'npm:@supabase/supabase-js@2'

const weddingEvent = {
  title: 'Attendance confirmed - Wedding banquet - Joseph & Chloe',
  description: 'Wedding celebration for Joseph and Chloe',
  location: 'Stateroom 2, M Resort & Hotel, Jalan Damansara, Bukit Kiara, 60000 Kuala Lumpur',
  start: '2026-12-19T19:00:00+08:00',
  end: '2026-12-19T23:00:00+08:00',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function formatIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n')
}

function makeCalendarLinks() {
  const start = formatIcsDate(weddingEvent.start)
  const end = formatIcsDate(weddingEvent.end)
  const text = encodeURIComponent(weddingEvent.title)
  const details = encodeURIComponent(weddingEvent.description)
  const location = encodeURIComponent(weddingEvent.location)

  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}&location=${location}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${text}&startdt=${encodeURIComponent(weddingEvent.start)}&enddt=${encodeURIComponent(weddingEvent.end)}&body=${details}&location=${location}`,
  }
}

function makeIcs(passkey: string) {
  const uid = `joseph-chloe-wedding-${passkey}@wedding-rsvp`
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Joseph Chloe Wedding//RSVP//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${formatIcsDate(weddingEvent.start)}`,
    `DTEND:${formatIcsDate(weddingEvent.end)}`,
    `SUMMARY:${escapeIcs(weddingEvent.title)}`,
    `DESCRIPTION:${escapeIcs(weddingEvent.description)}`,
    `LOCATION:${escapeIcs(weddingEvent.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

const allowedAttendanceTypes = [
  'Wedding Banquet only (7pm)',
  'Wedding banquet + ROM',
  'ROM only (3.30pm)',
]

function emailHtml(guestLabel: string, guests: Array<Record<string, unknown>>, links: ReturnType<typeof makeCalendarLinks>) {
  const guestRows = guests
    .map((guest) => {
      const name = String(guest.name || '').trim()
      const dietary = String(guest.dietary || 'None').trim()
      return `<li>${name || 'Guest'}${dietary && dietary !== 'None' ? ` - Dietary: ${dietary}` : ''}</li>`
    })
    .join('')

  return `
    <div style="font-family:Georgia,serif;color:#2d261d;line-height:1.6">
      <h1 style="font-weight:400">RSVP Confirmed</h1>
      <p>Dear ${guestLabel || 'guest'},</p>
      <p>Thank you for confirming your attendance. We look forward to celebrating with you.</p>
      <p><strong>Event:</strong> ${weddingEvent.title}<br/>
      <strong>Date:</strong> 19 December 2026<br/>
      <strong>Time:</strong> 3:30 PM<br/>
      <strong>Venue:</strong> ${weddingEvent.location}</p>
      <p><strong>Confirmed guest(s):</strong></p>
      <ul>${guestRows}</ul>
      <p>
        <a href="${links.google}">Add to Google Calendar</a><br/>
        <a href="${links.outlook}">Add to Outlook Calendar</a>
      </p>
      <p>An Apple Calendar / Outlook .ics invite is also attached to this email.</p>
      <p>With love,<br/>Joseph &amp; Chloe</p>
    </div>
  `
}

async function sendConfirmationEmail(params: {
  to: string
  guestLabel: string
  guests: Array<Record<string, unknown>>
  passkey: string
}) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('CONFIRMATION_FROM_EMAIL')
  if (!resendApiKey || !fromEmail) {
    return { sent: false, reason: 'Email provider is not configured.' }
  }

  const links = makeCalendarLinks()
  const ics = makeIcs(params.passkey)
  const replyTo = Deno.env.get('CONFIRMATION_REPLY_TO_EMAIL') || undefined

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [params.to],
      reply_to: replyTo,
      subject: 'RSVP confirmed - Joseph & Chloe Wedding',
      html: emailHtml(params.guestLabel, params.guests, links),
      attachments: [
        {
          filename: 'joseph-chloe-wedding.ics',
          content: btoa(ics),
        },
      ],
    }),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    return { sent: false, reason: errorText || 'Email provider rejected the message.' }
  }

  return { sent: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  try {
    const { passkey, response, userAgent, path } = await req.json()
    const cleanPasskey = String(passkey || '').trim()

    const { data: invite } = await supabase
      .from('wedding_invites')
      .select('id, passkey, guest_label, max_guests, is_active')
      .eq('passkey', cleanPasskey)
      .eq('is_active', true)
      .maybeSingle()

    if (!invite) return json({ ok: false, error: 'Invalid passkey.' }, 401)

    const guests = Array.isArray(response?.guests) ? response.guests : []
    if (guests.length > invite.max_guests) {
      return json({ ok: false, error: 'This invite is not configured for that many guests.' }, 400)
    }

    const status = response?.status === 'declined' ? 'declined' : 'attending'
    if (status === 'attending' && guests.length < 1) {
      return json({ ok: false, error: 'Please select the number of pax.' }, 400)
    }
    const attendanceType = String(response?.attendanceType || '').trim()
    if (status === 'attending' && !allowedAttendanceTypes.includes(attendanceType)) {
      return json({ ok: false, error: 'Please select which event you will be attending.' }, 400)
    }
    if (
      status === 'attending' &&
      attendanceType !== 'ROM only (3.30pm)' &&
      guests.some((guest) => !String(guest?.dietary || '').trim())
    ) {
      return json({ ok: false, error: 'Please select dietary requirements for each guest.' }, 400)
    }

    const { data: savedRsvp, error } = await supabase.from('wedding_rsvps').insert({
      invite_id: invite.id,
      passkey: cleanPasskey,
      status,
      email: response?.email || null,
      attendance_type: status === 'attending' ? attendanceType : null,
      guests,
      message: response?.message || null,
      user_agent: userAgent || null,
      page_path: path || null,
    }).select('id').single()

    if (error) throw error

    await supabase.from('wedding_invite_events').insert({
      invite_id: invite.id,
      passkey: cleanPasskey,
      event_type: 'rsvp_submitted',
      user_agent: userAgent || null,
      page_path: path || null,
    })

    let emailConfirmation: { sent: boolean; reason?: string } = {
      sent: false,
      reason: 'Only attending RSVPs receive confirmation emails.',
    }
    if (status === 'attending' && response?.email) {
      emailConfirmation = await sendConfirmationEmail({
        to: String(response.email).trim(),
        guestLabel: invite.guest_label,
        guests,
        passkey: cleanPasskey,
      })

      await supabase.from('wedding_rsvps').update({
        confirmation_email_sent_at: emailConfirmation.sent ? new Date().toISOString() : null,
        confirmation_email_error: emailConfirmation.sent ? null : emailConfirmation.reason || 'Email was not sent.',
      }).eq('id', savedRsvp.id)
    }

    return json({ ok: true, emailConfirmation })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return json({ ok: false, error: message }, 500)
  }
})
