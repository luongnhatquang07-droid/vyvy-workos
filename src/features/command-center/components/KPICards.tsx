'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import type { FilterView, KPIData } from '../types'

function useCountUp(target: number, duration = 750): { count: number; bump: boolean } {
  const [count, setCount] = React.useState(0)
  const [bump, setBump] = React.useState(false)
  React.useEffect(() => {
    let frame: number
    let bumpTimer: number
    if (target === 0) {
      frame = requestAnimationFrame(() => setCount(0))
      return () => cancelAnimationFrame(frame)
    }
    const start = performance.now()
    function update(now: number) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(target * eased))
      if (progress < 1) {
        frame = requestAnimationFrame(update)
      } else {
        setBump(true)
        bumpTimer = window.setTimeout(() => setBump(false), 420)
      }
    }
    frame = requestAnimationFrame(update)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(bumpTimer)
    }
  }, [target, duration])
  return { count, bump }
}

interface KPICardProps {
  value: number
  label: string
  unit: string
  description: string
  icon: string          // tabler icon class
  iconBg: string
  iconColor: string
  valueSize?: number
  valueWeight?: number
  warningSurface?: boolean
  accent?: 'danger' | 'warning' | 'default' | 'lime'
  delta?: number        // +/- change indicator
  route?: string
  filter?: FilterView
  focusChase?: boolean
  flashing?: boolean    // periodic "live" pulse driven by the parent
  active?: boolean
  onSelectFilter?: (filter: FilterView) => void
  onFocusChase?: () => void
}

function KPICard({
  value,
  label,
  unit,
  description,
  icon,
  iconBg,
  iconColor,
  valueSize = 28,
  valueWeight = 600,
  warningSurface = false,
  accent = 'default',
  delta,
  route,
  filter,
  focusChase,
  flashing,
  active,
  onSelectFilter,
  onFocusChase,
}: KPICardProps) {
  const router = useRouter()
  const [hovered, setHovered] = React.useState(false)
  const { count: displayCount, bump } = useCountUp(value)
  const isInteractive = Boolean(route || filter || focusChase)

  const numColor = {
    danger:  'var(--color-danger)',
    warning: 'var(--color-warning)',
    lime:    'var(--color-lime-d)',
    default: 'var(--color-text)',
  }[accent]

  return (
    <button
      onClick={() => {
        if (filter) {
          onSelectFilter?.(filter)
          return
        }
        if (focusChase) {
          onFocusChase?.()
          return
        }
        if (route) router.push(route)
      }}
      aria-label={`Xem ${label}`}
      title={description}
      className={bump || flashing ? 'vyvy-flash' : undefined}
      data-vyvy-tilt="true"
      data-vyvy-radar="true"
      data-vyvy-alert={accent === 'danger' && value > 0 ? 'true' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:
          warningSurface
            ? 'var(--color-warning-bg)'
            : accent === 'danger'
            ? 'linear-gradient(180deg, rgba(184,64,64,0.04), rgba(255,255,255,0) 42%), var(--color-surface)'
            : accent === 'lime'
              ? 'linear-gradient(180deg, rgba(218,223,33,0.04), rgba(255,255,255,0) 42%), var(--color-surface)'
              : accent === 'warning'
                ? 'linear-gradient(180deg, rgba(196,123,43,0.04), rgba(255,255,255,0) 42%), var(--color-surface)'
                : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 48%), var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        padding: '15px',
        cursor: isInteractive ? 'pointer' : 'default',
        textAlign: 'left',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        willChange: 'transform',
        borderColor:
          warningSurface
            ? 'rgba(196,123,43,0.55)'
            : active
            ? 'var(--color-lime)'
            : hovered
            ? accent === 'danger'
              ? 'rgba(184,64,64,0.55)'
              : accent === 'lime'
                ? 'rgba(218,223,33,0.52)'
                : 'var(--color-border-strong)'
            : 'var(--color-border)',
        transition: 'transform var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out)',
        boxShadow:
          active
            ? '0 0 0 1px rgba(218,223,33,0.16), 0 18px 34px rgba(0,0,0,0.22)'
            : hovered
            ? accent === 'danger'
              ? '0 0 0 1px rgba(184,64,64,0.14), 0 18px 34px rgba(0,0,0,0.2)'
              : accent === 'lime'
                ? '0 0 0 1px rgba(218,223,33,0.12), 0 18px 34px rgba(0,0,0,0.2)'
                : '0 0 0 1px rgba(255,255,255,0.04), 0 18px 34px rgba(0,0,0,0.2)'
            : accent === 'danger'
              ? '0 0 0 1px rgba(184,64,64,0.1), 0 10px 24px rgba(0,0,0,0.14)'
              : accent === 'lime'
                ? '0 0 0 1px rgba(218,223,33,0.08), 0 10px 24px rgba(0,0,0,0.14)'
                : '0 8px 20px rgba(0,0,0,0.12)',
      }}
    >
      {/* Icon chip */}
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: iconBg, color: iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 11,
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 16 }} aria-hidden="true" />
      </div>

      {/* Number */}
      <div style={{
        fontSize: valueSize, fontWeight: valueWeight, lineHeight: 1,
        color: value > 0 ? numColor : 'var(--color-text-muted)',
        fontFamily: 'var(--font-display)',
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
      }}>
        <span className={bump ? 'vyvy-num-bump' : undefined}>{displayCount}</span>
        <span style={unitStyle}>{unit}</span>
      </div>

      {/* Label */}
      <div style={{ fontSize: 12, color: warningSurface ? 'var(--color-warning)' : 'var(--color-text)', marginTop: 5, fontWeight: 700 }}>
        {label}
      </div>

      <div style={warningSurface ? { ...descriptionStyle, color: 'var(--color-warning)' } : descriptionStyle}>{description}</div>

      {/* Delta */}
      {delta !== undefined && delta !== 0 && (
        <span style={{
          position: 'absolute', top: 14, right: 14,
          fontSize: 11, fontWeight: 600,
          color: delta > 0 ? 'var(--color-danger)' : 'var(--color-success)',
        }}>
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </button>
  )
}

