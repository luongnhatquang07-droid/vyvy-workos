'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import type { KPIData } from '../types'

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
  icon: string          // tabler icon class
  iconBg: string
  iconColor: string
  accent?: 'danger' | 'warning' | 'default' | 'lime'
  delta?: number        // +/- change indicator
  route: string
  flashing?: boolean    // periodic "live" pulse driven by the parent
}

function KPICard({ value, label, icon, iconBg, iconColor, accent = 'default', delta, route, flashing }: KPICardProps) {
  const router = useRouter()
  const [hovered, setHovered] = React.useState(false)
  const { count: displayCount, bump } = useCountUp(value)

  const numColor = {
    danger:  'var(--color-danger)',
    warning: 'var(--color-warning)',
    lime:    'var(--color-lime-d)',
    default: 'var(--color-text)',
  }[accent]

  return (
    <button
      onClick={() => router.push(route)}
      aria-label={`Xem ${label}`}
      className={bump || flashing ? 'vyvy-flash' : undefined}
      data-vyvy-tilt="true"
      data-vyvy-radar="true"
      data-vyvy-alert={accent === 'danger' && value > 0 ? 'true' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:
          accent === 'danger'
            ? 'linear-gradient(180deg, rgba(184,64,64,0.04), rgba(255,255,255,0) 42%), var(--color-surface)'
            : accent === 'lime'
              ? 'linear-gradient(180deg, rgba(218,223,33,0.04), rgba(255,255,255,0) 42%), var(--color-surface)'
              : accent === 'warning'
                ? 'linear-gradient(180deg, rgba(196,123,43,0.04), rgba(255,255,255,0) 42%), var(--color-surface)'
                : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 48%), var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        padding: '15px',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        willChange: 'transform',
        borderColor:
          hovered
            ? accent === 'danger'
              ? 'rgba(184,64,64,0.55)'
              : accent === 'lime'
                ? 'rgba(218,223,33,0.52)'
                : 'var(--color-border-strong)'
            : 'var(--color-border)',
        transition: 'transform var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out)',
        boxShadow:
          hovered
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
        fontSize: 28, fontWeight: 600, lineHeight: 1,
        color: value > 0 ? numColor : 'var(--color-text-muted)',
        fontFamily: 'var(--font-display)',
      }}>
        <span className={bump ? 'vyvy-num-bump' : undefined}>{displayCount}</span>
      </div>

      {/* Label */}
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 5 }}>
        {label}
      </div>

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
}

export function KPICards({ kpi }: KPICardsProps) {
  const [liveIndex, setLiveIndex] = React.useState(-1)

  // Nhịp cập nhật trực tiếp: cứ vài giây lóe ngẫu nhiên 1 thẻ KPI cho cảm giác "sống".
  React.useEffect(() => {
    let resetTimer: number
    const interval = window.setInterval(() => {
      const next = Math.floor(Math.random() * 6)
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
      gridTemplateColumns: 'repeat(6, 1fr)',
      gap: 14,
    }}>
      <KPICard
        value={kpi.meetingsToday}
        label="Họp hôm nay"
        icon="ti-calendar-event"
        iconBg="var(--color-waiting-bg)"
        iconColor="var(--color-waiting)"
        accent="default"
        route="/meetings"
        flashing={liveIndex === 0}
      />
      <KPICard
        value={kpi.unimportedDrafts}
        label="Đầu việc chưa nhập"
        icon="ti-file-import"
        iconBg="var(--color-waiting-bg)"
        iconColor="#6B8A99"
        accent="warning"
        route="/task-inbox"
        flashing={liveIndex === 1}
      />
      <KPICard
        value={kpi.pendingDeliverable}
        label="Người nợ file"
        icon="ti-file-alert"
        iconBg="var(--color-warning-bg)"
        iconColor="var(--color-warning)"
        accent="warning"
        route="/follow-ups"
        flashing={liveIndex === 2}
      />
      <KPICard
        value={kpi.overdueItems}
        label="Quá hạn"
        icon="ti-alarm"
        iconBg="var(--color-danger-bg)"
        iconColor="var(--color-danger)"
        accent="danger"
        route="/follow-ups"
        flashing={liveIndex === 3}
      />
      <KPICard
        value={kpi.pendingApprovals}
        label="Chờ duyệt"
        icon="ti-stamp"
        iconBg="var(--color-success-bg)"
        iconColor="var(--color-success)"
        accent="default"
        route="/approvals"
        flashing={liveIndex === 4}
      />
      <KPICard
        value={kpi.ceoItems}
        label="Cần báo CEO"
        icon="ti-crown"
        iconBg="rgba(218,223,33,0.14)"
        iconColor="var(--color-lime-d)"
        accent="lime"
        flashing={liveIndex === 5}
        route="/ceo-reports"
      />
    </div>
  )
}
