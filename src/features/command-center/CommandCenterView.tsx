'use client'
import React from 'react'
import type { DrawerState } from './types'
import { useCommandCenterData } from './hooks/useCommandCenterData'
import { CommandCenterSkeleton } from './components/CommandCenterSkeleton'
import { FilterChips } from './components/FilterChips'
import { KPICards } from './components/KPICards'
import { SummaryBanner } from './components/SummaryBanner'
import { PriorityList } from './components/PriorityList'
import { ChasePanel } from './components/ChasePanel'
import { CommitmentsPanel } from './components/CommitmentsPanel'
import { DeliverableGate } from './components/DeliverableGate'
import { EscalationLadder } from './components/EscalationLadder'
import { CEOPanel } from './components/CEOPanel'
import { ActivityLog } from './components/ActivityLog'
import { COOSummary } from './components/COOSummary'
import { CommandCenterDrawer } from './components/CommandCenterDrawer'

export function CommandCenterView() {
  const { data, loadState, filter, setFilter, retry, filteredPriorityItems } = useCommandCenterData()
  const [drawer, setDrawer] = React.useState<DrawerState>({ open: false, type: null, id: null })

  function closeDrawer() {
    setDrawer({ open: false, type: null, id: null })
  }

  if (loadState === 'loading') {
    return (
      <div style={{ padding: 'var(--space-6)' }}>
        <CCHeader loading />
        <div style={{ marginTop: 'var(--space-6)' }}><CommandCenterSkeleton /></div>
      </div>
    )
  }

  if (loadState === 'error' || !data) {
    return (
      <div style={{ padding: 'var(--space-6)' }}>
        <CCHeader />
        <div style={{
          marginTop: 'var(--space-6)', background: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)',
          padding: 'var(--space-10)', textAlign: 'center',
        }}>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>Không tải được dữ liệu</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-5)' }}>Đã xảy ra lỗi. Vui lòng thử lại.</div>
          <button onClick={retry} style={{ padding: 'var(--space-2) var(--space-5)', background: 'var(--color-charcoal)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}>Thử lại</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Zone A */}
        <CCHeader totalItems={data.priorityItems.length} />

        {/* Zone C — KPI */}
        <KPICards kpi={data.kpi} onFilter={setFilter} />

        {/* Zone B — Summary Banner */}
        <SummaryBanner summary={data.summaryBanner} />

        {/* Filter */}
        <FilterChips value={filter} onChange={setFilter} />

        {/* Zone D — 2 cols */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 'var(--space-4)' }}>
          {/* Left: ①③④ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <PriorityList items={filteredPriorityItems} onOpenDrawer={setDrawer} />
            <CommitmentsPanel meetings={data.meetings} />
            <DeliverableGate checks={data.deliverableChecks} />
          </div>

          {/* Right: ②⑤⑥ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <ChasePanel items={data.chaseItems} people={data.people} />
            <EscalationLadder items={data.chaseItems} people={data.people} />
            <CEOPanel requests={data.ceoRequests} projects={data.projects} onOpenDrawer={setDrawer} />
          </div>
        </div>

        {/* Zone D ⑦ — full width */}
        <ActivityLog entries={data.activityLog} />

        {/* Zone E — COO Summary */}
        <COOSummary summary={data.cooSummary} />

        {/* Watermark */}
        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic', opacity: 0.6, paddingBottom: 'var(--space-4)' }}>
          DEMO DATA — PHASE 2 ONLY · Dữ liệu mẫu, không kết nối Supabase
        </div>
      </div>

      <CommandCenterDrawer
        state={drawer}
        data={{
          reminders: data.reminders, meetings: data.meetings,
          approvals: data.approvals, ceoRequests: data.ceoRequests,
          tasks: data.tasks, deliverables: data.deliverables,
          people: data.people, projects: data.projects,
        }}
        onClose={closeDrawer}
      />
    </>
  )
}

function CCHeader({ loading, totalItems }: { loading?: boolean; totalItems?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 500, margin: 0, lineHeight: 1.2, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
          Chào buổi sáng, Quang 👋
        </h1>
        <div style={{ marginTop: 4, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          Thứ Năm, 25 tháng 6, 2026
          {!loading && typeof totalItems === 'number' && ` · ${totalItems} việc cần bạn xử lý hôm nay`}
        </div>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
        color: 'var(--color-warning)', background: 'var(--color-warning-bg)',
        border: '1px solid rgba(196,123,43,0.25)', padding: '3px 9px',
        borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 4,
      }}>● DEMO DATA</span>
    </div>
  )
}
