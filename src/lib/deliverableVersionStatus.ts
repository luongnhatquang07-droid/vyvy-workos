export type VersionReviewStatus =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION_REQUESTED'
  | 'CANCELLED'
  | 'UPLOADED_BY_MISTAKE'
  | 'SUPERSEDED'

export const INVALID_VERSION_STATUSES: VersionReviewStatus[] = [
  'UPLOADED_BY_MISTAKE',
  'SUPERSEDED',
  'CANCELLED',
]

export const REVISION_VERSION_STATUSES: VersionReviewStatus[] = [
  'REVISION_REQUESTED',
  'REJECTED',
]

export const PENDING_VERSION_STATUSES: VersionReviewStatus[] = [
  'NOT_REQUESTED',
  'PENDING',
  'PENDING_REVIEW',
]

export function isVersionInvalid(status: VersionReviewStatus | null | undefined) {
  return Boolean(status && INVALID_VERSION_STATUSES.includes(status))
}

export function isVersionRevision(status: VersionReviewStatus | null | undefined) {
  return Boolean(status && REVISION_VERSION_STATUSES.includes(status))
}

export function isVersionPending(status: VersionReviewStatus | null | undefined) {
  return Boolean(status && PENDING_VERSION_STATUSES.includes(status))
}

export function isVersionValidForCompletion(
  status: VersionReviewStatus | null | undefined,
  requiresApproval: boolean,
) {
  if (!status || isVersionInvalid(status) || isVersionRevision(status)) return false
  if (requiresApproval) return status === 'APPROVED'
  return status === 'APPROVED' || isVersionPending(status)
}

export function versionReviewLabel(status: VersionReviewStatus | null | undefined) {
  if (status === 'APPROVED') return 'Đã duyệt'
  if (status === 'REVISION_REQUESTED') return 'Yêu cầu sửa'
  if (status === 'REJECTED') return 'Từ chối'
  if (status === 'UPLOADED_BY_MISTAKE') return 'Up nhầm'
  if (status === 'SUPERSEDED') return 'Đã thay thế'
  if (status === 'CANCELLED') return 'Đã hủy'
  if (status === 'NOT_REQUESTED') return 'Chưa yêu cầu duyệt'
  return 'Chờ duyệt'
}

export function versionReviewTone(status: VersionReviewStatus | null | undefined) {
  if (status === 'APPROVED') return { color: 'var(--color-success)', bg: 'var(--color-success-bg)' }
  if (status === 'UPLOADED_BY_MISTAKE' || status === 'SUPERSEDED' || status === 'CANCELLED') {
    return { color: 'var(--color-text-muted)', bg: 'rgba(255,255,255,0.06)' }
  }
  if (isVersionRevision(status)) return { color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' }
  return { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' }
}

export function normalizeVersionReviewStatus(status: string | null | undefined): VersionReviewStatus {
  if (status === 'PENDING_APPROVAL' || status === 'SUBMITTED' || status === 'WAITING_APPROVAL') return 'PENDING_REVIEW'
  if (status === 'REVISION_REQUIRED') return 'REVISION_REQUESTED'
  if (status === 'PENDING_REVIEW') return 'PENDING_REVIEW'
  if (status === 'APPROVED') return 'APPROVED'
  if (status === 'REJECTED') return 'REJECTED'
  if (status === 'REVISION_REQUESTED') return 'REVISION_REQUESTED'
  if (status === 'CANCELLED') return 'CANCELLED'
  if (status === 'UPLOADED_BY_MISTAKE') return 'UPLOADED_BY_MISTAKE'
  if (status === 'SUPERSEDED') return 'SUPERSEDED'
  if (status === 'NOT_REQUESTED') return 'NOT_REQUESTED'
  return 'PENDING'
}
