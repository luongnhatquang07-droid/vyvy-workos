import { NextResponse } from 'next/server'
import { getUserManagementAccess } from '@/lib/admin/userManagement'

export async function GET() {
  const access = await getUserManagementAccess()
  return NextResponse.json(access)
}
