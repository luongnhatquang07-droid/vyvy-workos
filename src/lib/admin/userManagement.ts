import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  canManageUsers,
  getCurrentUserProfile,
  type RbacClient,
  type RbacUserContext,
} from '@/lib/rbac/permissions'
import { getRoleLabel, isWorkspaceRole } from '@/lib/rbac/roles'

const PRODUCTION_SUPABASE_REF = 'tgmnkqcxucxpnhhsggug'
const PROD_USER_MANAGEMENT_APPROVAL = 'YES_I_APPROVE_USER_ADMIN'

export type AdminUserContext =
  | {
      ok: true
      workspaceId: string
      actor: RbacUserContext
      service: ReturnType<typeof createServiceClient>
      supabaseRef: string | null
    }
  | { ok: false; response: NextResponse }

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function getConfiguredSupabaseRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const match = url.match(/^https:\/\/([^.]+)\.supabase\.co/i)
  return match?.[1] ?? null
}

export function isProductionSupabaseRef() {
  return getConfiguredSupabaseRef() === PRODUCTION_SUPABASE_REF
}

export function isStagingUserManagementEnabled() {
  return (
    process.env.APP_ENV === 'staging' &&
    process.env.NEXT_PUBLIC_APP_ENV === 'staging' &&
    !isProductionSupabaseRef() &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  )
}

export function isProductionUserManagementEnabled() {
  return (
    process.env.APP_ENV === 'production' &&
    isProductionSupabaseRef() &&
    process.env.ENABLE_PROD_USER_MANAGEMENT === PROD_USER_MANAGEMENT_APPROVAL &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  )
}

export function isUserManagementEnabled() {
  return isStagingUserManagementEnabled() || isProductionUserManagementEnabled()
}

export async function getUserManagementAccess() {
  const sb = await createServerClient()
  const actor = await getCurrentUserProfile(sb as unknown as RbacClient)
  const enabled = isUserManagementEnabled()

  return {
    enabled,
    supabaseRef: getConfiguredSupabaseRef(),
    canManageUsers: enabled && canManageUsers(actor),
    role: actor?.role ?? null,
    roleLabel: actor?.role ? roleLabel(actor.role) : null,
    displayName: actor?.displayName ?? null,
    departmentName: actor?.departmentName ?? null,
    status: actor?.status ?? null,
  }
}

export async function requireUserManagementAccess(): Promise<AdminUserContext> {
  const supabaseRef = getConfiguredSupabaseRef()
  const environmentEnabled = isUserManagementEnabled()

  if (!environmentEnabled && isProductionSupabaseRef()) {
    return {
      ok: false,
      response: jsonError('User Management đang bị khóa vì môi trường hiện trỏ production.', 403),
    }
  }

  if (!environmentEnabled) {
    return {
      ok: false,
      response: jsonError('User Management chỉ được bật trên staging hoặc production đã được phê duyệt bằng env server-side.', 403),
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      response: jsonError('Thiếu service role key staging để thao tác tài khoản.', 500),
    }
  }

  const sb = await createServerClient()
  const actor = await getCurrentUserProfile(sb as unknown as RbacClient)
  if (!actor) return { ok: false, response: jsonError('Bạn cần đăng nhập để quản lý tài khoản.', 401) }
  if (!canManageUsers(actor)) {
    return {
      ok: false,
      response: jsonError('Bạn không có quyền truy cập trang này.', 403),
    }
  }

  return {
    ok: true,
    actor,
    workspaceId: actor.workspaceId as string,
    service: createServiceClient(),
    supabaseRef,
  }
}

export function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function cleanNullableId(value: unknown) {
  const text = cleanText(value)
  return text.length > 0 ? text : null
}

export function cleanEmail(value: unknown) {
  return cleanText(value).toLowerCase()
}

export function cleanStatus(value: unknown) {
  const text = cleanText(value).toLowerCase()
  if (text === 'inactive' || text === 'suspended') return text
  return 'active'
}

export function usernameFromEmail(email: string) {
  return email.split('@')[0]?.replace(/[^a-z0-9._-]/gi, '').toLowerCase() || null
}

export function userStatusLabel(status: string | null | undefined) {
  if (status === 'inactive') return 'Tạm khóa'
  if (status === 'suspended') return 'Đình chỉ'
  return 'Đang hoạt động'
}

export function roleLabel(code: string | null | undefined) {
  return isWorkspaceRole(code) ? getRoleLabel(code) : 'Chưa gắn vai trò'
}

export function isActiveAccountStatus(status: string | null | undefined) {
  return status !== 'inactive' && status !== 'suspended'
}
