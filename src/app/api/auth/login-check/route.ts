import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const PRODUCTION_REF = 'tgmnkqcxucxpnhhsggug'
const USERNAME_DOMAIN = 'vyvystore.vn'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const username = normalizeLoginInput(body.username)
  const internalEmail = toInternalEmail(username)
  const env = process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? 'unknown'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const ref = getSupabaseRef(supabaseUrl)
  const detailAllowed = env !== 'production' && ref !== PRODUCTION_REF

  const base = {
    env,
    ref,
    detailAllowed,
    normalizedUsername: username.includes('@') ? username.split('@')[0] : username,
    internalEmailDomain: USERNAME_DOMAIN,
  }

  if (!detailAllowed) {
    return NextResponse.json({
      ...base,
      accountExists: null,
      profileExists: null,
      roleCodes: [],
      status: null,
    })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey || !username) {
    return NextResponse.json({
      ...base,
      accountExists: null,
      profileExists: null,
      roleCodes: [],
      status: null,
    })
  }

  try {
    const sb = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })
    const users = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (users.error) throw users.error

    const authUser = users.data.users.find((user) => user.email?.toLowerCase() === internalEmail)
    if (!authUser) {
      return NextResponse.json({
        ...base,
        accountExists: false,
        profileExists: false,
        roleCodes: [],
        status: null,
      })
    }

    const profileRes = await sb
      .from('profiles')
      .select('id,status')
      .eq('auth_user_id', authUser.id)
      .maybeSingle()
    if (profileRes.error) throw profileRes.error

    const profile = profileRes.data
    let roleCodes: string[] = []
    let activeMembership = false

    if (profile) {
      const membershipsRes = await sb
        .from('workspace_memberships')
        .select('role_id,is_active')
        .eq('profile_id', profile.id)
      if (membershipsRes.error) throw membershipsRes.error

      const memberships = membershipsRes.data ?? []
      activeMembership = memberships.some((membership) => membership.is_active)
      const roleIds = Array.from(new Set(memberships.map((membership) => membership.role_id).filter(Boolean)))

      if (roleIds.length > 0) {
        const rolesRes = await sb.from('roles').select('id,code').in('id', roleIds)
        if (rolesRes.error) throw rolesRes.error
        roleCodes = (rolesRes.data ?? []).map((role) => role.code).filter(Boolean)
      }
    }

    return NextResponse.json({
      ...base,
      accountExists: true,
      profileExists: Boolean(profile),
      status: profile?.status ?? null,
      activeMembership,
      roleCodes,
    })
  } catch {
    return NextResponse.json({
      ...base,
      accountExists: null,
      profileExists: null,
      roleCodes: [],
      status: null,
    })
  }
}

function normalizeLoginInput(input: unknown) {
  return String(input ?? '').trim().normalize('NFKC').toLowerCase()
}

function toInternalEmail(input: string) {
  return input.includes('@') ? input : `${input}@${USERNAME_DOMAIN}`
}

function getSupabaseRef(url: string) {
  const match = url.match(/^https:\/\/([^.]+)\.supabase\.co/)
  return match?.[1] ?? 'unknown'
}
