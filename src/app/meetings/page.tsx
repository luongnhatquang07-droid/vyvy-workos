import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = { title: 'Họp & Biên bản' }

export default function MeetingsPage() {
  return <PageShell title="Họp & Biên bản" icon="◉" description="Quản lý lịch họp, biên bản và hành động tiếp theo." />
}
