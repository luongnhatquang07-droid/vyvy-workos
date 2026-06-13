import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Allows a valid Supabase auth user to re-link their auth_user_id to an existing employee
// record that either: (a) has their email, or (b) has no email but was the first admin created.
// Only works if the caller is an authenticated Supabase user.
export async function POST(request: Request) {
  const supabase = serviceClient()

  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const token = authHeader.slice('Bearer '.length)
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const user = userData.user
  const email = user.email || ''

  // 1. Try to find employee by email
  if (email) {
    const { data: byEmail } = await supabase
      .from('employees')
      .select('id, role, auth_user_id, email')
      .ilike('email', email)
      .maybeSingle()

    if (byEmail) {
      await supabase.from('employees').update({ auth_user_id: user.id }).eq('id', byEmail.id)
      return Response.json({ ok: true, method: 'email_match', employeeId: byEmail.id, role: byEmail.role })
    }
  }

  // 2. Find any admin employee with no email whose auth_user_id is stale/missing
  const { data: adminNoEmail } = await supabase
    .from('employees')
    .select('id, role, auth_user_id, email')
    .eq('role', 'admin')
    .is('email', null)
    .limit(1)
    .maybeSingle()

  if (adminNoEmail) {
    await supabase.from('employees')
      .update({ auth_user_id: user.id, email })
      .eq('id', adminNoEmail.id)
    return Response.json({ ok: true, method: 'admin_relink', employeeId: adminNoEmail.id, role: adminNoEmail.role })
  }

  // 3. If no employees at all, create first admin
  const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true })
  if (count === 0 || count === null) {
    const { data: newEmp } = await supabase.from('employees').insert({
      full_name: email.split('@')[0],
      email,
      auth_user_id: user.id,
      role: 'admin',
      status: 'active',
      position: 'Admin',
    }).select('id').maybeSingle()
    return Response.json({ ok: true, method: 'created_first_admin', employeeId: newEmp?.id })
  }

  return Response.json({ ok: false, error: 'no matching employee record found' }, { status: 404 })
}
