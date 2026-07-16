import type { CSSProperties } from 'react'

export function statusChipStyle(bg: string, color: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  }
}

export const sectionTitle: CSSProperties = {
  marginTop: 4,
  fontSize: 17,
  fontWeight: 700,
  color: 'var(--txt)',
}

export const mutedMetaStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--txt-3)',
  lineHeight: 1.45,
}

export const progressBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 42,
  height: 28,
  borderRadius: 999,
  padding: '0 10px',
  background: 'rgba(218,223,33,.13)',
  color: 'var(--txt)',
  fontSize: 12,
  fontWeight: 700,
}

export const progressTrack: CSSProperties = {
  width: '100%',
  height: 8,
  borderRadius: 999,
  background: 'var(--surface-3)',
  overflow: 'hidden',
}

export const progressFill: CSSProperties = {
  display: 'block',
  height: '100%',
  background: 'linear-gradient(90deg, #d7df21 0%, #7fa357 100%)',
  borderRadius: 999,
}

export const emptyInline: CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px dashed var(--line)',
  color: 'var(--txt-3)',
  fontSize: 12.5,
}

export const subtaskInlineItem: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

export const ghostBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 12px',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--txt-2)',
  fontSize: 12.5,
  fontWeight: 700,
}
