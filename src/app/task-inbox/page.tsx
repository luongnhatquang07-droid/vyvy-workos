import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = { title: 'Inbox đầu việc' }

export default function TaskInboxPage() {
  return <PageShell title="Inbox đầu việc" icon="☰" description="Tiếp nhận và phân loại đầu việc mới." />
}
