import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export const PRODUCTION_SUPABASE_REF = 'tgmnkqcxucxpnhhsggug'
export const LOCAL_QA_GUARD_MESSAGE =
  'LOCAL_QA_GUARD: localhost dang tro production DB, chan moi ghi du lieu ke ca QA.'

const QA_PREFIXES = ['CLAUDE_QA_', 'CODEX_QA_', 'TEST_'] as const
const LOCAL_PROD_QA_WRITE_OVERRIDE = 'YES_I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION'

export function getConfiguredSupabaseRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const match = url.match(/^https:\/\/([^.]+)\.supabase\.co/i)
  return match?.[1] ?? ''
}

export function isLocalProductionDatabaseRequest(request: Request) {
  if (getConfiguredSupabaseRef() !== PRODUCTION_SUPABASE_REF) return false
  return getRequestHosts(request).some(isLocalHost)
}

export function isLocalProductionWriteOverrideEnabled() {
  return process.env.ALLOW_LOCAL_PROD_QA_WRITES === LOCAL_PROD_QA_WRITE_OVERRIDE
}

export function qaPrefixFound(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || value === undefined) return false

  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase()
    return QA_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  }

  if (Array.isArray(value)) return value.some((entry) => qaPrefixFound(entry, depth + 1))

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((entry) => qaPrefixFound(entry, depth + 1))
  }

  return false
}

export function localQaGuardResponse(detail?: string) {
  return NextResponse.json(
    {
      error: detail ? `${LOCAL_QA_GUARD_MESSAGE} ${detail}` : LOCAL_QA_GUARD_MESSAGE,
    },
    { status: 403 },
  )
}

export function ensureLocalQaWriteAllowed(request: Request, payload: unknown, detail?: string) {
  void payload
  if (!isLocalProductionDatabaseRequest(request)) return null
  if (isLocalProductionWriteOverrideEnabled()) return null
  return localQaGuardResponse(detail)
}

export async function guardExistingEntityWrite({
  request,
  client,
  table,
  id,
  workspaceId,
  fields,
  detail,
}: {
  request: Request
  client: SupabaseClient
  table: string
  id: string | null | undefined
  workspaceId: string
  fields: readonly string[]
  detail?: string
}) {
  void client
  void table
  void workspaceId
  void fields
  if (!isLocalProductionDatabaseRequest(request)) return null
  if (isLocalProductionWriteOverrideEnabled()) return null
  if (!id) return localQaGuardResponse(detail)
  return localQaGuardResponse(detail)
}

function getRequestHosts(request: Request) {
  const hosts = new Set<string>()
  const directHost = request.headers.get('host')
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (directHost) hosts.add(stripPort(directHost))
  if (forwardedHost) hosts.add(stripPort(forwardedHost))

  try {
    hosts.add(new URL(request.url).hostname)
  } catch {
    // Some test Request objects may not carry a parseable URL.
  }

  return Array.from(hosts)
}

function stripPort(host: string) {
  const clean = host.trim().toLowerCase()
  if (clean.startsWith('[')) return clean.replace(/^\[|\].*$/g, '')
  return clean.split(':')[0] ?? clean
}

function isLocalHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}
