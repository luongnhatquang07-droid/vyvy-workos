import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// One-time endpoint: confirms a user's email using service role (bypasses email verification).
// Only works in non-production OR with CONFIRM_SECRET env var.
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return Response.json({ ok: false, error: 'missing env' }, { status: 500 })

  const secret = process.env.CONFIRM_SECRET
  if (!secret) return Response.json({ ok: false, error: 'CONFIRM_SECRET not configured' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  if (body.secret !== secret) {
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const email = body.email as string | undefined
  if (!email) return Response.json({ ok: false, error: 'email required' }, { status: 400 })

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  // Look up the user by email
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) return Response.json({ ok: false, error: listErr.message }, { status: 500 })

  const user = listData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) return Response.json({ ok: false, error: 'user not found in auth' }, { status: 404 })

  // Confirm email
  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  })
  if (updateErr) return Response.json({ ok: false, error: updateErr.message }, { status: 500 })

  // Also ensure employee record exists and is linked
  const { data: emp } = await supabase
    .from('employees')
    .select('id, auth_user_id')
    .ilike('email', email)
    .maybeSingle()

  if (emp && !emp.auth_user_id) {
    await supabase.from('employees').update({ auth_user_id: user.id }).eq('id', emp.id)
  }

  if (!emp) {
    // Check by auth_user_id
    const { data: empById } = await supabase
      .from('employees')
      .select('id, email')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (empById && !empById.email) {
      await supabase.from('employees').update({ email }).eq('id', empById.id)
    }
  }

  return Response.json({ ok: true, userId: user.id, emailConfirmed: true })
}
