export type NavBadge = { count: number; variant: 'default' | 'hot' | 'lime' }

export type NavItem = {
  key: string
  label: string
  href: string
  icon: string   // tabler icon class e.g. "ti-layout-dashboard"
  group?: string // group label for sidebar section headers
  badge?: NavBadge
  permission?: 'manage-users' | 'view-reports' | 'view-team-workload'
}

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface ToastMessage {
  id: string
  message: string
  variant?: ToastVariant
  duration?: number
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'waiting' | 'lime'

export type StatusDotColor = 'success' | 'warning' | 'danger' | 'waiting' | 'muted'
