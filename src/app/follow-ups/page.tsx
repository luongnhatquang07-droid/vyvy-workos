import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = { title: 'Theo dõi & Nhắc việc' }

export default function FollowUpsPage() {
  return <PageShell title="Theo dõi & Nhắc việc" icon="◎" description="Theo dõi tiến độ và nhắc nhở các đầu việc quan trọng." />
}
