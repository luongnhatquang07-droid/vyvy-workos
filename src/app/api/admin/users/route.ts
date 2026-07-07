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
  findDuplicateEmail,
  findRoleByCode,
  loadUserManagementData,
} from '@/lib/admin/userManagementData'
import { permissionOverrideTableReady, saveUserPermissionOverrides } from '@/lib/admin/userPermissionOverrides'

export const runtime = 'nodejs'

export async function GET() {
  const auth = await requireUserManagementAccess()
  if (!auth.ok) return auth.response

  try {
    const data = await loadUserManagementData(auth.service, auth.workspaceId)
    return NextResponse.json({
      ...data,
      meta: {
        supabaseRef: auth.supabaseRef,
        appEnv: process.env.APP_ENV ?? null,
        currentRole: auth.actor.role,
      },
    })
  } catch (error) {
    return jsonError(errorMessage(error), 500)
  }
}

export async function POST(request: Request) {
  const auth = await requireUserManagementAccess()
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const fullName = cleanText(body.fullName)
    const loginInput = cleanUsername(body.username ?? body.email)
    const password = cleanText(body.password)
    const roleCode = cleanText(body.roleCode).toUpperCase()
    const departmentId = cleanNullableId(body.departmentId)
    const managerId = cleanNullableId(body.managerId)
    const status = cleanStatus(body.status)
    const email = loginInput.includes('@') ? cleanEmail(loginInput) : authEmailFromUsername(loginInput)
    const username = loginInput.includes('@') ? usernameFromEmail(email) : loginInput
    const useCustomPermissions = body.useCustomPermissions === true

    if (!fullName) return jsonError('Thiếu họ tên.', 400)
    if (!username) return jsonError('Thiếu tên đăng nhập.', 400)
    if (!/^[a-z0-9._-]+$/.test(username)) return jsonError('Tên đăng nhập chỉ dùng chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.', 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError('Email nội bộ không hợp lệ.', 400)
    if (password.length < 8) return jsonError('Mật khẩu tạm phải có ít nhất 8 ký tự.', 400)
    if (!roleCode) return jsonError('Thiếu vai trò.', 400)

    const role = await findRoleByCode(auth.service, roleCode)
    if (!role) return jsonError('Vai trò không tồn tại.', 400)

    if (useCustomPermissions) {
      const tableReady = await permissionOverrideTableReady(auth.service)
      if (!tableReady.ready) return jsonError(tableReady.message ?? 'Chua san sang luu quyen tuy chinh.', 409)
      if (roleCode === 'ADMIN') return jsonError('ADMIN luon dung full quyen, khong can custom override.', 400)
    }

    const duplicate = await findDuplicateEmail(auth.service, auth.workspaceId, email)
    if (duplicate) return jsonError('Tên đăng nhập đã tồn tại.', 409)

    if (departmentId) {
      const departmentOk = await entityExists(auth.service, 'departments', auth.workspaceId, departmentId)
      if (!departmentOk) return jsonError('Phòng ban không tồn tại.', 400)
    }

    if (managerId) {
      const managerOk = await entityExists(auth.service, 'people', auth.workspaceId, managerId)
      if (!managerOk) return jsonError('Người quản lý không tồn tại.', 400)
    }

    const usernameRes = await auth.service
      .from('profiles')
      .select('id')
      .eq('workspace_id', auth.workspaceId)
      .eq('username', username)
      .maybeSingle()
    if (usernameRes.error) throw usernameRes.error
    if (usernameRes.data) return jsonError('Tên đăng nhập đã tồn tại.', 409)

    const authRes = await auth.service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: fullName },
    })
    if (authRes.error) return jsonError(adminAuthErrorMessage(authRes.error), 400)
    const authUserId = authRes.data.user?.id
    if (!authUserId) return jsonError('Không tạo được Auth user staging.', 500)

    const profileRes = await auth.service
      .from('profiles')
      .insert({
        workspace_id: auth.workspaceId,
        auth_user_id: authUserId,
        display_name: fullName,
        username,
        status,
      })
      .select('id')
      .single()
    if (profileRes.error) throw profileRes.error

    const personRes = await auth.service
      .from('people')
      .insert({
        workspace_id: auth.workspaceId,
        profile_id: profileRes.data.id,
        department_id: departmentId,
        manager_id: managerId,
        full_name: fullName,
        email,
        status,
      })
      .select('id')
      .single()
    if (personRes.error) throw personRes.error

    const membershipRes = await auth.service.from('workspace_memberships').insert({
      workspace_id: auth.workspaceId,
      profile_id: profileRes.data.id,
      role_id: role.id,
      is_active: isActiveAccountStatus(status),
    })
    if (membershipRes.error) throw membershipRes.error

    if (useCustomPermissions) {
      await saveUserPermissionOverrides(auth.service, auth.workspaceId, profileRes.data.id, body.permissions)
    }

    const data = await loadUserManagementData(auth.service, auth.workspaceId)
    return NextResponse.json({
      ok: true,
      user: data.users.find((user) => user.profileId === profileRes.data.id) ?? null,
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
  return 'Có lỗi xảy ra khi quản lý tài khoản.'
}
