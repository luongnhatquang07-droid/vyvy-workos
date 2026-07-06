import { NextResponse } from 'next/server'
import {
  cleanNullableId,
  cleanStatus,
  cleanText,
  isActiveAccountStatus,
  jsonError,
  requireUserManagementAccess,
} from '@/lib/admin/userManagement'
import {
  adminAuthErrorMessage,
  entityExists,
  findRoleByCode,
  loadUserManagementData,
  updateMembershipRole,
} from '@/lib/admin/userManagementData'

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
    const roleCode = cleanText(body.roleCode).toUpperCase()
    const departmentId = cleanNullableId(body.departmentId)
    const managerId = cleanNullableId(body.managerId)
    const status = cleanStatus(body.status)

    if (!fullName) return jsonError('Thiếu họ tên.', 400)
    if (!roleCode) return jsonError('Thiếu vai trò.', 400)

    const role = await findRoleByCode(auth.service, roleCode)
    if (!role) return jsonError('Vai trò không tồn tại.', 400)

    const profileRes = await auth.service
      .from('profiles')
      .select('id,auth_user_id')
      .eq('workspace_id', auth.workspaceId)
      .eq('id', profileId)
      .maybeSingle()
    if (profileRes.error) throw profileRes.error
    if (!profileRes.data) return jsonError('Không tìm thấy tài khoản.', 404)

    const personRes = await auth.service
      .from('people')
      .select('id')
      .eq('workspace_id', auth.workspaceId)
      .eq('profile_id', profileId)
      .is('deleted_at', null)
      .maybeSingle()
    if (personRes.error) throw personRes.error
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
        user_metadata: { display_name: fullName, account_status: status },
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
