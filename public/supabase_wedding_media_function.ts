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
  background_pg1: 'background_rsvp/background_pg1.jpg',
  background_pg2: 'background_rsvp/background_pg2.png',
  background_pg3: 'background_rsvp/background_pg3.jpg',
  background_pg4: 'background_rsvp/background_pg4.jpg',
  background_pg5: 'background_rsvp/background_pg5.jpg',
  background_pg6: 'background_rsvp/background_pg6.jpg',
  
  gallery_alpine_adventures: 'lightbox_alpine_adventures.jpg',
  gallery_balloon_turkey: 'lightbox_balloon_turkey.jpeg',
  gallery_birthday_celebration: 'lightbox_bday_celebration.jpeg',
  gallery_concert_night: 'lightbox_concert_night.jpg',
  gallery_on_the_slopes: 'lightbox_on_the_slopes.jpg',
  gallery_she_said_yes: 'lightbox_she_said_yes.jpeg',
  gallery_shibuya_sky: 'lightbox_shibuya_sky.jpeg',
  gallery_winter_in_japan: 'lightbox_winter_in_japan.jpg',
}

Deno.serve(async (req: Request) => { // Added Request type definition
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
    // Added structural typing to item and index parameters below
    data.forEach((item: { signedUrl: string }, index: number) => {
      if (item.signedUrl) assets[keys[index]] = item.signedUrl
    })

    return new Response(JSON.stringify({ ok: true, assets }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    // Safely cast error as any to access the message dynamically
    const errorDetails = err as any; 
    return new Response(JSON.stringify({ ok: false, error: errorDetails?.message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})