import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = { title: 'Tài liệu & Bàn giao' }

export default function DeliverablesPage() {
  return <PageShell title="Tài liệu & Bàn giao" icon="⊞" description="Quản lý tài liệu bàn giao và kết quả công việc." />
}
