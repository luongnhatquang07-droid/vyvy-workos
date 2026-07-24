import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TimelineWorkspace } from '@/components/timeline/TimelineWorkspace'
import { PageHead } from '@/components/ui/PageHead'
import {
  getTimelinePageData,
  TimelineAuthenticationError,
} from '@/features/timeline/timelineService'
import styles from '@/components/timeline/timeline.module.css'

export const metadata: Metadata = {
  title: 'Timeline chuyển đổi số',
  description: 'Lập lịch và theo dõi các đầu việc chuyển đổi số theo người phụ trách.',
}

export const dynamic = 'force-dynamic'

export default async function TimelinePage() {
  let result: Awaited<ReturnType<typeof getTimelinePageData>>
  try {
    result = await getTimelinePageData()
  } catch (error) {
    if (error instanceof TimelineAuthenticationError) {
      redirect('/login?next=%2Ftimeline')
    }
    throw error
  }

  if (result.kind === 'ready') {
    return <TimelineWorkspace initialData={result.data} />
  }

  return (
    <div className={styles.page}>
      <PageHead
        icon="ti-timeline-event"
        title="Timeline chuyển đổi số"
        desc="Gán ngày và theo dõi tiến độ các đầu việc chuyển đổi số."
      />
      <div className={styles.timelineCard}>
        <div className={styles.empty}>
          <div>
            <div className={styles.emptyIcon}>
              <i
                className={`ti ${
                  result.kind === 'missing'
                    ? 'ti-database-off'
                    : result.kind === 'forbidden'
                      ? 'ti-lock'
                      : 'ti-alert-triangle'
                }`}
                aria-hidden="true"
              />
            </div>
            <div className={styles.emptyTitle}>
              {result.kind === 'missing'
                ? 'Chưa có dữ liệu Timeline'
                : result.kind === 'forbidden'
                  ? 'Chưa có quyền truy cập'
                  : 'Không tải được Timeline'}
            </div>
            <div className={styles.emptyText}>{result.message}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
