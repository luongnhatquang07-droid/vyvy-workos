import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'project-files'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId')?.trim() ?? ''
  const storagePath = searchParams.get('path')?.trim() ?? ''

  if (!workspaceId || !storagePath) {
    return NextResponse.json({ error: 'Thiếu workspaceId hoặc path.' }, { status: 400 })
  }

  if (!storagePath.startsWith(`${workspaceId}/`)) {
    return NextResponse.json({ error: 'File không thuộc workspace này.' }, { status: 403 })
  }

  const sb = await createServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const profileRes = await sb
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileRes.error || !profileRes.data?.id) {
    return NextResponse.json({ error: 'Không kiểm tra được tài khoản đăng nhập.' }, { status: 403 })
  }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', profileRes.data.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipRes.error || !membershipRes.data) {
    return NextResponse.json({ error: 'Bạn không có quyền mở file này.' }, { status: 403 })
  }

  const service = createServiceClient()
  const signedUrlRes = await service.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 3600)
  const signedUrl = signedUrlRes.data?.signedUrl

  if (signedUrlRes.error || !signedUrl) {
    return NextResponse.json({ error: 'Không lấy được link mở file.' }, { status: 500 })
  }

  return NextResponse.redirect(signedUrl)
}