interface KPICardsProps {
  kpi: KPIData
  activeFilter: FilterView
  onSelectFilter: (filter: FilterView) => void
  onFocusChase: () => void
}

export function KPICards({ kpi, activeFilter, onSelectFilter, onFocusChase }: KPICardsProps) {
  const [liveIndex, setLiveIndex] = React.useState(-1)

  // Nhịp cập nhật trực tiếp: cứ vài giây lóe ngẫu nhiên 1 thẻ KPI cho cảm giác "sống".
  React.useEffect(() => {
    let resetTimer: number
    const interval = window.setInterval(() => {
      const next = Math.floor(Math.random() * 7)
      setLiveIndex(next)
      resetTimer = window.setTimeout(() => setLiveIndex(-1), 900)
    }, 5200)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(resetTimer)
    }
  }, [])

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
      gap: 14,
    }}>
      <KPICard
        value={kpi.unassignedTasks}
        label="Chưa giao việc"
        unit="việc"
        description="Cần lên lịch giao việc"
        icon="ti-alert-triangle"
        iconBg="var(--color-warning-bg)"
        iconColor="var(--color-warning)"
        valueSize={24}
        valueWeight={500}
        warningSurface
        accent="warning"
        route="/projects?filter=unassigned"
        flashing={liveIndex === 0}
      />
      <KPICard
        value={kpi.meetingsToday}
        label="Họp hôm nay"
        unit="cuộc"
        description="Cuộc họp có lịch đúng ngày hôm nay."
        icon="ti-calendar-event"
        iconBg="var(--color-waiting-bg)"
        iconColor="var(--color-waiting)"
        accent="default"
        route="/meetings"
        flashing={liveIndex === 1}
      />
      <KPICard
        value={kpi.unimportedDrafts}
        label="Đầu việc chưa nhập"
        unit="việc"
        description="Draft từ họp hoặc import chưa được đưa vào hệ thống."
        icon="ti-file-import"
        iconBg="var(--color-waiting-bg)"
        iconColor="#6B8A99"
        accent="warning"
        route="/task-inbox"
        flashing={liveIndex === 2}
      />
      <KPICard
        value={kpi.pendingDeliverable}
        label="Người cần nhắc"
        unit="người"
        description="Người có ít nhất 1 file/báo cáo cần follow-up."
        icon="ti-file-alert"
        iconBg="var(--color-warning-bg)"
        iconColor="var(--color-warning)"
        accent="warning"
        focusChase
        onFocusChase={onFocusChase}
        flashing={liveIndex === 3}
      />
      <KPICard
        value={kpi.overdueItems}
        label="Quá hạn công việc"
        unit="việc"
        description="Việc có deadline trước hôm nay và chưa hoàn thành."
        icon="ti-alarm"
        iconBg="var(--color-danger-bg)"
        iconColor="var(--color-danger)"
        accent="danger"
        filter="overdue"
        active={activeFilter === 'overdue'}
        onSelectFilter={onSelectFilter}
        flashing={liveIndex === 4}
      />
      <KPICard
        value={kpi.pendingApprovals}
        label="Chờ duyệt"
        unit="yêu cầu"
        description="Yêu cầu phê duyệt đang chờ xử lý hoặc đã trễ hạn."
        icon="ti-stamp"
        iconBg="var(--color-success-bg)"
        iconColor="var(--color-success)"
        accent="default"
        filter="pending_approval"
        active={activeFilter === 'pending_approval'}
        onSelectFilter={onSelectFilter}
        flashing={liveIndex === 5}
      />
      <KPICard
        value={kpi.ceoItems}
        label="Cần báo CEO"
        unit="mục"
        description="Vấn đề cần đưa vào báo cáo hoặc xin quyết định CEO."
        icon="ti-crown"
        iconBg="rgba(218,223,33,0.14)"
        iconColor="var(--color-lime-d)"
        accent="lime"
        filter="ceo_report"
        active={activeFilter === 'ceo_report'}
        onSelectFilter={onSelectFilter}
        flashing={liveIndex === 6}
      />
    </div>
  )
}

const unitStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  fontFamily: 'var(--font-sans)',
}

const descriptionStyle: React.CSSProperties = {
  marginTop: 5,
  fontSize: 10,
  lineHeight: 1.35,
  color: 'var(--color-text-muted)',
}
