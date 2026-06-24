import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = { title: 'Dự án' }

export default function ProjectsPage() {
  return <PageShell title="Dự án" icon="▣" description="Quản lý danh mục dự án và workstream." />
}
