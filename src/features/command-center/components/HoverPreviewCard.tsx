'use client'

import React from 'react'
import { createPortal } from 'react-dom'

interface HoverPreviewCardProps {
  anchorElement?: HTMLElement | null
  title: string
  projectName?: string
  ownerName?: string
  deadlineLabel?: string
  statusLabel?: string
  progressLabel?: string
  evidenceLabel?: string
  timingLabel?: string
  description?: string
}

export function HoverPreviewCard({
  anchorElement,
  title,
  projectName,
  ownerName,
  deadlineLabel,
  statusLabel,
  progressLabel,
  evidenceLabel,
  timingLabel,
  description,
}: HoverPreviewCardProps) {
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null)

  React.useLayoutEffect(() => {
    if (!anchorElement) return
    const anchor = anchorElement

    function updatePosition() {
      setPosition(getAnchorPosition(anchor))
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorElement])

  const card = (
    <div
      style={anchorElement && position ? { ...previewStyle, ...portalPositionStyle(position) } : previewStyle}
      role="tooltip"
    >
      <div style={previewHeaderStyle}>
        <strong style={previewTitleStyle}>{title}</strong>
        {statusLabel ? <span style={statusPillStyle}>{statusLabel}</span> : null}
      </div>

      <div style={previewGridStyle}>
        {projectName ? <PreviewLine label="Dự án" value={projectName} /> : null}
        {ownerName ? <PreviewLine label="Phụ trách" value={ownerName} /> : null}
        {deadlineLabel ? <PreviewLine label="Deadline" value={deadlineLabel} /> : null}
        {progressLabel ? <PreviewLine label="Tiến độ" value={progressLabel} /> : null}
      </div>

      {(evidenceLabel || timingLabel) ? (
        <div style={signalRowStyle}>
          {timingLabel ? <span style={signalPillStyle}>{timingLabel}</span> : null}
          {evidenceLabel ? <span style={signalPillStyle}>{evidenceLabel}</span> : null}
        </div>
      ) : null}

      {description ? <p style={descriptionStyle}>{description}</p> : null}
    </div>
  )

  if (anchorElement) {
    if (typeof document === 'undefined') return null
    return createPortal(
      React.cloneElement(card, {
        style: { ...previewStyle, ...portalPositionStyle(position ?? getAnchorPosition(anchorElement)) },
      }),
      document.body,
    )
  }

  return card
}

function getAnchorPosition(anchor: HTMLElement): { top: number; left: number } {
  const rect = anchor.getBoundingClientRect()
  const width = 340
  const estimatedHeight = 220
  const margin = 16
  const gap = 10
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
  const topBelow = rect.bottom + gap
  const top = topBelow + estimatedHeight + margin > window.innerHeight
    ? Math.max(margin, rect.top - estimatedHeight - gap)
    : topBelow
  return { top, left }
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={lineStyle}>
      <span style={lineLabelStyle}>{label}</span>
      <span style={lineValueStyle}>{value}</span>
    </div>
  )
}

const previewStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 8,
  zIndex: 40,
  width: 340,
  maxWidth: 'min(340px, calc(100vw - 32px))',
  padding: 14,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'linear-gradient(180deg, rgba(23,27,34,.98), rgba(13,16,21,.98))',
  boxShadow: '0 24px 60px rgba(0,0,0,.38)',
  color: 'var(--color-text)',
  pointerEvents: 'none',
}

function portalPositionStyle(position: { top: number; left: number }): React.CSSProperties {
  return {
    position: 'fixed',
    top: position.top,
    left: position.left,
    right: 'auto',
    zIndex: 9999,
  }
}

const previewHeaderStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  marginBottom: 10,
}

const previewTitleStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.35,
  color: 'var(--color-text)',
}

const statusPillStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid rgba(218,223,33,.35)',
  background: 'rgba(218,223,33,.10)',
  color: 'var(--color-lime)',
  fontSize: 10,
  fontWeight: 800,
}

const previewGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 7,
}

const lineStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '74px 1fr',
  gap: 8,
  alignItems: 'start',
}

const lineLabelStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: 11,
  fontWeight: 700,
}

const lineValueStyle: React.CSSProperties = {
  color: 'var(--color-text)',
  fontSize: 12,
  lineHeight: 1.35,
}

const signalRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 10,
}

const signalPillStyle: React.CSSProperties = {
  padding: '3px 7px',
  borderRadius: 999,
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.10)',
  color: 'var(--color-text-soft)',
  fontSize: 11,
  fontWeight: 700,
}

const descriptionStyle: React.CSSProperties = {
  margin: '10px 0 0',
  color: 'var(--color-text-muted)',
  fontSize: 12,
  lineHeight: 1.45,
}
