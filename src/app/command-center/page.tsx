import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = { title: 'Trung tâm điều hành' }

export default function CommandCenterPage() {
  return <PageShell title="Trung tâm điều hành" icon="⌂" description="Tổng quan hoạt động toàn bộ tổ chức." />
}
