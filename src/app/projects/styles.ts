import type React from 'react'
import type { CSSProperties } from 'react'
import type { BadgeTone } from './types'

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

export const inlineMetaStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  wordBreak: 'normal',
  fontSize: 11.5,
  color: 'var(--txt-3)',
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

export function filterChipStyle(active: boolean, tone: BadgeTone = 'neutral'): React.CSSProperties {
  const warning = tone === 'warning'
  const danger = tone === 'danger'
  const success = tone === 'success'
  const toneBorder = danger ? 'rgba(184,64,64,.42)' : warning ? 'rgba(184,139,62,.38)' : success ? 'rgba(96,145,92,.38)' : 'var(--line)'
  const toneBackground = danger ? 'rgba(184,64,64,.11)' : warning ? 'rgba(184,139,62,.10)' : success ? 'rgba(96,145,92,.10)' : 'var(--surface-2)'
  const toneColor = danger ? 'var(--color-danger)' : warning ? 'var(--color-warning)' : success ? 'var(--color-success)' : 'var(--txt-3)'
  return {
    minHeight: 30,
    padding: '0 12px',
    borderRadius: 999,
    border: `1px solid ${active ? 'rgba(218,223,33,.5)' : toneBorder}`,
    background: active ? 'rgba(218,223,33,.10)' : toneBackground,
    color: active ? 'var(--txt)' : toneColor,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flex: '0 0 auto',
  }
}

export const stepEvidenceFilesStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
  paddingTop: 8,
  borderTop: '1px dashed var(--line)',
}

export const stepEvidenceFilesHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  color: 'var(--txt-2)',
  fontSize: 11,
  fontWeight: 800,
}

export const stepEvidenceToggleStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'var(--color-lime)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 11,
  fontWeight: 850,
}

export const warningBanner: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  background: 'var(--color-warning-bg)',
  color: 'var(--color-warning)',
  fontSize: 12.5,
  fontWeight: 600,
}

export const toneColor = (tone: 'neutral' | 'good' | 'warning' | 'danger') =>
  tone === 'good'
    ? 'var(--color-success)'
    : tone === 'warning'
      ? 'var(--color-warning)'
      : tone === 'danger'
        ? 'var(--color-danger)'
        : 'var(--txt-3)'

export const textareaStyle: React.CSSProperties = {
  minHeight: 110,
  width: '100%',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  padding: '12px 14px',
  resize: 'vertical',
}

export const fileRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  color: 'var(--txt)',
  textDecoration: 'none',
}

export function fileRowButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    ...fileRowStyle,
    width: '100%',
    cursor: disabled ? 'wait' : 'pointer',
    font: 'inherit',
    textAlign: 'left',
  }
}

export const evidenceFileRowShellStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 36px',
  gap: 6,
  alignItems: 'start',
}

export const evidenceFileMenuWrapStyle: React.CSSProperties = {
  position: 'relative',
}

export const evidenceFileMenuButtonStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  cursor: 'pointer',
  fontSize: 17,
}

export const evidenceFileMenuPanelStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 30,
  top: 40,
  right: 0,
  minWidth: 185,
  padding: 6,
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  boxShadow: '0 14px 34px rgba(0,0,0,.24)',
}

export function evidenceFileMenuItemStyle(disabled = false): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 9px',
    border: 0,
    borderRadius: 7,
    background: 'transparent',
    color: disabled ? 'var(--muted)' : 'var(--txt)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    font: 'inherit',
    fontSize: 12,
    fontWeight: 750,
    textAlign: 'left',
  }
}

export function evidenceFileDeleteItemStyle(disabled = false): React.CSSProperties {
  return {
    ...evidenceFileMenuItemStyle(disabled),
    color: disabled ? 'var(--muted)' : 'var(--danger)',
    borderTop: '1px solid var(--line)',
    borderRadius: 0,
    marginTop: 4,
    paddingTop: 10,
  }
}

export const evidenceFileNoticeStyle: React.CSSProperties = {
  marginBottom: 8,
  padding: '8px 10px',
  borderRadius: 9,
  border: '1px solid rgba(52,148,92,.28)',
  background: 'rgba(52,148,92,.1)',
  color: 'var(--success)',
  fontSize: 12,
  fontWeight: 750,
}

export const evidenceFileStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

export const evidenceFileNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: 'var(--txt)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const evidenceFileMetaStyle: React.CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  lineHeight: 1.45,
  color: 'var(--muted)',
}

export const evidenceFileErrorStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  lineHeight: 1.35,
  color: 'var(--danger)',
}

export const evidenceFileActionStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  flexShrink: 0,
  fontSize: 11,
  fontWeight: 850,
  color: 'var(--color-lime)',
}

export const evidenceFileUnavailableStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 11,
  fontWeight: 750,
  color: 'var(--muted)',
}

export const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 13px',
  borderRadius: 12,
  border: '1px solid rgba(218,223,33,.4)',
  background: 'linear-gradient(180deg, #eef25c 0%, #d7df21 58%, #c5cb1b 100%)',
  color: 'var(--color-lime-ink)',
  fontSize: 12.5,
  fontWeight: 700,
}
