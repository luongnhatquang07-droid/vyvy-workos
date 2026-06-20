import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export type NotifyRow = {
  recipient_id: string
  actor_id?: string | null
  type?: string
  title: string
  body?: string | null
  task_id?: string | null
  project_id?: string | null
}

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const rows: NotifyRow[] = await req.json().catch(() => [])
  const valid = rows.filter((r) => r.recipient_id)
  if (valid.length === 0) return NextResponse.json({ ok: true, inserted: 0 })

  const { error } = await supabaseAdmin
    .from('notifications')
    .insert(valid.map((r) => ({ type: 'info', ...r })))

  if (error) {
    console.error('[/api/notify] insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, inserted: valid.length })
}
