'use client'

import React from 'react'
import { ActivityLog } from './components/ActivityLog'
import { CEOPanel } from './components/CEOPanel'
import { COOSummary } from './components/COOSummary'
import { ChasePanel } from './components/ChasePanel'
import { CommandCenterDrawer } from './components/CommandCenterDrawer'
import { CommandCenterSkeleton } from './components/CommandCenterSkeleton'
import { CommitmentsPanel } from './components/CommitmentsPanel'
import { DeliverableGate } from './components/DeliverableGate'
import { EscalationLadder } from './components/EscalationLadder'
import { FilterChips } from './components/FilterChips'
import { KPICards } from './components/KPICards'
import { PriorityList } from './components/PriorityList'
import { SummaryBanner } from './components/SummaryBanner'
import type { CommandCenterData, DrawerState, FilterView } from './types'
import { filterPriorityItems } from './utils'

interface CommandCenterViewProps {
  data: CommandCenterData
  role?: string
  todayLabel?: string
  workspaceId?: string
  dataIssue?: {
    title: string
    description: string
  }
}

export function CommandCenterView({ data, todayLabel, workspaceId, dataIssue }: CommandCenterViewProps) {
  const [filter, setFilter] = React.useState<FilterView>('all')
  const [drawer, setDrawer] = React.useState<DrawerState>({ open: false, type: null, id: null })
  const commandData = data

  const filteredPriorityItems = React.useMemo(
    () => filterPriorityItems(commandData.priorityItems, filter),
    [commandData.priorityItems, filter],
  )

  function closeDrawer() {
    setDrawer({ open: false, type: null, id: null })
  }

  return (
    <>
      <div style={pageStyle}>
        <CCHeader totalItems={commandData.priorityItems.length} todayLabel={todayLabel} hasDataIssue={Boolean(dataIssue)} />
        {dataIssue ? <DataIssueBanner title={dataIssue.title} description={dataIssue.description} /> : null}
        <SummaryBanner summary={commandData.summaryBanner} />
        <KPICards kpi={commandData.kpi} />
        <FilterChips value={filter} onChange={setFilter} />

        <div style={mainGridStyle}>
          <div style={columnStyle}>
            <PriorityList items={filteredPriorityItems} onOpenDrawer={setDrawer} />
            <CommitmentsPanel meetings={commandData.meetings} />
            <DeliverableGate checks={commandData.deliverableChecks} />
          </div>

          <div style={columnStyle}>
            <ChasePanel items={commandData.chaseItems} people={commandData.people} />
            <EscalationLadder items={commandData.chaseItems} people={commandData.people} />
            <CEOPanel requests={commandData.ceoRequests} projects={commandData.projects} onOpenDrawer={setDrawer} />
          </div>
        </div>

        <ActivityLog entries={commandData.activityLog} />
        <COOSummary summary={commandData.cooSummary} />

      </div>

      <CommandCenterDrawer
        state={drawer}
        workspaceId={workspaceId}
        data={{
          reminders: commandData.reminders,
          meetings: commandData.meetings,
          approvals: commandData.approvals,
          ceoRequests: commandData.ceoRequests,
          tasks: commandData.tasks,
          deliverables: commandData.deliverables,
          people: commandData.people,
          projects: commandData.projects,
        }}
        onClose={closeDrawer}
      />
    </>
  )
}

export function CommandCenterViewLoading() {
  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <CCHeader loading />
      <div style={{ marginTop: 'var(--space-6)' }}>
        <CommandCenterSkeleton />
      </div>
    </div>
  )
}

function CCHeader({
  loading,
  totalItems,
  todayLabel,
  hasDataIssue,
}: {
  loading?: boolean
  totalItems?: number
  todayLabel?: string
  hasDataIssue?: boolean
}) {
  return (
    <div style={headerStyle}>
      <div>
        <h1 style={headlineStyle} data-vyvy-type="true">Trung tâm điều hành</h1>
        <div style={subheadStyle}>
          {todayLabel}
          {!loading && typeof totalItems === 'number' ? ` · ${totalItems} việc cần bạn xử lý hôm nay` : ''}
        </div>
      </div>
      {hasDataIssue ? <span style={issueBadgeStyle}>Cần kiểm tra dữ liệu</span> : null}
    </div>
  )
}

function DataIssueBanner({ title, description }: { title: string; description: string }) {
  return (
    <div style={issueBannerStyle} role="status" data-vyvy-card="true" data-vyvy-glowborder="true">
      <div style={issueIconStyle}>!</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={issueTitleStyle}>{title}</div>
        <div style={issueDescStyle}>{description}</div>
      </div>
      <button type="button" onClick={() => window.location.reload()} style={retryButtonStyle} data-vyvy-radar="true">
        Tải lại
      </button>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
  position: 'relative',
  isolation: 'isolate',
}

const mainGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.6fr 1fr',
  gap: 'var(--space-4)',
}

const columnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  position: 'relative',
  zIndex: 1,
}

const headlineStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 30,
  fontWeight: 500,
  margin: 0,
  lineHeight: 1.2,
  color: 'var(--color-text)',
  letterSpacing: '-0.01em',
  textShadow: '0 6px 28px rgba(255,255,255,0.06)',
}

const subheadStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-muted)',
}

const issueBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.05em',
  color: 'var(--color-warning)',
  background: 'var(--color-warning-bg)',
  border: '1px solid rgba(196,123,43,0.25)',
  padding: '3px 9px',
  borderRadius: 'var(--radius-full)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  marginTop: 4,
}

const issueBannerStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  background: 'var(--color-warning-bg)',
  border: '1px solid rgba(196,123,43,0.35)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-3) var(--space-4)',
  boxShadow: 'var(--shadow-sm)',
}

const issueIconStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 'var(--radius-full)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-warning)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 800,
  flexShrink: 0,
}

const issueTitleStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 700,
  color: 'var(--color-text)',
}

const issueDescStyle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
  lineHeight: 1.5,
}

const retryButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(196,123,43,0.38)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  padding: '7px 12px',
  fontSize: 'var(--text-xs)',
  fontWeight: 700,
  cursor: 'pointer',
  flexShrink: 0,
}
