import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET = 'wedding-rsvp-private'
const URL_EXPIRY_SECONDS = 60 * 60

const PHOTO_PATHS: Record<string, string> = {
  background_pg1: 'backgrounds/background_pg1.jpeg',
  background_pg2: 'backgrounds/background_pg2.jpeg',
  background_pg3: 'backgrounds/background_pg3.jpg',
  background_pg4: 'backgrounds/background_pg4.jpeg',
  background_pg5: 'backgrounds/background_pg5.jpeg',
  background_pg6: 'backgrounds/background_pg6.jpeg',
  gallery_on_the_slopes: 'gallery/on_the_slopes.jpg',
  gallery_alpine_adventures: 'gallery/alpine_adventures.jpg',
  gallery_she_said_yes: 'gallery/she_said_yes.jpg',
  gallery_concert_night: 'gallery/concert_night.jpg',
  gallery_birthday_celebration: 'gallery/birthday_celebration.jpg',
  gallery_winter_in_japan: 'gallery/winter_in_japan.jpg',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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
    const { passkey, userAgent, path } = await req.json()
    const cleanPasskey = String(passkey || '').trim()

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

    const keys = Object.keys(PHOTO_PATHS)
    const paths = keys.map((key) => PHOTO_PATHS[key])
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, URL_EXPIRY_SECONDS)

    if (error || !data) throw error || new Error('Unable to create signed URLs')

    const assets: Record<string, string> = {}
    data.forEach((item, index) => {
      if (item.signedUrl) assets[keys[index]] = item.signedUrl
    })

    return json({
      ok: true,
      session: crypto.randomUUID(),
      invite: { guestLabel: invite.guest_label, maxGuests: invite.max_guests },
      assets,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return json({ ok: false, error: message }, 500)
  }
})
