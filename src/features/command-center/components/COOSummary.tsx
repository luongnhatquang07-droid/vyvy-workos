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
        background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)', overflow: 'hidden',
      }}>
        <div style={{
          padding: 'var(--space-3) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0 }}>
            Tóm tắt COO Assistant
          </h2>
          <span style={{
            fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic',
            background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)',
            padding: '2px 8px', border: '1px solid var(--color-border)',
          }}>Tóm tắt theo quy tắc hệ thống</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
          <COOBox title="Việc khẩn" borderColor="var(--color-lime)" items={summary.urgentItems} />
          <COOBox title="Rủi ro" borderColor="var(--color-danger)" items={summary.risks} />
          <COOBox title="Theo dõi" borderColor="var(--color-warning)" items={summary.watchItems} />
          <COOBox title="Đề xuất" borderColor="var(--color-waiting)" items={summary.proposedActions} />
        </div>
      </div>
    </section>
  )
}

function COOBox({ title, borderColor, items }: { title: string; borderColor: string; items: string[] }) {
  return (
    <div style={{
      background: 'var(--color-surface-2)',
      borderLeft: `3px solid ${borderColor}`,
      borderRight: '1px solid var(--color-border)',
      padding: 'var(--space-4)',
    }}>
      <h4 style={{
        fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600,
        margin: '0 0 var(--space-2) 0', display: 'flex', alignItems: 'center', gap: 4,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        fontFamily: 'var(--font-sans)',
      }}>{title}</h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item, i) => (
          <li key={i} style={{
            fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
            margin: '5px 0', paddingLeft: 12, position: 'relative', lineHeight: 1.5,
          }}>
            <span style={{
              position: 'absolute', left: 0, top: 7,
              width: 4, height: 4, borderRadius: '50%',
              background: 'var(--color-text-muted)',
              display: 'block',
            }} />
            {item}
          </li>
        ))}
        {items.length === 0 && (
          <li style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Không có mục nào.</li>
        )}
      </ul>
    </div>
  )
}
