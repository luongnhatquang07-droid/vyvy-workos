import { NextResponse } from 'next/server'
import {
  getConfiguredSupabaseRef,
  isProductionSupabaseRef,
  isUserManagementEnabled,
  requireUserManagementAccess,
} from '@/lib/admin/userManagement'
import { diagnoseAuthAdminListUsers } from '@/lib/admin/userManagementData'

export const runtime = 'nodejs'

export async function GET() {
  const auth = await requireUserManagementAccess()
  if (!auth.ok) return auth.response

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const supabaseRef = getConfiguredSupabaseRef()
  const jwtRefMatches = getServiceRoleJwtRefMatch(serviceRoleKey, supabaseRef)
  const authAdmin = await diagnoseAuthAdminListUsers(auth.service)

  return NextResponse.json({
    appEnv: process.env.APP_ENV ?? null,
    nextPublicAppEnv: process.env.NEXT_PUBLIC_APP_ENV ?? null,
    userManagementEnabled: isUserManagementEnabled(),
    supabaseUrlRef: supabaseRef,
    isProductionRef: isProductionSupabaseRef(),
    serviceRolePresent: serviceRoleKey.length > 0,
    serviceRoleLengthOk: serviceRoleKey.length > 40,
    serviceRoleJwtRefMatchesProduction: jwtRefMatches,
    apiRuntime: 'nodejs',
    authAdminListUsersOk: authAdmin.supabaseJsListUsersOk || authAdmin.directFetchListUsersOk,
    supabaseJsListUsersOk: authAdmin.supabaseJsListUsersOk,
    supabaseJsError: authAdmin.supabaseJsError,
    directFetchListUsersOk: authAdmin.directFetchListUsersOk,
    directFetchStatus: authAdmin.directFetchStatus,
    directFetchError: authAdmin.directFetchError,
    returnedUserCount: authAdmin.returnedUserCount,
  })
}

function getServiceRoleJwtRefMatch(key: string, expectedRef: string | null) {
  if (!key || !expectedRef) return null
  const parts = key.split('.')
  if (parts.length < 2) return null

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { ref?: unknown }
    return typeof payload.ref === 'string' ? payload.ref === expectedRef : null
  } catch {
    return null
  }
}
