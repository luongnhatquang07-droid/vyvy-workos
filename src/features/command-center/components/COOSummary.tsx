'use client'
import React from 'react'
import type { COOSummary as COOSummaryData } from '../types'

interface COOSummaryProps {
  summary: COOSummaryData
}

export function COOSummary({ summary }: COOSummaryProps) {
  return (
    <section aria-label="Tóm tắt COO Assistant">
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: 'var(--space-3) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          background: 'linear-gradient(to right, rgba(218,223,33,0.06), transparent)',
        }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, flex: 1 }}>
            Tóm tắt COO Assistant
          </h2>
          <span style={{
            fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic',
            background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)',
            padding: '2px 8px', border: '1px solid var(--color-border)',
          }}>
            Tóm tắt theo quy tắc hệ thống
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 0,
        }}>
          {/* Việc khẩn */}
          <SummarySection
            icon={
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L9.5 6H14L10.5 8.5L12 12.5L8 10L4 12.5L5.5 8.5L2 6H6.5L8 2Z" fill="#B84040"/>
              </svg>
            }
            title="3 Việc khẩn nhất"
            accentColor="var(--color-danger)"
            noBorder
          >
            {summary.urgentItems.map((item, i) => (
              <SummaryItem key={i} index={i + 1} text={item} />
            ))}
          </SummarySection>

          {/* Rủi ro */}
          <SummarySection
            icon={
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L15 14H1L8 1Z" stroke="#C47B2B" strokeWidth="1.5" fill="none"/>
                <line x1="8" y1="6" x2="8" y2="10" stroke="#C47B2B" strokeWidth="1.5"/>
                <circle cx="8" cy="12" r="0.75" fill="#C47B2B"/>
              </svg>
            }
            title="2 Rủi ro chính"
            accentColor="var(--color-warning)"
          >
            {summary.risks.map((item, i) => (
              <SummaryItem key={i} index={i + 1} text={item} variant="warning" />
            ))}
          </SummarySection>

          {/* Theo dõi */}
          <SummarySection
            icon={
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="#6B8A99" strokeWidth="1.5"/>
                <path d="M8 5V8L10 10" stroke="#6B8A99" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            }
            title="2 Mục cần theo dõi"
            accentColor="#6B8A99"
          >
            {summary.watchItems.map((item, i) => (
              <SummaryItem key={i} index={i + 1} text={item} variant="info" />
            ))}
          </SummarySection>

          {/* Đề xuất */}
          <SummarySection
            icon={
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2C5.24 2 3 4.24 3 7c0 1.77.9 3.33 2.27 4.25V13h5.46v-1.75C12.1 10.33 13 8.77 13 7c0-2.76-2.24-5-5-5Z" stroke="var(--color-lime)" strokeWidth="1.5" fill="none"/>
                <line x1="5.5" y1="14" x2="10.5" y2="14" stroke="var(--color-lime)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            }
            title={`${summary.proposedActions.length} Đề xuất hành động`}
            accentColor="var(--color-lime)"
          >
            {summary.proposedActions.map((item, i) => (
              <SummaryItem key={i} index={i + 1} text={item} variant="lime" />
            ))}
          </SummarySection>
        </div>
      </div>
    </section>
  )
}

function SummarySection({ icon, title, accentColor, children, noBorder }: {
  icon: React.ReactNode
  title: string
  accentColor: string
  children: React.ReactNode
  noBorder?: boolean
}) {
  return (
    <div style={{
      padding: 'var(--space-4) var(--space-5)',
      borderRight: noBorder ? 'none' : '1px solid var(--color-border)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-3)' }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  )
}

function SummaryItem({ index, text, variant }: {
  index: number; text: string; variant?: 'warning' | 'info' | 'lime'
}) {
  const dotColor = variant === 'warning' ? '#C47B2B'
    : variant === 'info' ? '#6B8A99'
    : variant === 'lime' ? '#9DA80A'
    : '#B84040'

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        background: dotColor + '18', color: dotColor,
        fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 1,
      }}>{index}</span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text)', lineHeight: 1.5 }}>{text}</span>
    </div>
  )
}
