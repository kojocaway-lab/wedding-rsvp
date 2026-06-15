// Supabase Edge Function: wedding-media
// Purpose: verify RSVP password privately, then return temporary signed URLs for private Storage photos.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Replace with your RSVP website domain after deployment for security
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET = 'wedding_rsvp_private'
const URL_EXPIRY_SECONDS = 60 * 60 // 1 hour

function backgroundVariantPaths(name: string, extensions = ['jpg', 'jpeg', 'png']) {
  return extensions.flatMap((extension) => [
    `background_rsvp/${name}.${extension}`,
    `${name}.${extension}`,
    `backgrounds/${name}.${extension}`,
  ])
}

const PHOTO_PATHS: Record<string, string[]> = {
  background_pg1_desktop: backgroundVariantPaths('background_pg1_desktop'),
  background_pg1_mobile: backgroundVariantPaths('background_pg1_mobile'),
  background_pg2_desktop: backgroundVariantPaths('background_pg2_desktop'),
  background_pg2_mobile: backgroundVariantPaths('background_pg2_mobile', ['jpeg', 'jpg', 'png']),
  background_pg3: ['background_rsvp/background_pg3.jpg'],
  background_pg4_desktop: backgroundVariantPaths('background_pg4_desktop'),
  background_pg4_mobile: backgroundVariantPaths('background_pg4_mobile'),
  background_pg5_desktop: backgroundVariantPaths('background_pg5_desktop'),
  background_pg5_mobile: backgroundVariantPaths('background_pg5_mobile'),
  background_pg6_desktop: backgroundVariantPaths('background_pg6_desktop'),
  background_pg6_mobile: backgroundVariantPaths('background_pg6_mobile'),
  
  gallery_alpine_adventures: ['gallery_rsvp/lightbox_alpine_adventures.jpg'],
  gallery_balloon_turkey: ['gallery_rsvp/lightbox_balloon_turkey.jpeg'],
  gallery_birthday_celebration: ['gallery_rsvp/lightbox_bday_celebration.jpeg'],
  gallery_concert_night: ['gallery_rsvp/lightbox_concert_night.jpg'],
  gallery_on_the_slopes: ['gallery_rsvp/lightbox_on_the_slopes.jpg'],
  gallery_she_said_yes: ['gallery_rsvp/lightbox_she_said_yes.jpeg'],
  gallery_bali_night: ['gallery_rsvp/lightbox_bali_night.jpeg'],
  gallery_disneysea: ['gallery_rsvp/lightbox_disneysea.jpeg'],
  gallery_shibuya_sky: ['gallery_rsvp/lightbox_shibuya_sky.jpeg'],
  gallery_tassie_adventures: ['gallery_rsvp/lightbox_tassie_adventures.jpeg'],
  gallery_winter_in_japan: ['gallery_rsvp/lightbox_winter_in_japan.jpg'],
  gallery_alps: ['gallery_rsvp/lightbox_alps.jpeg'],
  gallery_dubrovnik: [
    'gallery_rsvp/lightbox_Dubrovnik.jpeg',
    'gallery_rsvp/lightbox_dubrovnik.jpeg',
    'gallery_rsvp/lightbox_Dubrovnik.jpg',
    'gallery_rsvp/lightbox_dubrovnik.jpg',
    'gallery_rsvp/lightbox_Dubrovnik.JPEG',
    'gallery_rsvp/lightbox_dubrovnik.JPEG',
    'gallery_rsvp/lightbox_Dubrovnik.JPG',
    'gallery_rsvp/lightbox_dubrovnik.JPG',
  ],
  gallery_hallstatt: [
    'gallery_rsvp/lightbox_hallstatt.jpeg',
    'gallery_rsvp/lightbox_Hallstatt.jpeg',
    'gallery_rsvp/lightbox_hallstatt.jpg',
    'gallery_rsvp/lightbox_Hallstatt.jpg',
    'gallery_rsvp/lightbox_hallstatt.JPEG',
    'gallery_rsvp/lightbox_Hallstatt.JPEG',
    'gallery_rsvp/lightbox_hallstatt.JPG',
    'gallery_rsvp/lightbox_Hallstatt.JPG',
  ],
  gallery_london: ['gallery_rsvp/lightbox_london.jpeg'],
  gallery_saltmine_adventures: ['gallery_rsvp/lightbox_saltmine_adventures.jpeg'],
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

    const assets: Record<string, string> = {}
    const assetCandidates: Record<string, string[]> = {}
    await Promise.all(Object.entries(PHOTO_PATHS).map(async ([key, paths]) => {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, URL_EXPIRY_SECONDS)

      if (!data) return
      data.forEach((item: { signedUrl?: string }) => {
        if (!item.signedUrl) return
        assetCandidates[key] = assetCandidates[key] || []
        assetCandidates[key].push(item.signedUrl)
        if (!assets[key]) assets[key] = item.signedUrl
      })
    }))

    return new Response(JSON.stringify({ ok: true, assets, assetCandidates }), {
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
