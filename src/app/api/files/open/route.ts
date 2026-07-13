import { NextRequest, NextResponse } from 'next/server'
import { contentDispositionInline, inferFileContentType, isHtmlFileName } from '@/lib/files/mime'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'project-files'

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isSafeWorkspacePath(workspaceId: string, path: string) {
  if (!path || path.startsWith('/') || path.includes('\0')) return false
  if (path.split('/').includes('..')) return false
  return path.startsWith(`${workspaceId}/`)
}

function fileNameFromPath(path: string) {
  return path.split('/').pop() || 'file'
}

async function renderHtmlFile(storagePath: string) {
  const service = createServiceClient()
  const { data, error } = await service.storage.from(STORAGE_BUCKET).download(storagePath)

  if (error || !data) {
    return jsonError(error?.message ?? 'Khong tai duoc noi dung file.', error ? 500 : 404)
  }

  const fileName = fileNameFromPath(storagePath)
  return new NextResponse(data, {
    headers: {
      'Content-Type': inferFileContentType(fileName),
      'Content-Disposition': contentDispositionInline(fileName),
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': [
        'sandbox allow-scripts allow-forms allow-modals allow-downloads allow-popups',
        "default-src 'none'",
        "script-src 'unsafe-inline' https: blob:",
        "img-src data: blob: https:",
        "style-src 'unsafe-inline' https:",
        "font-src data: https:",
        "media-src data: blob: https:",
        "connect-src https:",
        "object-src 'none'",
        "frame-src https:",
        "worker-src blob:",
        "base-uri 'none'",
        "form-action https:",
        "frame-ancestors 'none'",
      ].join('; '),
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId')?.trim() ?? ''
  const storagePath = searchParams.get('path')?.trim() ?? ''

  if (!workspaceId || !storagePath) {
    return jsonError('Thieu workspaceId hoac path.', 400)
  }

  if (!isSafeWorkspacePath(workspaceId, storagePath)) {
    return jsonError('File khong thuoc workspace nay.', 403)
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
    return jsonError('Khong kiem tra duoc tai khoan dang nhap.', 403)
  }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', profileRes.data.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipRes.error || !membershipRes.data) {
    return jsonError('Ban khong co quyen mo file nay.', 403)
  }

  if (isHtmlFileName(storagePath)) {
    return renderHtmlFile(storagePath)
  }

  const service = createServiceClient()
  const signedUrlRes = await service.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 3600)
  const signedUrl = signedUrlRes.data?.signedUrl

  if (signedUrlRes.error || !signedUrl) {
    return jsonError('Khong lay duoc link mo file.', 500)
  }

  return NextResponse.redirect(signedUrl)
}
