import type { NavItem } from '@/types'

export const NAV_ITEMS: NavItem[] = [
  { key: 'command-center', label: 'Trung tâm điều hành', href: '/command-center', icon: '⌂' },
  { key: 'meetings',       label: 'Họp & Biên bản',      href: '/meetings',       icon: '◉' },
  { key: 'task-inbox',     label: 'Inbox đầu việc',       href: '/task-inbox',     icon: '☰' },
  { key: 'follow-ups',     label: 'Theo dõi & Nhắc việc', href: '/follow-ups',     icon: '◎' },
  { key: 'projects',       label: 'Dự án',                href: '/projects',       icon: '▣' },
  { key: 'approvals',      label: 'Phê duyệt',            href: '/approvals',      icon: '✓' },
  { key: 'deliverables',   label: 'Tài liệu & Bàn giao',  href: '/deliverables',   icon: '⊞' },
  { key: 'calendar',       label: 'Lịch',                 href: '/calendar',       icon: '▦' },
  { key: 'ceo-reports',    label: 'Báo cáo CEO',          href: '/ceo-reports',    icon: '◈' },
  { key: 'team-workload',  label: 'Nhân sự & Tải việc',   href: '/team-workload',  icon: '◉' },
  { key: 'settings',       label: 'Cài đặt',              href: '/settings',       icon: '⚙' },
]
