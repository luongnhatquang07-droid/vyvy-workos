'use client'
import React from 'react'
import type { DrawerState } from './types'
import { useCommandCenterData } from './hooks/useCommandCenterData'
import { CommandCenterSkeleton } from './components/CommandCenterSkeleton'
import { FilterChips } from './components/FilterChips'
import { KPICards } from './components/KPICards'
import { PriorityList } from './components/PriorityList'
import { FollowUpPanel } from './components/FollowUpPanel'
import { MeetingsPanel } from './components/MeetingsPanel'
import { ApprovalsPanel } from './components/ApprovalsPanel'
import { CEOPanel } from './components/CEOPanel'
import { COOSummary } from './components/COOSummary'
import { CommandCenterDrawer } from './components/CommandCenterDrawer'

export function CommandCenterView() {
  const { data, loadState, filter, setFilter, retry, filteredPriorityItems } = useCommandCenterData()
  const [drawer, setDrawer] = React.useState<DrawerState>({ open: false, type: null, id: null })

  function closeDrawer() {
    setDrawer({ open: false, type: null, id: null })
  }

  // ---- Loading ----
  if (loadState === 'loading') {
    return (
      <div style={{ padding: 'var(--space-6)' }}>
        <CommandCenterHeader />
        <div style={{ marginTop: 'var(--space-6)' }}>
          <CommandCenterSkeleton />
        </div>
      </div>
    )
  }

  // ---- Error ----
  if (loadState === 'error' || !data) {
    return (
      <div style={{ padding: 'var(--space-6)' }}>
        <CommandCenterHeader />
        <div style={{
          marginTop: 'var(--space-6)',
          background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)', padding: 'var(--space-10)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)', marginBottom: 'var(--space-2)' }}>
            Không tải được dữ liệu
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-5)' }}>
            Đã xảy ra lỗi khi tải Command Center. Vui lòng thử lại.
          </div>
          <button
            onClick={retry}
            style={{
              padding: 'var(--space-2) var(--space-5)',
              background: 'var(--color-charcoal)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
            }}
          >Thử lại</button>
        </div>
      </div>
    )
  }

  // ---- Success ----
  return (
    <>
      <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Zone A — Header */}
        <CommandCenterHeader />

        {/* Zone B — KPI Cards */}
        <section aria-label="KPI tổng quan">
          <KPICards kpi={data.kpi} onFilter={setFilter} />
        </section>

        {/* Filter chips */}
        <FilterChips value={filter} onChange={setFilter} />

        {/* Zone C — Priority list */}
        <PriorityList items={filteredPriorityItems} onOpenDrawer={setDrawer} />

        {/* Zone D — 4 panels */}
        <section aria-label="Các khu theo dõi chuyên biệt">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 'var(--space-4)',
          }}>
            <FollowUpPanel
              reminders={data.reminders}
              people={data.people}
              onOpenDrawer={setDrawer}
            />
            <MeetingsPanel
              meetings={data.meetings}
              people={data.people}
              onOpenDrawer={setDrawer}
            />
            <ApprovalsPanel
              approvals={data.approvals}
              people={data.people}
              onOpenDrawer={setDrawer}
            />
            <CEOPanel
              requests={data.ceoRequests}
              projects={data.projects}
              onOpenDrawer={setDrawer}
            />
          </div>
        </section>

        {/* Zone E — COO Summary */}
        <COOSummary summary={data.cooSummary} />

        {/* Demo watermark */}
        <div style={{
          textAlign: 'center',
          fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic',
          opacity: 0.6, paddingBottom: 'var(--space-4)',
        }}>
          DEMO DATA — PHASE 2 ONLY · Dữ liệu mẫu, không kết nối Supabase
        </div>
      </div>

      {/* Drawer */}
      <CommandCenterDrawer
        state={drawer}
        data={{
          reminders: data.reminders,
          meetings: data.meetings,
          approvals: data.approvals,
          ceoRequests: data.ceoRequests,
          tasks: data.tasks,
          deliverables: data.deliverables,
          people: data.people,
          projects: data.projects,
        }}
        onClose={closeDrawer}
      />
    </>
  )
}

function CommandCenterHeader() {
  const now = new Date()
  const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
      <div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)',
          fontWeight: 700, margin: 0, lineHeight: 1.2,
          color: 'var(--color-text)',
        }}>
          Trung tâm điều hành
        </h1>
        <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          Tổng quan toàn bộ hoạt động vận hành · {dateStr}
        </div>
      </div>
      <div style={{
        background: 'rgba(218,223,33,0.12)',
        border: '1px solid rgba(218,223,33,0.35)',
        borderRadius: 'var(--radius-md)',
        padding: '4px 10px',
        fontSize: 10, fontWeight: 700, color: '#8B8E0A',
        whiteSpace: 'nowrap', flexShrink: 0, marginTop: 4,
      }}>
        DEMO DATA — PHASE 2
      </div>
    </div>
  )
}
