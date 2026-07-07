import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

type ServiceClient = SupabaseClient

interface PersonApproverRow {
  id: string
  department_id: string | null
  default_approver_id?: string | null
}

export async function getDefaultApproverForUser(
  service: ServiceClient,
  workspaceId: string,
  input: { personId?: string | null; profileId?: string | null },
) {
  const person = await loadPersonForApprover(service, workspaceId, input)
  if (!person) return findWorkspaceFallbackApprover(service, workspaceId)
  if (person.default_approver_id && await personExists(service, workspaceId, person.default_approver_id)) {
    return person.default_approver_id
  }

  const departmentHead = person.department_id
    ? await findDepartmentHead(service, workspaceId, person.department_id)
    : null
  if (departmentHead) return departmentHead

  return findWorkspaceFallbackApprover(service, workspaceId)
}

async function loadPersonForApprover(
  service: ServiceClient,
  workspaceId: string,
  input: { personId?: string | null; profileId?: string | null },
) {
  const base = service
    .from('people')
    .select('id,department_id,default_approver_id')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)

  const res = input.personId
    ? await base.eq('id', input.personId).maybeSingle()
    : input.profileId
      ? await base.eq('profile_id', input.profileId).maybeSingle()
      : null

  if (!res) return null
  if (!res.error) return res.data as PersonApproverRow | null
  if (!isMissingDefaultApproverColumn(res.error)) throw res.error

  const fallback = service
    .from('people')
    .select('id,department_id')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)

  const fallbackRes = input.personId
    ? await fallback.eq('id', input.personId).maybeSingle()
    : input.profileId
      ? await fallback.eq('profile_id', input.profileId).maybeSingle()
      : null

  if (!fallbackRes) return null
  if (fallbackRes.error) throw fallbackRes.error
  return fallbackRes.data as PersonApproverRow | null
}

async function findDepartmentHead(service: ServiceClient, workspaceId: string, departmentId: string) {
  const res = await service
    .from('departments')
    .select('head_person_id')
    .eq('workspace_id', workspaceId)
    .eq('id', departmentId)
    .is('deleted_at', null)
    .maybeSingle()
  if (res.error) throw res.error
  const headPersonId = typeof res.data?.head_person_id === 'string' ? res.data.head_person_id : null
  return headPersonId && await personExists(service, workspaceId, headPersonId) ? headPersonId : null
}

async function findWorkspaceFallbackApprover(service: ServiceClient, workspaceId: string) {
  const rolesRes = await service
    .from('roles')
    .select('id,code')
    .in('code', ['COO', 'ADMIN'])
  if (rolesRes.error) throw rolesRes.error
  const roleIds = (rolesRes.data ?? [])
    .sort((a, b) => rolePriority(a.code) - rolePriority(b.code))
    .map((role) => role.id)

  if (!roleIds.length) return null

  const membershipsRes = await service
    .from('workspace_memberships')
    .select('profile_id,role_id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .in('role_id', roleIds)
  if (membershipsRes.error) throw membershipsRes.error

  const sortedProfiles = (membershipsRes.data ?? [])
    .sort((a, b) => roleIds.indexOf(a.role_id) - roleIds.indexOf(b.role_id))
    .map((membership) => membership.profile_id)

  for (const profileId of sortedProfiles) {
    const personRes = await service
      .from('people')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle()
    if (personRes.error) throw personRes.error
    if (personRes.data?.id) return personRes.data.id as string
  }

  return null
}

async function personExists(service: ServiceClient, workspaceId: string, personId: string) {
  const res = await service
    .from('people')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('id', personId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle()
  if (res.error) throw res.error
  return Boolean(res.data?.id)
}

function rolePriority(code: string | null) {
  if (code === 'COO') return 0
  if (code === 'ADMIN') return 1
  return 2
}

function isMissingDefaultApproverColumn(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : ''
  return message.includes('default_approver_id')
}
