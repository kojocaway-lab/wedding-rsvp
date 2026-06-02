// Supabase Edge Function: wedding-media
// Purpose: verify RSVP password privately, then return temporary signed URLs for private Storage photos.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Replace with your RSVP website domain after deployment for security
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET = 'wedding-rsvp-private'
const URL_EXPIRY_SECONDS = 60 * 60 // 1 hour

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { password } = await req.json()
    const expectedPassword = Deno.env.get('WEDDING_PASSWORD')
    
    if (!expectedPassword || password !== expectedPassword) {
      return new Response(JSON.stringify({ ok: false, error: 'Incorrect password.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Standard default environment variables provided natively by Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    const keys = Object.keys(PHOTO_PATHS)
    const paths = keys.map((key) => PHOTO_PATHS[key])

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, URL_EXPIRY_SECONDS)

    if (error || !data) {
      throw error || new Error('Unable to create signed URLs')
    }

    const assets: Record<string, string> = {}
    data.forEach((item, index) => {
      if (item.signedUrl) assets[keys[index]] = item.signedUrl
    })

    return new Response(JSON.stringify({ ok: true, assets }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})