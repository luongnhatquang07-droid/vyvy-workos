'use client'

import type {
  TimelineFilters,
  TimelineOwner,
  TimelineWorkstream,
  TimelineZoom,
} from '@/features/timeline/types'
import { TIMELINE_STATUS_OPTIONS } from './timelinePresentation'
import styles from './timeline.module.css'

interface FilterBarProps {
  filters: TimelineFilters
  owners: TimelineOwner[]
  workstreams: TimelineWorkstream[]
  zoom: TimelineZoom
  onFiltersChange: (filters: TimelineFilters) => void
  onZoomChange: (zoom: TimelineZoom) => void
}

export function FilterBar({
  filters,
  owners,
  workstreams,
  zoom,
  onFiltersChange,
  onZoomChange,
}: FilterBarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.filters}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Người phụ trách</span>
          <select
            className={styles.select}
            value={filters.ownerId}
            onChange={(event) => onFiltersChange({ ...filters, ownerId: event.target.value })}
          >
            <option value="all">Tất cả người phụ trách</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>{owner.name}</option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Đầu việc lớn</span>
          <select
            className={styles.select}
            value={filters.workstreamId}
            onChange={(event) => onFiltersChange({ ...filters, workstreamId: event.target.value })}
          >
            <option value="all">Tất cả đầu việc lớn</option>
            {workstreams.map((workstream) => (
              <option key={workstream.id} value={workstream.id}>{workstream.name}</option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Trạng thái</span>
          <select
            className={styles.select}
            value={filters.status}
            onChange={(event) => onFiltersChange({
              ...filters,
              status: event.target.value as TimelineFilters['status'],
            })}
          >
            <option value="all">Tất cả trạng thái</option>
            {TIMELINE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.zoomToggle} role="group" aria-label="Độ chi tiết Timeline">
        <button
          type="button"
          className={`${styles.zoomButton} ${zoom === 'week' ? styles.zoomButtonActive : ''}`}
          aria-pressed={zoom === 'week'}
          onClick={() => onZoomChange('week')}
        >
          Theo tuần
        </button>
        <button
          type="button"
          className={`${styles.zoomButton} ${zoom === 'day' ? styles.zoomButtonActive : ''}`}
          aria-pressed={zoom === 'day'}
          onClick={() => onZoomChange('day')}
        >
          Theo ngày
        </button>
      </div>
    </div>
  )
}
