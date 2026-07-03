import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'project-files'
const MAX_PREVIEW_BYTES = 25 * 1024 * 1024

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isHtmlPath(path: string) {
  const ext = path.split('.').pop()?.toLowerCase()
  return ext === 'html' || ext === 'htm'
}

function isSafeWorkspacePath(workspaceId: string, path: string) {
  if (!path || path.startsWith('/') || path.includes('\0')) return false
  if (path.split('/').includes('..')) return false
  return path === workspaceId || path.startsWith(`${workspaceId}/`)
}

async function canReadWorkspace(workspaceId: string) {
  const sb = await createServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) return { ok: false, status: 401, message: 'Bạn cần đăng nhập để xem file.' }

  const profileRes = await sb
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileRes.error) return { ok: false, status: 500, message: 'Không kiểm tra được hồ sơ đăng nhập.' }
  if (!profileRes.data?.id) return { ok: false, status: 403, message: 'Tài khoản chưa có profile trong workspace.' }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', profileRes.data.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipRes.error) return { ok: false, status: 500, message: 'Không kiểm tra được quyền workspace.' }
  if (!membershipRes.data) return { ok: false, status: 403, message: 'Bạn không có quyền xem file trong workspace này.' }

  return { ok: true }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')?.trim() ?? ''
  const path = searchParams.get('path')?.trim() ?? ''

  if (!workspaceId) return jsonError('Thiếu workspaceId.', 400)
  if (!path) return jsonError('Thiếu đường dẫn file.', 400)
  if (!isSafeWorkspacePath(workspaceId, path)) return jsonError('Đường dẫn file không hợp lệ.', 403)
  if (!isHtmlPath(path)) return jsonError('Chỉ hỗ trợ preview file HTML/HTM.', 415)

  const access = await canReadWorkspace(workspaceId)
  if (!access.ok) return jsonError(access.message ?? 'Không có quyền xem file.', access.status ?? 403)

  const client = createServiceClient()
  const { data, error } = await client.storage.from(STORAGE_BUCKET).download(path)
  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError('Không tải được nội dung file.', 404)
  if (data.size > MAX_PREVIEW_BYTES) return jsonError('File quá lớn để preview trực tiếp.', 413)

  const html = await data.text()
  const fileName = path.split('/').pop() ?? 'preview.html'

  return NextResponse.json({
    html,
    fileName,
  })
}
