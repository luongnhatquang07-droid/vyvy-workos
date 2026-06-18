import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Dispatcher thông báo đa kênh ──────────────────────────────────────────────
// In-app chạy ngay (insert notifications → realtime đã có).
// Zalo / Messenger: stub env-guarded — CHỈ gửi khi có token + id người nhận.
// Khi cấu hình OA, điền phần TODO; trước đó tự no-op an toàn (không gửi nhầm).

export type NotifyChannel = 'in_app' | 'zalo' | 'messenger'

export type NotifyPayload = {
  recipientId: string
  type: string
  title: string
  body: string
}

export type NotifyTargets = {
  zaloUserId?: string | null
  messengerPsid?: string | null
}

export async function notifyInApp(supabase: SupabaseClient, p: NotifyPayload): Promise<boolean> {
  const { error } = await supabase.from('notifications').insert({
    recipient_id: p.recipientId,
    type: p.type,
    title: p.title,
    body: p.body,
  })
  return !error
}

// Zalo OA / ZNS — cần ZALO_OA_TOKEN (server-side) + zalo_user_id của nhân viên.
export async function notifyZalo(zaloUserId: string | null | undefined, _p: NotifyPayload): Promise<boolean> {
  void _p
  const token = process.env.ZALO_OA_TOKEN
  if (!token || !zaloUserId) return false
  // TODO: gọi Zalo OA Message / ZNS API với template đã duyệt. Giữ stub khi chưa cấu hình.
  return false
}

// Facebook Messenger — cần FB_PAGE_TOKEN + PSID của nhân viên (cửa sổ chính sách 24h).
export async function notifyMessenger(psid: string | null | undefined, _p: NotifyPayload): Promise<boolean> {
  void _p
  const token = process.env.FB_PAGE_TOKEN
  if (!token || !psid) return false
  // TODO: gọi Facebook Send API.
  return false
}

// Fan-out: gửi ra mọi kênh khả dụng. Trả về các kênh đã gửi thành công.
export async function dispatchNotification(
  supabase: SupabaseClient,
  p: NotifyPayload,
  targets: NotifyTargets = {},
): Promise<NotifyChannel[]> {
  const sent: NotifyChannel[] = []
  if (await notifyInApp(supabase, p)) sent.push('in_app')
  if (await notifyZalo(targets.zaloUserId, p)) sent.push('zalo')
  if (await notifyMessenger(targets.messengerPsid, p)) sent.push('messenger')
  return sent
}
