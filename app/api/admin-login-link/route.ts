import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Generates a one-time sign-in link for an email using service role.
// Requires CONFIRM_SECRET in request body for authorization.
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return Response.json({ ok: false, error: 'missing env' }, { status: 500 })

  const secret = process.env.CONFIRM_SECRET
  if (!secret) return Response.json({ ok: false, error: 'CONFIRM_SECRET not configured' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  if (body.secret !== secret) return Response.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const email = body.email as string | undefined
  if (!email) return Response.json({ ok: false, error: 'email required' }, { status: 400 })

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  // Confirm email first
  const { data: listData } = await supabase.auth.admin.listUsers()
  const user = listData?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())

  if (user) {
    await supabase.auth.admin.updateUserById(user.id, { email_confirm: true })

    // Ensure employee record is linked
    const { data: empById } = await supabase.from('employees').select('id, email, auth_user_id').eq('auth_user_id', user.id).maybeSingle()
    if (!empById) {
      // Try by email
      const { data: empByEmail } = await supabase.from('employees').select('id, email, auth_user_id').ilike('email', email).maybeSingle()
      if (empByEmail) {
        await supabase.from('employees').update({ auth_user_id: user.id }).eq('id', empByEmail.id)
      } else {
        // Find admin with no email
        const { data: adminNoEmail } = await supabase.from('employees').select('id, role').eq('role', 'admin').is('email', null).limit(1).maybeSingle()
        if (adminNoEmail) {
          await supabase.from('employees').update({ auth_user_id: user.id, email }).eq('id', adminNoEmail.id)
        } else {
          // Create new admin employee
          await supabase.from('employees').insert({ full_name: email.split('@')[0], email, auth_user_id: user.id, role: 'admin', status: 'active', position: 'Admin' })
        }
      }
    }
  } else {
    // User doesn't exist — create them
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: email.split('@')[0] },
    })
    if (createErr || !newUser.user) return Response.json({ ok: false, error: createErr?.message || 'create failed' }, { status: 500 })

    // Create employee record
    await supabase.from('employees').insert({ full_name: email.split('@')[0], email, auth_user_id: newUser.user.id, role: 'admin', status: 'active', position: 'Admin' })
  }

  // Generate magic link
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'https://vyvy-workos.vercel.app' },
  })
  if (linkErr || !linkData) return Response.json({ ok: false, error: linkErr?.message || 'link generation failed' }, { status: 500 })

  const rawLink = linkData.properties?.action_link || ''
  // Replace redirect_to with production URL regardless of Supabase site URL setting
  const fixedLink = rawLink.replace(/redirect_to=[^&]+/, 'redirect_to=https%3A%2F%2Fvyvy-workos.vercel.app')
  return Response.json({ ok: true, link: fixedLink })
}
