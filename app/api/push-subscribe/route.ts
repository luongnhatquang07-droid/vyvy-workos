import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { employeeId, subscription } = await req.json()
  if (!employeeId || !subscription?.endpoint) {
    return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 })
  }

  const { endpoint, keys } = subscription
  const { p256dh, auth } = keys || {}
  if (!p256dh || !auth) return NextResponse.json({ error: 'Thiếu keys' }, { status: 400 })

  // Upsert: cùng endpoint thì update, mới thì insert
  const { error } = await supabaseAdmin.from('push_subscriptions').upsert(
    { employee_id: employeeId, endpoint, p256dh, auth, user_agent: req.headers.get('user-agent') || null },
    { onConflict: 'endpoint' }
  )

  if (error) {
    console.error('[push-subscribe]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { endpoint } = await req.json()
  if (!endpoint) return NextResponse.json({ error: 'Thiếu endpoint' }, { status: 400 })

  await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', endpoint)
  return NextResponse.json({ ok: true })
}
