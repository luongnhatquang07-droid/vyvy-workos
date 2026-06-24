import type { Metadata } from 'next'
import { CommandCenterView } from '@/features/command-center/CommandCenterView'

export const metadata: Metadata = { title: 'Trung tâm điều hành — VyVy WorkOS' }

export default function CommandCenterPage() {
  return <CommandCenterView />
}
