import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = { title: 'Báo cáo CEO' }

export default function CeoReportsPage() {
  return <PageShell title="Báo cáo CEO" icon="◈" description="Báo cáo tổng hợp và phân tích cho ban lãnh đạo." />
}
