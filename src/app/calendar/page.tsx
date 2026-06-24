import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = { title: 'Lịch' }

export default function CalendarPage() {
  return <PageShell title="Lịch" icon="▦" description="Lịch làm việc, deadline và sự kiện quan trọng." />
}
