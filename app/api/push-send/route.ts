import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:workos@vyvystore.vn',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export type PushPayload = {
  employeeIds: string[]   // danh sách người nhận
  title: string
  body: string
  url?: string            // URL mở khi bấm vào notification
  tag?: string            // nhóm notification (collapse cùng tag)
}

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const payload: PushPayload = await req.json()
  const { employeeIds, title, body, url = '/', tag = 'workos' } = payload

  if (!employeeIds?.length || !title) {
    return NextResponse.json({ error: 'Thiếu employeeIds hoặc title' }, { status: 400 })
  }

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('employee_id', employeeIds)

  if (!subs || subs.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 'no subscriptions' })
  }

  const message = JSON.stringify({ title, body, url, tag })
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
        { TTL: 86400 } // 24h TTL — giao sau nếu thiết bị offline
      ).catch(async (err) => {
        // Subscription hết hạn (410 Gone) → xóa khỏi DB
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
        throw err
      })
    )
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.length - sent
  if (failed > 0) console.warn(`[push-send] ${failed}/${results.length} pushes failed`)

  return NextResponse.json({ sent, total: subs.length })
}
