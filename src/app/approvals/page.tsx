import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = { title: 'Phê duyệt' }

export default function ApprovalsPage() {
  return <PageShell title="Phê duyệt" icon="✓" description="Duyệt deadline, tài liệu và các yêu cầu cần xác nhận." />
}
