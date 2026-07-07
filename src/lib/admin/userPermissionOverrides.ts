import type { SupabaseClient } from '@supabase/supabase-js'
import { roleLabel } from './userManagement'
import {
  buildDefaultPermissionMatrix,
  normalizePermissionMatrix,
  type PermissionScope,
} from './permissionMatrix'

type ServiceClient = SupabaseClient

interface ProfileRoleResult {
  profileId: string
  roleCode: string | null
  roleLabel: string
}

interface PermissionOverrideRow {
  module: string
  can_view: boolean | null
  can_create: boolean | null
  can_edit: boolean | null
  can_delete: boolean | null
  can_approve: boolean | null
  can_upload: boolean | null
  can_export: boolean | null
  scope: string | null
  is_enabled: boolean | null
}

export async function loadUserPermissionState(
  service: ServiceClient,
  workspaceId: string,
  profileId: string,
) {
  const profile = await loadProfileRole(service, workspaceId, profileId)
  const roleDefault = buildDefaultPermissionMatrix(profile.roleCode)
  const tableReady = await permissionOverrideTableReady(service)

  if (!tableReady.ready) {
    return {
      profileId: profile.profileId,
      roleCode: profile.roleCode,
      roleLabel: profile.roleLabel,
      schemaReady: false,
      mode: 'role_default' as const,
      roleDefault,
      permissions: roleDefault,
      overrideCount: 0,
      message: tableReady.message,
    }
  }

  const overridesRes = await service
    .from('user_permission_overrides')
    .select('module,can_view,can_create,can_edit,can_delete,can_approve,can_upload,can_export,scope,is_enabled')
    .eq('profile_id', profileId)
    .eq('is_enabled', true)

  if (overridesRes.error) {
    return {
      profileId: profile.profileId,
      roleCode: profile.roleCode,
      roleLabel: profile.roleLabel,
      schemaReady: false,
      mode: 'role_default' as const,
      roleDefault,
      permissions: roleDefault,
      overrideCount: 0,
      message: safePermissionError(overridesRes.error),
    }
  }

  const rows = (overridesRes.data ?? []) as PermissionOverrideRow[]
  const custom = rowsToMatrix(rows, profile.roleCode)
  return {
    profileId: profile.profileId,
    roleCode: profile.roleCode,
    roleLabel: profile.roleLabel,
    schemaReady: true,
    mode: rows.length > 0 ? 'custom' as const : 'role_default' as const,
    roleDefault,
    permissions: rows.length > 0 ? custom : roleDefault,
    overrideCount: rows.length,
    message: rows.length > 0 ? 'Tai khoan dang dung quyen tuy chinh.' : 'Tai khoan dang dung quyen mac dinh theo role.',
  }
}

export async function saveUserPermissionOverrides(
  service: ServiceClient,
  workspaceId: string,
  profileId: string,
  permissions: unknown,
) {
  const profile = await loadProfileRole(service, workspaceId, profileId)
  if (!profile.roleCode) {
    throw new Error('Tai khoan chua co membership/vai tro hop le nen khong the luu quyen rieng.')
  }
  if (profile.roleCode === 'ADMIN') {
    throw new Error('ADMIN luon dung full quyen, khong can custom override.')
  }

  const tableReady = await permissionOverrideTableReady(service)
  if (!tableReady.ready) throw new Error(tableReady.message ?? 'Chua san sang luu quyen tuy chinh.')

  const normalized = normalizePermissionMatrix(permissions, profile.roleCode)
  const payload = normalized.map((row) => ({
    profile_id: profileId,
    module: row.module,
    can_view: row.actions.view,
    can_create: row.actions.create,
    can_edit: row.actions.edit,
    can_delete: row.actions.delete,
    can_approve: row.actions.approve,
    can_upload: row.actions.upload,
    can_export: row.actions.export,
    scope: row.scope,
    is_enabled: true,
    updated_at: new Date().toISOString(),
  }))

  const res = await service
    .from('user_permission_overrides')
    .upsert(payload, { onConflict: 'profile_id,module' })

  if (res.error) throw new Error(safePermissionError(res.error))
  return loadUserPermissionState(service, workspaceId, profileId)
}

export async function resetUserPermissionOverrides(
  service: ServiceClient,
  workspaceId: string,
  profileId: string,
) {
  const profile = await loadProfileRole(service, workspaceId, profileId)
  if (!profile.roleCode) {
    throw new Error('Tai khoan chua co membership/vai tro hop le nen khong the reset quyen rieng.')
  }
  const tableReady = await permissionOverrideTableReady(service)
  if (!tableReady.ready) throw new Error(tableReady.message ?? 'Chua san sang reset quyen tuy chinh.')

  const res = await service
    .from('user_permission_overrides')
    .delete()
    .eq('profile_id', profileId)

  if (res.error) throw new Error(safePermissionError(res.error))
  return loadUserPermissionState(service, workspaceId, profileId)
}

export async function permissionOverrideTableReady(service: ServiceClient) {
  const res = await service
    .from('user_permission_overrides')
    .select('id')
    .limit(1)

  if (!res.error) return { ready: true, message: null as string | null }
  return {
    ready: false,
    message: 'Chua co bang user_permission_overrides. Can chay migration additive tren staging truoc khi luu quyen tuy chinh.',
  }
}

async function loadProfileRole(service: ServiceClient, workspaceId: string, profileId: string): Promise<ProfileRoleResult> {
  const profileRes = await service
    .from('profiles')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('id', profileId)
    .maybeSingle()

  if (profileRes.error) throw profileRes.error
  if (!profileRes.data?.id) throw new Error('Khong tim thay tai khoan trong workspace.')

  const membershipRes = await service
    .from('workspace_memberships')
    .select('role_id')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (membershipRes.error) throw membershipRes.error

  let roleCode: string | null = null
  if (membershipRes.data?.role_id) {
    const roleRes = await service
      .from('roles')
      .select('code')
      .eq('id', membershipRes.data.role_id)
      .maybeSingle()
    if (roleRes.error) throw roleRes.error
    roleCode = typeof roleRes.data?.code === 'string' ? roleRes.data.code : null
  }

  return {
    profileId: profileRes.data.id,
    roleCode,
    roleLabel: roleLabel(roleCode),
  }
}

function rowsToMatrix(rows: PermissionOverrideRow[], roleCode: string | null) {
  return normalizePermissionMatrix(
    rows.map((row) => ({
      module: row.module,
      scope: normalizeScope(row.scope),
      actions: {
        view: row.can_view === true,
        create: row.can_create === true,
        edit: row.can_edit === true,
        delete: row.can_delete === true,
        approve: row.can_approve === true,
        upload: row.can_upload === true,
        export: row.can_export === true,
      },
    })),
    roleCode,
  )
}

function normalizeScope(value: string | null): PermissionScope {
  if (value === 'own' || value === 'department' || value === 'assigned_projects' || value === 'company') return value
  return 'none'
}

function safePermissionError(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return 'Khong xu ly duoc quyen tuy chinh.'
}
