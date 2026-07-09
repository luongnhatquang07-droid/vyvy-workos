const GENERIC_MIME_TYPES = new Set(['application/octet-stream', 'binary/octet-stream'])

const EXTENSION_MIME_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  zip: 'application/zip',
}

export function getFileExtension(nameOrPath: string) {
  const fileName = nameOrPath.split(/[\\/]/).pop() ?? nameOrPath
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

export function isHtmlFileName(nameOrPath: string) {
  const extension = getFileExtension(nameOrPath)
  return extension === 'html' || extension === 'htm'
}

export function inferFileContentType(nameOrPath: string, explicitType?: string | null) {
  const extension = getFileExtension(nameOrPath)
  const mapped = EXTENSION_MIME_TYPES[extension]
  const normalizedExplicit = explicitType?.trim()

  if (isHtmlFileName(nameOrPath)) return EXTENSION_MIME_TYPES.html
  if (!normalizedExplicit || GENERIC_MIME_TYPES.has(normalizedExplicit.toLowerCase())) {
    return mapped ?? 'application/octet-stream'
  }

  return normalizedExplicit
}

export function contentDispositionInline(fileName: string) {
  const safeAsciiName = fileName.replace(/["\r\n\\]/g, '_')
  return `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
