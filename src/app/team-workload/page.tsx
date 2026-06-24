import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = { title: 'Nhân sự & Tải việc' }

export default function TeamWorkloadPage() {
  return <PageShell title="Nhân sự & Tải việc" icon="◉" description="Phân bổ công việc và theo dõi năng lực nhóm." />
}
