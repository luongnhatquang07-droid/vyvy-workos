import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return Response.json({ ok: false, error: 'missing env' }, { status: 500 })

  const secret = process.env.CONFIRM_SECRET
  if (!secret) return Response.json({ ok: false, error: 'CONFIRM_SECRET not configured' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  if (body.secret !== secret) return Response.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const { email, password, fullName } = body as { email?: string; password?: string; fullName?: string }
  if (!email || !password) return Response.json({ ok: false, error: 'email and password required' }, { status: 400 })

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  // Find user
  const { data: listData } = await supabase.auth.admin.listUsers()
  const user = listData?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) return Response.json({ ok: false, error: 'user not found' }, { status: 404 })

  // Update password + confirm email
  await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true })

  // Upsert employee record
  const { data: empById } = await supabase.from('employees').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!empById) {
    const { data: empByEmail } = await supabase.from('employees').select('id').ilike('email', email).maybeSingle()
    if (empByEmail) {
      await supabase.from('employees').update({ auth_user_id: user.id }).eq('id', empByEmail.id)
    } else {
      await supabase.from('employees').insert({
        full_name: fullName || email.split('@')[0],
        email,
        auth_user_id: user.id,
        role: 'admin',
        status: 'active',
        position: 'Admin',
      })
    }
  }

  return Response.json({ ok: true, userId: user.id })
}
