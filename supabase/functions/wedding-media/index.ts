import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET = 'wedding_rsvp_private'
const URL_EXPIRY_SECONDS = 60 * 60

const PHOTO_PATHS: Record<string, string[]> = {
  background_pg1: [
    'background_rsvp/background_pg1.jpg',
    'background_pg1.jpg',
    'backgrounds/background_pg1.jpeg',
    'backgrounds/background_pg1.jpg',
  ],
  background_pg2: [
    'background_rsvp/background_pg2.png',
    'background_rsvp/background_pg2.jpg',
    'background_pg2.png',
    'background_pg2.jpg',
    'backgrounds/background_pg2.jpeg',
    'backgrounds/background_pg2.jpg',
  ],
  background_pg3: [
    'background_rsvp/background_pg3.jpg',
    'background_pg3.jpg',
    'backgrounds/background_pg3.jpg',
    'backgrounds/background_pg3.jpeg',
  ],
  background_pg4: [
    'background_rsvp/background_pg4.jpg',
    'background_pg4.jpg',
    'backgrounds/background_pg4.jpeg',
    'backgrounds/background_pg4.jpg',
  ],
  background_pg5: [
    'background_rsvp/background_pg5.jpg',
    'background_pg5.jpg',
    'backgrounds/background_pg5.jpeg',
    'backgrounds/background_pg5.jpg',
  ],
  background_pg6: [
    'background_rsvp/background_pg6.jpg',
    'background_pg6.jpg',
    'backgrounds/background_pg6.jpeg',
    'backgrounds/background_pg6.jpg',
  ],
  gallery_on_the_slopes: [
    'gallery_rsvp/lightbox_on_the_slopes.jpg',
    'gallery/on_the_slopes.jpg',
    'lightbox_on_the_slopes.jpg',
  ],
  gallery_alpine_adventures: [
    'gallery_rsvp/lightbox_alpine_adventures.jpg',
    'gallery/alpine_adventures.jpg',
    'lightbox_alpine_adventures.jpg',
  ],
  gallery_she_said_yes: [
    'gallery_rsvp/lightbox_she_said_yes.jpeg',
    'gallery/she_said_yes.jpg',
    'lightbox_she_said_yes.jpeg',
    'lightbox_she_said_yes.jpg',
  ],
  gallery_concert_night: [
    'gallery_rsvp/lightbox_concert_night.jpg',
    'gallery/concert_night.jpg',
    'lightbox_concert_night.jpg',
  ],
  gallery_birthday_celebration: [
    'gallery_rsvp/lightbox_bday_celebration.jpeg',
    'gallery/birthday_celebration.jpg',
    'lightbox_bday_celebration.jpeg',
    'lightbox_birthday_celebration.jpeg',
    'lightbox_birthday_celebration.jpg',
  ],
  gallery_winter_in_japan: [
    'gallery_rsvp/lightbox_winter_in_japan.jpg',
    'gallery/winter_in_japan.jpg',
    'lightbox_winter_in_japan.jpg',
  ],
  gallery_balloon_turkey: [
    'gallery_rsvp/lightbox_balloon_turkey.jpeg',
    'lightbox_balloon_turkey.jpeg',
  ],
  gallery_shibuya_sky: [
    'gallery_rsvp/lightbox_shibuya_sky.jpeg',
    'lightbox_shibuya_sky.jpeg',
  ],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function verifyTurnstile(token: string, remoteIp?: string) {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) throw new Error('Turnstile is not configured.')
  if (!token) return false

  const body: Record<string, string> = {
    secret,
    response: token,
  }
  if (remoteIp) body.remoteip = remoteIp

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) return false
  const result = await res.json()
  return result.success === true
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
    const { passkey, turnstileToken, userAgent, path } = await req.json()
    const cleanPasskey = String(passkey || '').trim()
    const remoteIp =
      req.headers.get('CF-Connecting-IP') ||
      req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      undefined

    const humanOk = await verifyTurnstile(String(turnstileToken || ''), remoteIp)
    if (!humanOk) {
      return json({ ok: false, error: 'Please complete the human verification.' }, 403)
    }

    const { data: invite } = await supabase
      .from('wedding_invites')
      .select('id, passkey, guest_label, max_guests, is_active, access_count')
      .eq('passkey', cleanPasskey)
      .eq('is_active', true)
      .maybeSingle()

    if (!invite) {
      await supabase.from('wedding_invite_events').insert({
        passkey: cleanPasskey || '[blank]',
        event_type: 'access_denied',
        user_agent: userAgent || null,
        page_path: path || null,
      })
      return json({ ok: false, error: 'Incorrect passkey.' }, 401)
    }

    const inviteUpdate: Record<string, string | number> = {
      access_count: (invite.access_count || 0) + 1,
      last_accessed_at: new Date().toISOString(),
    }
    if (!invite.access_count) inviteUpdate.first_accessed_at = new Date().toISOString()

    await supabase.from('wedding_invites').update(inviteUpdate).eq('id', invite.id)

    await supabase.from('wedding_invite_events').insert({
      invite_id: invite.id,
      passkey: cleanPasskey,
      event_type: 'access_granted',
      user_agent: userAgent || null,
      page_path: path || null,
    })

    const assets: Record<string, string> = {}
    const assetCandidates: Record<string, string[]> = {}
    await Promise.all(Object.entries(PHOTO_PATHS).map(async ([key, paths]) => {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, URL_EXPIRY_SECONDS)

      if (!data) return
      data.forEach((item) => {
        if (!item.signedUrl) return
        assetCandidates[key] = assetCandidates[key] || []
        assetCandidates[key].push(item.signedUrl)
        if (!assets[key]) assets[key] = item.signedUrl
      })
    }))

    return json({
      ok: true,
      session: crypto.randomUUID(),
      invite: { guestLabel: invite.guest_label, maxGuests: invite.max_guests },
      assets,
      assetCandidates,
      mediaWarning: Object.keys(assets).length ? null : 'No wedding media files could be loaded.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return json({ ok: false, error: message }, 500)
  }
})
