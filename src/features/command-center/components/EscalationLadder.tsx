'use client'
import React from 'react'
import type { ChaseItem, Person, EscalationStep } from '../types'
import { PanelShell, EmptyRow } from './FollowUpPanel'

interface EscalationLadderProps {
  items: ChaseItem[]
  people: Person[]
}

const STEPS: EscalationStep[] = ['REMIND_1','REMIND_2','CALL','MANAGER','CEO']
const STEP_LABEL: Record<EscalationStep, string> = {
  REMIND_1: 'Nhắc 1', REMIND_2: 'Nhắc 2', CALL: 'Gọi', MANAGER: 'Trưởng phòng', CEO: 'CEO',
}

export function EscalationLadder({ items, people }: EscalationLadderProps) {
  const byPerson = Object.fromEntries(people.map(p => [p.id, p]))
  // Show the person most in need of escalation
  const topItem = items.find(i => i.suggestEscalate) ?? items[0]

  return (
    <PanelShell title="Nhắc nhiều cấp" accentColor="var(--color-waiting)" count={items.filter(i => i.suggestEscalate).length}>
      {!topItem ? (
        <EmptyRow text="Không có ai cần escalate." />
      ) : (
        <div style={{ padding: 'var(--space-4)' }}>
          {/* Person label */}
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
            Đang xem: <b style={{ color: 'var(--color-text)' }}>{byPerson[topItem.personId]?.name}</b>
          </div>

          {/* Ladder */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 }}>
            {STEPS.map((step, i) => {
              const stepIdx = STEPS.indexOf(topItem.escalationStep)
              const isDone = i < stepIdx
              const isNow = step === topItem.escalationStep
              return (
                <React.Fragment key={step}>
                  <span style={{
                    fontSize: 10, padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                    fontWeight: isNow ? 700 : 400,
                    border: isNow ? '1px solid var(--color-waiting)' : '1px solid var(--color-border)',
                    background: isNow ? 'var(--color-waiting-bg)' : 'var(--color-surface-2)',
                    color: isDone ? 'var(--color-success)' : isNow ? 'var(--color-waiting)' : 'var(--color-text-muted)',
                    whiteSpace: 'nowrap' as const,
                  }}>{STEP_LABEL[step]}</span>
                  {i < STEPS.length - 1 && (
                    <span style={{
                      width: 12, height: 2, flexShrink: 0,
                      background: isDone ? 'var(--color-success)' : isNow ? 'var(--color-waiting)' : 'var(--color-border)',
                      margin: '0 2px',
                    }} />
                  )}
                </React.Fragment>
              )
            })}
          </div>

          {/* Suggestion */}
          <div style={{
            marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)', lineHeight: 1.5,
          }}>
            {topItem.suggestEscalate
              ? <>Đã qua {topItem.remindCount} lần nhắc không phản hồi → đề xuất bước tiếp theo: <b style={{ color: 'var(--color-waiting)' }}>báo trưởng phòng</b>.</>
              : <>Lần nhắc thứ {topItem.remindCount}. Tiếp tục theo dõi phản hồi.</>
            }
          </div>

          {/* Other people summary */}
          {items.length > 1 && (
            <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
              {items.filter(i => i.personId !== topItem.personId).map(item => (
                <div key={item.personId} style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>
                  {byPerson[item.personId]?.name} — Nhắc {item.remindCount} lần · {STEP_LABEL[item.escalationStep]}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PanelShell>
  )
}
