const LINK_TITLE_PREFIX = 'Link title:'

export function normalizeExternalSubmissionUrl(raw: string) {
  const value = raw.trim()
  if (!value) throw new Error('URL không được để trống.')

  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
    throw new Error('Chỉ hỗ trợ link http:// hoặc https://.')
  }

  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Chỉ hỗ trợ link http:// hoặc https://.')
    }
    return url.toString()
  } catch {
    throw new Error('URL không hợp lệ. Vui lòng kiểm tra lại link.')
  }
}

export function buildExternalLinkChangeNote(linkTitle?: string | null, changeNote?: string | null) {
  const title = linkTitle?.trim()
  const note = changeNote?.trim()
  return [title ? `${LINK_TITLE_PREFIX} ${title}` : null, note || null].filter(Boolean).join('\n\n') || null
}

export function parseExternalLinkChangeNote(changeNote?: string | null) {
  const raw = changeNote?.trim() ?? ''
  if (!raw.startsWith(LINK_TITLE_PREFIX)) {
    return { title: null as string | null, note: changeNote ?? null }
  }

  const [firstLine, ...rest] = raw.split(/\r?\n/)
  const title = firstLine.replace(LINK_TITLE_PREFIX, '').trim() || null
  const note = rest.join('\n').trim() || null
  return { title, note }
}

export function externalLinkDisplayName(externalUrl?: string | null, changeNote?: string | null, fallback = 'Link ngoài') {
  return parseExternalLinkChangeNote(changeNote).title || externalUrl || fallback
}
