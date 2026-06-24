import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = { title: 'Cài đặt' }

export default function SettingsPage() {
  return <PageShell title="Cài đặt" icon="⚙" description="Cấu hình workspace, phân quyền và tuỳ chọn hệ thống." />
}
