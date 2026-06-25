'use client'
import React from 'react'
import type { SummaryBannerData } from '../types'

interface SummaryBannerProps {
  summary: SummaryBannerData
}

// Render **bold** markers as <b>
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <b key={i} style={{ color: 'var(--color-text)' }}>{p.slice(2, -2)}</b>
          : <React.Fragment key={i}>{p}</React.Fragment>
      )}
    </>
  )
}

const CHIP_COLORS: Record<string, { color: string; border: string; bg: string }> = {
  default:  { color: 'var(--color-text-muted)', border: 'var(--color-border)', bg: 'transparent' },
  danger:   { color: 'var(--color-danger)', border: 'rgba(184,64,64,0.3)', bg: 'transparent' },
  warning:  { color: 'var(--color-warning)', border: 'rgba(196,123,43,0.3)', bg: 'transparent' },
  waiting:  { color: 'var(--color-waiting)', border: 'rgba(107,138,153,0.3)', bg: 'transparent' },
  lime:     { color: 'var(--color-lime-d)', border: 'rgba(218,223,33,0.4)', bg: 'rgba(218,223,33,0.08)' },
}

export function SummaryBanner({ summary }: SummaryBannerProps) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid rgba(126,131,18,0.35)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-4)',
      display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Lime icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 'var(--radius-md)',
        background: 'var(--color-lime)', color: 'var(--color-charcoal)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>✦</div>

      <div style={{ flex: 1 }}>
        {/* Title + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <b style={{ fontSize: 'var(--text-sm)' }}>Sáng nay của bạn</b>
          <span style={{
            fontSize: 10, color: 'var(--color-text-muted)',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', padding: '1px 7px',
          }}>Tóm tắt theo quy tắc hệ thống · 07:00</span>
        </div>

        {/* Paragraph */}
        <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.75, color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0' }}>
          <RichText text={summary.paragraph} />
        </p>

        {/* Chips */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {summary.chips.map((chip, i) => {
            const col = CHIP_COLORS[chip.colorClass] ?? CHIP_COLORS.default
            return (
              <span key={i} style={{
                fontSize: 12, padding: '5px 11px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${col.border}`,
                color: col.color, background: col.bg,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>{chip.label}</span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
