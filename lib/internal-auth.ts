export const INTERNAL_LOGIN_DOMAIN = 'vyvy-workos.local'

export function normalizeInternalLoginId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/[._-]{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
}

export function loginIdentifierToAuthEmail(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ''
  if (trimmed.includes('@')) return trimmed
  const loginId = normalizeInternalLoginId(trimmed)
  return loginId ? `${loginId}@${INTERNAL_LOGIN_DOMAIN}` : ''
}

export function displayLoginIdentifier(value?: string | null): string {
  if (!value) return '—'
  const lower = value.toLowerCase()
  const suffix = `@${INTERNAL_LOGIN_DOMAIN}`
  return lower.endsWith(suffix) ? value.slice(0, -suffix.length) : value
}
