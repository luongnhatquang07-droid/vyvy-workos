'use client'
import React from 'react'
import type { DeliverableCheck } from '../types'

interface DeliverableGateProps {
  checks: DeliverableCheck[]
}

export function DeliverableGate({ checks }: DeliverableGateProps) {
  const check = checks[0] // Show first check

  return (
    <div style={{
      background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-border)', overflow: 'hidden',
    }}>
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 19, height: 19, borderRadius: 6,
          background: 'var(--color-surface-2)', color: 'var(--color-text-muted)',
          fontSize: 11, fontWeight: 700, marginRight: 4,
        }}>4</span>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, flex: 1 }}>
          Hồ sơ bàn giao — đủ chưa?
        </h3>
        <span style={{
          fontSize: 10, color: 'var(--color-text-muted)', background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '1px 7px',
        }}>&ldquo;Hoàn thành&rdquo; ≠ &ldquo;đủ hồ sơ&rdquo;</span>
      </div>

      {!check ? (
        <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontStyle: 'italic' }}>
          Không có hồ sơ nào cần kiểm tra.
        </div>
      ) : (
        <div style={{ padding: 'var(--space-4) var(--space-4) var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)' }}>
              {check.taskTitle} — {check.ownerName}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 'var(--radius-sm)',
              background: check.gateOpen ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
              color: check.gateOpen ? 'var(--color-success)' : 'var(--color-danger)',
            }}>
              {check.gateOpen ? 'Đủ hồ sơ' : `Thiếu ${check.items.filter(item => !item.present && item.required).length} mục`}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {check.items.map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 8px', borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                fontSize: 11,
                color: item.present ? 'var(--color-success)' : item.required ? 'var(--color-danger)' : 'var(--color-text-muted)',
              }}>
                <span style={{ fontWeight: 700 }}>{item.present ? '✓' : '✗'}</span>
                {item.label}
              </div>
            ))}
          </div>

          {!check.gateOpen && (
            <div style={{
              marginTop: 'var(--space-3)', padding: 'var(--space-3)',
              background: 'var(--color-warning-bg)', borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(196,123,43,0.2)',
              display: 'flex', gap: 8, alignItems: 'flex-start',
              fontSize: 'var(--text-xs)', color: 'var(--color-warning)',
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>🔒</span>
              <span>
                Còn thiếu <b>{check.items.filter(item => !item.present && item.required).map(item => item.label).join(' & ')}</b> → completion gate vẫn khoá, task chưa thể đánh dấu hoàn thành.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
