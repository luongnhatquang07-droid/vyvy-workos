import { NextResponse } from 'next/server'
import {
  authEmailFromUsername,
  cleanEmail,
  cleanNullableId,
  cleanStatus,
  cleanText,
  cleanUsername,
  isActiveAccountStatus,
  jsonError,
  requireUserManagementAccess,
  usernameFromEmail,
} from '@/lib/admin/userManagement'
import {
  adminAuthErrorMessage,
  entityExists,
  findRoleByCode,
  loadUserManagementData,
  updateMembershipRole,
} from '@/lib/admin/userManagementData'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireUserManagementAccess()
  if (!auth.ok) return auth.response

  try {
    const { id: profileId } = await context.params
    if (!profileId) return jsonError('Thiếu profile cần cập nhật.', 400)

    const body = (await request.json()) as Record<string, unknown>
    const fullName = cleanText(body.fullName)
    const loginInput = cleanUsername(body.username)
    const roleCode = cleanText(body.roleCode).toUpperCase()
    const departmentId = cleanNullableId(body.departmentId)
    const managerId = cleanNullableId(body.managerId)
    const status = cleanStatus(body.status)
    const email = loginInput.includes('@') ? cleanEmail(loginInput) : authEmailFromUsername(loginInput)
    const username = loginInput.includes('@') ? usernameFromEmail(email) : loginInput

    if (!fullName) return jsonError('Thiếu họ tên.', 400)
    if (!roleCode) return jsonError('Thiếu vai trò.', 400)

    if (!username) return jsonError('Thiếu tên đăng nhập.', 400)
    if (!/^[a-z0-9._-]+$/.test(username)) return jsonError('Tên đăng nhập chỉ dùng chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.', 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError('Email nội bộ không hợp lệ.', 400)

    const role = await findRoleByCode(auth.service, roleCode)
    if (!role) return jsonError('Vai trò không tồn tại.', 400)

    const profileRes = await auth.service
      .from('profiles')
      .select('id,auth_user_id,username')
      .eq('workspace_id', auth.workspaceId)
      .eq('id', profileId)
      .maybeSingle()
    if (profileRes.error) throw profileRes.error
    if (!profileRes.data) return jsonError('Không tìm thấy tài khoản.', 404)

    if (!profileRes.data.auth_user_id) return jsonError('Tai khoan chua lien ket Auth user.', 400)

    const usernameRes = await auth.service
      .from('profiles')
      .select('id')
      .eq('workspace_id', auth.workspaceId)
      .eq('username', username)
      .neq('id', profileId)
      .maybeSingle()
    if (usernameRes.error) throw usernameRes.error
    if (usernameRes.data) return jsonError('Tên đăng nhập đã tồn tại.', 409)

    const personRes = await auth.service
      .from('people')
      .select('id')
      .eq('workspace_id', auth.workspaceId)
      .eq('profile_id', profileId)
      .is('deleted_at', null)
      .maybeSingle()
    if (personRes.error) throw personRes.error

    const emailRes = await auth.service
      .from('people')
      .select('id')
      .eq('workspace_id', auth.workspaceId)
      .eq('email', email)
      .neq('profile_id', profileId)
      .is('deleted_at', null)
      .maybeSingle()
    if (emailRes.error) throw emailRes.error
    if (emailRes.data) return jsonError('Email nội bộ đã tồn tại.', 409)
    const membershipRes = await auth.service
      .from('workspace_memberships')
      .select('id')
      .eq('workspace_id', auth.workspaceId)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (membershipRes.error) throw membershipRes.error
    if (!membershipRes.data?.id) return jsonError('Tài khoản chưa có membership hợp lệ.', 400)
    if (!personRes.data?.id) return jsonError('Tài khoản chưa có hồ sơ nhân sự.', 404)

    if (departmentId) {
      const departmentOk = await entityExists(auth.service, 'departments', auth.workspaceId, departmentId)
      if (!departmentOk) return jsonError('Phòng ban không tồn tại.', 400)
    }

    if (managerId) {
      if (managerId === personRes.data.id) return jsonError('Người quản lý không được trùng chính tài khoản này.', 400)
      const managerOk = await entityExists(auth.service, 'people', auth.workspaceId, managerId)
      if (!managerOk) return jsonError('Người quản lý không tồn tại.', 400)
    }

    const profileUpdate = await auth.service
      .from('profiles')
      .update({
        display_name: fullName,
        username,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', auth.workspaceId)
      .eq('id', profileId)
    if (profileUpdate.error) throw profileUpdate.error

    const personUpdate = await auth.service
      .from('people')
      .update({
        full_name: fullName,
        department_id: departmentId,
        manager_id: managerId,
        email,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', auth.workspaceId)
      .eq('profile_id', profileId)
      .is('deleted_at', null)
    if (personUpdate.error) throw personUpdate.error

    await updateMembershipRole(auth.service, auth.workspaceId, profileId, role.id, status)

    if (profileRes.data.auth_user_id) {
      const authUpdate = await auth.service.auth.admin.updateUserById(profileRes.data.auth_user_id, {
        email,
        email_confirm: true,
        user_metadata: { display_name: fullName, username, account_status: status },
        ban_duration: isActiveAccountStatus(status) ? 'none' : '876000h',
      })
      if (authUpdate.error) return jsonError(adminAuthErrorMessage(authUpdate.error), 400)
    }

    const data = await loadUserManagementData(auth.service, auth.workspaceId)
    return NextResponse.json({
      ok: true,
      user: data.users.find((user) => user.profileId === profileId) ?? null,
      users: data.users,
    })
  } catch (error) {
    return jsonError(errorMessage(error), 500)
  }
}

function errorMessage(error: unknown) {
  const authMessage = adminAuthErrorMessage(error)
  if (authMessage) return authMessage
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return 'Có lỗi xảy ra khi cập nhật tài khoản.'
}
