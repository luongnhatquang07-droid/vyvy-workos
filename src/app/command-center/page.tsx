import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CommandCenterView } from '@/features/command-center/CommandCenterView'
import { DEFAULT_COMMAND_CENTER_TIMEZONE, formatCommandCenterDateTime } from '@/features/command-center/greeting'
import { getCommandCenterData } from '@/lib/db/commandCenter'
import { toCommandCenterVM } from '@/lib/mappers'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Trung tâm điều hành - VyVy WorkOS' }

export default async function CommandCenterPage() {
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  const todayLabel = formatCommandCenterDateTime(new Date(), DEFAULT_COMMAND_CENTER_TIMEZONE)

  if (!isSupabaseConfigured) {
    return (
      <CommandCenterView
        data={toCommandCenterVM(emptyRawData())}
        todayLabel={todayLabel}
        userName="Quang"
        timezone={DEFAULT_COMMAND_CENTER_TIMEZONE}
        dataIssue={{
          title: 'Chưa kết nối Supabase',
          description: 'Màn điều hành đang để trống vì chưa có URL hoặc anon key. Cấu hình Supabase xong rồi tải lại trang để xem dữ liệu thật.',
        }}
      />
    )
  }

  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profileRes = await sb
    .from('profiles')
    .select('id, display_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileRes.error) {
    return (
      <CommandCenterView
        data={toCommandCenterVM(emptyRawData())}
        todayLabel={todayLabel}
        userName="Quang"
        timezone={DEFAULT_COMMAND_CENTER_TIMEZONE}
        dataIssue={{
          title: 'Không đọc được hồ sơ đăng nhập',
          description: 'Kiểm tra bảng profiles, RLS hoặc đăng nhập lại.',
        }}
      />
    )
  }

  if (!profileRes.data?.id) {
    return (
      <CommandCenterView
        data={toCommandCenterVM(emptyRawData())}
        todayLabel={todayLabel}
        userName="Quang"
        timezone={DEFAULT_COMMAND_CENTER_TIMEZONE}
        dataIssue={{
          title: 'Tài khoản chưa có hồ sơ',
          description: 'Tài khoản đã đăng nhập nhưng chưa có profile trong workspace. Hãy tạo profile và membership cho tài khoản này.',
        }}
      />
    )
  }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('workspace_id, role_id')
    .eq('profile_id', profileRes.data.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (membershipRes.error) {
    return (
      <CommandCenterView
        data={toCommandCenterVM(emptyRawData())}
        todayLabel={todayLabel}
        userName={profileRes.data.display_name || 'Quang'}
        timezone={DEFAULT_COMMAND_CENTER_TIMEZONE}
        dataIssue={{
          title: 'Không đọc được quyền workspace',
          description: 'Hệ thống chưa xác định được workspace của tài khoản này. Kiểm tra bảng workspace_memberships, RLS hoặc đăng nhập lại.',
        }}
      />
    )
  }

  if (!membershipRes.data?.workspace_id) {
    redirect('/login')
  }

  const workspaceId = membershipRes.data.workspace_id
  let workspaceTimezone = DEFAULT_COMMAND_CENTER_TIMEZONE
  let userName = profileRes.data.display_name || 'Quang'

  const workspaceRes = await sb
    .from('workspaces')
    .select('timezone')
    .eq('id', workspaceId)
    .maybeSingle()

  if (!workspaceRes.error && workspaceRes.data?.timezone) {
    workspaceTimezone = workspaceRes.data.timezone
  }

  const personRes = await sb
    .from('people')
    .select('full_name')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', profileRes.data.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!personRes.error && personRes.data?.full_name) {
    userName = personRes.data.full_name
  }

  let data = toCommandCenterVM(emptyRawData())
  let dataIssue: { title: string; description: string } | undefined

  try {
    const raw = await getCommandCenterData(workspaceId)
    data = toCommandCenterVM(raw)
  } catch (error) {
    dataIssue = {
      title: 'Không tải được dữ liệu điều hành',
      description: error instanceof Error ? error.message : 'Kiểm tra Supabase, RLS hoặc schema rồi tải lại trang.',
    }
  }

  return (
    <CommandCenterView
      data={data}
      todayLabel={todayLabel}
      workspaceId={workspaceId}
      userName={userName}
      timezone={workspaceTimezone}
      dataIssue={dataIssue}
    />
  )
}

function emptyRawData() {
  return {
    people: [],
    projects: [],
    workstreams: [],
    tasks: [],
    taskSteps: [],
    meetings: [],
    taskDrafts: [],
    deliverables: [],
    deliverableVersions: [],
    attachments: [],
    approvals: [],
    reminders: [],
    ceoRequests: [],
    activityLogs: [],
  }
}
