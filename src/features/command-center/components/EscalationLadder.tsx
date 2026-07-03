'use client'
import React from 'react'
import type { ChaseItem, Person, EscalationStep } from '../types'
import { formatRelativeDate } from '../utils'
import { PanelShell, EmptyRow } from './FollowUpPanel'

interface EscalationLadderProps {
  items: ChaseItem[]
  people: Person[]
}

interface EscalationGroup {
  personId: string
  person?: Person
  items: ChaseItem[]
  leadItem: ChaseItem
  maxRemindCount: number
  hasEscalation: boolean
}

const AVATAR_COLORS = ['#B84040', '#6B8A99', '#C47B2B', '#4A8C5C', '#8C8278']
const STEPS: EscalationStep[] = ['REMIND_1', 'REMIND_2', 'CALL', 'MANAGER', 'CEO']
const STEP_LABEL: Record<EscalationStep, string> = {
  REMIND_1: 'Nhắc 1',
  REMIND_2: 'Nhắc 2',
  CALL: 'Gọi',
  MANAGER: 'Trưởng phòng',
  CEO: 'CEO',
}

export function EscalationLadder({ items, people }: EscalationLadderProps) {
  const [expandedPeople, setExpandedPeople] = React.useState<Set<string>>(() => new Set())
  const byPerson = React.useMemo<Record<string, Person>>(
    () => Object.fromEntries(people.map((person) => [person.id, person])),
    [people],
  )
  const groups = React.useMemo(() => groupEscalationItems(items, byPerson), [byPerson, items])

  function togglePerson(personId: string) {
    setExpandedPeople((current) => {
      const next = new Set(current)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }

  return (
    <PanelShell title="Nhắc nhiều cấp" accentColor="var(--color-waiting)" count={groups.length}>
      {groups.length === 0 ? (
        <EmptyRow text="Không có ai cần escalate." />
      ) : (
        <div style={{ padding: '10px 10px 12px' }}>
          {groups.map((group, index) => {
            const isExpanded = expandedPeople.has(group.personId)
            return (
              <div key={group.personId} style={groupCardStyle} data-vyvy-escalation-group="true">
                <button type="button" style={groupHeaderStyle} onClick={() => togglePerson(group.personId)}>
                  <div style={{ ...avatarStyle, background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}>
                    {group.person?.avatarInitials ?? '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={groupTitleStyle}>
                      <span>{group.person?.name ?? 'Chưa gắn người'}</span>
                      <span style={groupCountStyle}>
                        {group.items.length} việc · nhắc {group.maxRemindCount} lần
                      </span>
                    </div>
                    <div style={metaRowStyle}>
                      <span style={{ ...miniBadgeStyle, background: 'var(--color-waiting-bg)', color: 'var(--color-waiting)' }}>
                        {STEP_LABEL[group.leadItem.escalationStep]}
                      </span>
                      {group.hasEscalation ? (
                        <span style={{ ...miniBadgeStyle, background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                          cần lên cấp
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span style={chevronStyle}>{isExpanded ? '▾' : '▸'}</span>
                </button>

                <div style={ladderWrapStyle}>
                  <EscalationSteps currentStep={group.leadItem.escalationStep} />
                  <div style={suggestionStyle}>
                    {group.hasEscalation ? (
                      <>
                        Đã qua {group.maxRemindCount} lần nhắc chưa phản hồi → đề xuất bước tiếp theo:{' '}
                        <b style={{ color: 'var(--color-waiting)' }}>{nextStepLabel(group.leadItem.escalationStep)}</b>.
                      </>
                    ) : (
                      <>Đang ở lần nhắc thứ {group.maxRemindCount}. Tiếp tục theo dõi phản hồi.</>
                    )}
                  </div>
                </div>

                {isExpanded ? (
                  <div style={itemListStyle}>
                    {group.items.map((item, itemIndex) => (
                      <div key={`${item.personId}-${item.owedItem}-${item.deadline ?? 'no-deadline'}-${itemIndex}`} style={itemRowStyle}>
                        <div style={{ minWidth: 0 }}>
                          <div style={itemTitleStyle}>{item.owedItem}</div>
                          <div style={itemMetaStyle}>
                            {item.deadline ? formatRelativeDate(item.deadline) : 'Chưa có deadline'} · Nhắc {item.remindCount} lần
                          </div>
                        </div>
                        {item.suggestEscalate ? (
                          <span style={{ ...miniBadgeStyle, background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                            escalate
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </PanelShell>
  )
}

function EscalationSteps({ currentStep }: { currentStep: EscalationStep }) {
  const stepIdx = STEPS.indexOf(currentStep)
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 }}>
      {STEPS.map((step, index) => {
        const isDone = index < stepIdx
        const isNow = step === currentStep
        return (
          <React.Fragment key={step}>
            <span
              style={{
                fontSize: 10,
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontWeight: isNow ? 700 : 400,
                border: isNow ? '1px solid var(--color-waiting)' : '1px solid var(--color-border)',
                background: isNow ? 'var(--color-waiting-bg)' : 'var(--color-surface-2)',
                color: isDone ? 'var(--color-success)' : isNow ? 'var(--color-waiting)' : 'var(--color-text-muted)',
                whiteSpace: 'nowrap',
              }}
              data-vyvy-step-now={isNow ? 'true' : undefined}
            >
              {STEP_LABEL[step]}
            </span>
            {index < STEPS.length - 1 ? (
              <span
                style={{
                  width: 12,
                  height: 2,
                  flexShrink: 0,
                  background: isDone ? 'var(--color-success)' : isNow ? 'var(--color-waiting)' : 'var(--color-border)',
                  margin: '0 2px',
                }}
              />
            ) : null}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function groupEscalationItems(items: ChaseItem[], byPerson: Record<string, Person>): EscalationGroup[] {
  const escalationItems = items.filter((item) => item.suggestEscalate || item.remindCount >= 2 || item.escalationStep !== 'REMIND_1')
  const groups = new Map<string, EscalationGroup>()
  escalationItems.forEach((item) => {
    const current = groups.get(item.personId)
    if (!current) {
      groups.set(item.personId, {
        personId: item.personId,
        person: byPerson[item.personId],
        items: [item],
        leadItem: item,
        maxRemindCount: item.remindCount,
        hasEscalation: item.suggestEscalate,
      })
      return
    }

    current.items.push(item)
    current.maxRemindCount = Math.max(current.maxRemindCount, item.remindCount)
    current.hasEscalation = current.hasEscalation || item.suggestEscalate
    current.leadItem = pickLeadItem(current.leadItem, item)
  })

  return Array.from(groups.values()).sort((a, b) => {
    if (b.hasEscalation !== a.hasEscalation) return Number(b.hasEscalation) - Number(a.hasEscalation)
    if (b.maxRemindCount !== a.maxRemindCount) return b.maxRemindCount - a.maxRemindCount
    if (b.items.length !== a.items.length) return b.items.length - a.items.length
    return (a.person?.name ?? '').localeCompare(b.person?.name ?? '', 'vi')
  })
}

function pickLeadItem(current: ChaseItem, next: ChaseItem): ChaseItem {
  if (next.suggestEscalate && !current.suggestEscalate) return next
  if (next.remindCount > current.remindCount) return next
  if (STEPS.indexOf(next.escalationStep) > STEPS.indexOf(current.escalationStep)) return next
  return current
}

function nextStepLabel(step: EscalationStep): string {
  const index = STEPS.indexOf(step)
  const nextStep = STEPS[Math.min(index + 1, STEPS.length - 1)]
  return STEP_LABEL[nextStep]
}

const groupCardStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'rgba(255,255,255,0.02)',
  marginBottom: 8,
  overflow: 'hidden',
}

const groupHeaderStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: '9px 10px',
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
}

const avatarStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: '50%',
  flexShrink: 0,
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 700,
}

const groupTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minWidth: 0,
  fontSize: 'var(--text-sm)',
  fontWeight: 700,
  color: 'var(--color-text)',
}

const groupCountStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 11,
  color: 'var(--color-text-muted)',
  fontWeight: 600,
}

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 3,
  flexWrap: 'wrap',
}

const miniBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: 'var(--radius-sm)',
}

const chevronStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: 13,
  width: 16,
  textAlign: 'center',
}

const ladderWrapStyle: React.CSSProperties = {
  padding: '0 10px 10px 50px',
}

const suggestionStyle: React.CSSProperties = {
  marginTop: 'var(--space-2)',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
  lineHeight: 1.5,
}

const itemListStyle: React.CSSProperties = {
  margin: '0 10px 10px 50px',
  paddingTop: 8,
  borderTop: '1px solid var(--color-border)',
}

const itemRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '6px 0',
}

const itemTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 650,
  color: 'var(--color-text)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const itemMetaStyle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 11,
  color: 'var(--color-text-muted)',
}
