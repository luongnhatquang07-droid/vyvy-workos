'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import type { ChaseItem, Person } from '../types'
import { PanelShell, EmptyRow } from './FollowUpPanel'

interface ChasePanelProps {
  items: ChaseItem[]
  people: Person[]
}

const AVATAR_COLORS = ['#B84040','#6B8A99','#C47B2B','#4A8C5C','#8C8278']
const RESPONSE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  NO_RESPONSE:      { label: 'Chưa phản hồi', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
  PROMISED:         { label: 'Đã hứa', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  WAITING_RESPONSE: { label: 'Waiting', color: 'var(--color-waiting)', bg: 'var(--color-waiting-bg)' },
  SENT:             { label: 'Đã nhắc', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
}

export function ChasePanel({ items, people }: ChasePanelProps) {
  const router = useRouter()
  const byPerson = Object.fromEntries(people.map(p => [p.id, p]))

  return (
    <PanelShell title="Cần dí hôm nay" count={items.length} accentColor="var(--color-danger)">
      {items.length === 0 ? (
        <EmptyRow text="Không có ai cần dí hôm nay." />
      ) : (
        <>
          <div style={{ padding: '4px 8px' }}>
            {items.map((item, i) => {
              const person = byPerson[item.personId]
              const rs = RESPONSE_LABEL[item.response] ?? RESPONSE_LABEL.NO_RESPONSE
              const avatarBg = AVATAR_COLORS[i % AVATAR_COLORS.length]
              return (
                <div key={item.personId} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: '8px 9px', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                }}
                data-vyvy-row="true"
                data-vyvy-alert={item.remindCount >= 2 ? 'true' : undefined}
                onClick={() => router.push('/follow-ups')}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  {/* Avatar */}
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: avatarBg, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>{person?.avatarInitials}</div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)' }}>
                      {person?.name} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>· {item.owedItem}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                      {item.remindCount >= 2 && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                          Đã nhắc {item.remindCount} lần
                        </span>
                      )}
                      {item.suggestEscalate && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-waiting-bg)', color: 'var(--color-waiting)' }}>
                          ↗ Nên escalate
                        </span>
                      )}
                      {!item.suggestEscalate && item.remindCount > 0 && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: rs.bg, color: rs.color, fontWeight: 600 }}>
                          {rs.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Urgency dot */}
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: item.remindCount >= 2 ? 'var(--color-danger)' : 'var(--color-warning)',
                  }} />
                </div>
              )
            })}
          </div>
          <div style={{ padding: '6px 12px 12px' }}>
            <button
              onClick={() => router.push('/follow-ups')}
              data-vyvy-radar="true"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)',
                background: 'var(--color-lime)', color: 'var(--color-charcoal)',
                fontSize: 'var(--text-sm)', fontWeight: 600, border: 'none', cursor: 'pointer',
              }}
            >
              ✉ Soạn nhắc hàng loạt
            </button>
          </div>
        </>
      )}
    </PanelShell>
  )
}
