import type { Metadata } from 'next'
import '@/styles/globals.css'
import { ToastProvider } from '@/components/feedback/Toast'
import { AppShell } from '@/components/layout/AppShell'

export const metadata: Metadata = {
  title: { default: 'VyVy WorkOS V2', template: '%s · VyVy WorkOS' },
  description: 'Nền tảng điều hành dự án VyVy.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0 }}>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  )
}
