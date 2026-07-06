import { NextResponse } from 'next/server'
import { cleanText, jsonError, requireUserManagementAccess } from '@/lib/admin/userManagement'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireUserManagementAccess()
  if (!auth.ok) return auth.response

  try {
    const { id: profileId } = await context.params
    const body = (await request.json()) as Record<string, unknown>
    const password = cleanText(body.password)
    if (password.length < 8) return jsonError('Mật khẩu tạm phải có ít nhất 8 ký tự.', 400)

    const profileRes = await auth.service
      .from('profiles')
      .select('id,auth_user_id')
      .eq('workspace_id', auth.workspaceId)
      .eq('id', profileId)
      .maybeSingle()
    if (profileRes.error) throw profileRes.error
    if (!profileRes.data) return jsonError('Không tìm thấy tài khoản.', 404)
    if (!profileRes.data.auth_user_id) return jsonError('Tài khoản chưa liên kết Auth user.', 400)

    const authUpdate = await auth.service.auth.admin.updateUserById(profileRes.data.auth_user_id, {
      password,
      email_confirm: true,
    })
    if (authUpdate.error) return jsonError(authUpdate.error.message, 400)

    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(errorMessage(error), 500)
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return 'Có lỗi xảy ra khi reset mật khẩu.'
}
