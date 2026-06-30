import type { NavItem } from '@/types'

export const NAV_ITEMS: NavItem[] = [
  { key: 'command-center', label: 'Trung tâm điều hành', href: '/command-center', icon: 'ti-layout-dashboard', group: 'Điều hành', badge: { count: 0, variant: 'lime' } },
  { key: 'meetings',       label: 'Họp & Biên bản',      href: '/meetings',       icon: 'ti-microphone-2',    group: 'Điều hành', badge: { count: 0, variant: 'default' } },
  { key: 'task-inbox',     label: 'Inbox đầu việc',       href: '/task-inbox',     icon: 'ti-inbox',           group: 'Điều hành', badge: { count: 0, variant: 'hot' } },
  { key: 'follow-ups',     label: 'Theo dõi & Nhắc việc', href: '/follow-ups',     icon: 'ti-bell-ringing',    group: 'Điều hành', badge: { count: 0, variant: 'hot' } },
  { key: 'projects',       label: 'Dự án',                href: '/projects',       icon: 'ti-folders',         group: 'Công việc' },
  { key: 'approvals',      label: 'Phê duyệt',            href: '/approvals',      icon: 'ti-checkup-list',    group: 'Công việc', badge: { count: 0, variant: 'default' } },
  { key: 'deliverables',   label: 'Tài liệu & Bàn giao',  href: '/deliverables',   icon: 'ti-files',           group: 'Công việc', badge: { count: 0, variant: 'hot' } },
  { key: 'calendar',       label: 'Lịch',                 href: '/calendar',       icon: 'ti-calendar-month',  group: 'Tổng hợp' },
  { key: 'ceo-reports',    label: 'Báo cáo CEO',          href: '/ceo-reports',    icon: 'ti-presentation-analytics', group: 'Tổng hợp', badge: { count: 0, variant: 'lime' } },
  { key: 'team-workload',  label: 'Nhân sự & Tải việc',   href: '/team-workload',  icon: 'ti-users-group',     group: 'Tổng hợp' },
  { key: 'settings',       label: 'Cài đặt',              href: '/settings',       icon: 'ti-settings',        group: 'Tổng hợp' },
]
