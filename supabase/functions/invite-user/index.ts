// Invite-user Edge Function — creates a pending invitation and sends the
// invitation email via Supabase Auth (service role). Runs as a Deno function.
//   POST { email, role, tenant_id }
// Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL (optional)
//
// CORS is required: the browser preflights this request (Authorization +
// apikey + content-type headers), so without an OPTIONS handler and
// Access-Control-Allow-* headers every browser call fails with
// "Failed to send a request to the Edge Function".

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // Answer the browser's CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders })
    }

    const { email, role, tenant_id } = await req.json().catch(() => ({}))
    if (!email || !tenant_id) {
      return Response.json({ error: 'email and tenant_id are required' }, { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Persist the invitation so the onboarding Business-Code join can validate it.
    const { data: tenant } = await supabase.from('tenants')
      .select('business_name').eq('id', tenant_id).single()

    await supabase.from('tenant_invitations').upsert({
      tenant_id,
      tenant_name: tenant?.business_name || '',
      email,
      role: role || 'cashier',
      status: 'pending',
    }, { onConflict: 'tenant_id,email' })

    // Deliver the invite email. Supabase only invites unregistered emails; an
    // already-registered user can sign in directly, so treat that as success.
    const site = Deno.env.get('SITE_URL') || 'https://libreta.supabase.co'
    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: site,
    })

    if (error && !/already registered/i.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400, headers: corsHeaders })
    }

    return Response.json({
      ok: true,
      message: error ? 'user already registered — invitation persisted' : 'invitation sent',
    }, { headers: corsHeaders })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: corsHeaders })
  }
})
