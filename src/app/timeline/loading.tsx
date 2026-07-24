import { PageHead } from '@/components/ui/PageHead'
import styles from '@/components/timeline/timeline.module.css'

export default function TimelineLoading() {
  return (
    <div className={styles.page}>
      <PageHead
        icon="ti-timeline-event"
        title="Timeline chuyển đổi số"
        desc="Đang tải project, người phụ trách và lịch đầu việc…"
      />
      <div className={styles.skeleton} aria-label="Đang tải Timeline" />
    </div>
  )
}
