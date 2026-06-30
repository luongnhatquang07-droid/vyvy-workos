import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const BLOCKED_EXTENSIONS = new Set(['bat', 'cmd', 'com', 'exe', 'js', 'msi', 'ps1', 'scr', 'sh', 'vbs'])

type UploadContext =
  | { ok: true; workspaceId: string; uploaderId: string | null }
  | { ok: false; status: number; message: string }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Lỗi không xác định'
}

function cleanId(value: FormDataEntryValue | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function validateFile(file: File) {
  if (file.size <= 0) return 'File đang rỗng, chưa thể tải lên.'
  if (file.size > MAX_FILE_SIZE) return 'File vượt quá giới hạn 25MB.'

  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (BLOCKED_EXTENSIONS.has(extension)) {
    return 'Loại file này không được phép tải lên vì có rủi ro bảo mật.'
  }

  return ''
}

async function getUploadContext(workspaceId: string): Promise<UploadContext> {
  const sb = await createServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) {
    return { ok: false, status: 401, message: 'Bạn cần đăng nhập trước khi tải file.' }
  }

  const profileRes = await sb
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileRes.error) {
    return { ok: false, status: 500, message: 'Không kiểm tra được hồ sơ đăng nhập.' }
  }

  if (!profileRes.data?.id) {
    return { ok: false, status: 403, message: 'Tài khoản chưa có profile trong workspace.' }
  }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('workspace_id, profile_id')
    .eq('profile_id', profileRes.data.id)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipRes.error) {
    return { ok: false, status: 500, message: 'Không kiểm tra được quyền workspace.' }
  }

  if (!membershipRes.data) {
    return { ok: false, status: 403, message: 'Tài khoản không có quyền tải file vào workspace này.' }
  }

  const personRes = await sb
    .from('people')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', membershipRes.data.profile_id)
    .is('deleted_at', null)
    .maybeSingle()

  return {
    ok: true,
    workspaceId,
    uploaderId: personRes.data?.id ?? null,
  }
}

async function belongsToWorkspace(
  table: 'projects' | 'tasks' | 'deliverables',
  id: string | null,
  workspaceId: string,
) {
  if (!id) return true
  const client = createServiceClient()
  const { data, error } = await client
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) return false
  return Boolean(data)
}

async function validateEntityScope({
  workspaceId,
  projectId,
  taskId,
  deliverableId,
}: {
  workspaceId: string
  projectId: string | null
  taskId: string | null
  deliverableId: string | null
}) {
  const [projectOk, taskOk, deliverableOk] = await Promise.all([
    belongsToWorkspace('projects', projectId, workspaceId),
    belongsToWorkspace('tasks', taskId, workspaceId),
    belongsToWorkspace('deliverables', deliverableId, workspaceId),
  ])

  if (!projectOk) return 'Dự án không thuộc workspace hiện tại.'
  if (!taskOk) return 'Đầu việc không thuộc workspace hiện tại.'
  if (!deliverableOk) return 'Hạng mục bàn giao không thuộc workspace hiện tại.'
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const workspaceId = cleanId(form.get('workspaceId'))
    const projectId = cleanId(form.get('projectId'))
    const taskId = cleanId(form.get('taskId'))
    const deliverableId = cleanId(form.get('deliverableId'))

    if (!file || !workspaceId) {
      return NextResponse.json({ error: 'Thiếu file hoặc workspaceId.' }, { status: 400 })
    }

    const fileError = validateFile(file)
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 })
    }

    const context = await getUploadContext(workspaceId)
    if (!context.ok) {
      return NextResponse.json({ error: context.message }, { status: context.status })
    }

    const scopeError = await validateEntityScope({ workspaceId, projectId, taskId, deliverableId })
    if (scopeError) {
      return NextResponse.json({ error: scopeError }, { status: 403 })
    }

    const client = createServiceClient()
    const folder = [workspaceId, projectId, taskId].filter(Boolean).join('/')
    const storagePath = `${folder}/${Date.now()}_${crypto.randomUUID()}_${sanitizeFileName(file.name)}`

    const bytes = await file.arrayBuffer()
    const { error: uploadError } = await client.storage
      .from('project-files')
      .upload(storagePath, bytes, { contentType: file.type || 'application/octet-stream', upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: attachment, error: attachmentError } = await client
      .from('attachments')
      .insert({
        workspace_id: workspaceId,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        uploaded_by: context.uploaderId,
      })
      .select('id')
      .single()

    if (attachmentError || !attachment) {
      return NextResponse.json({ error: 'File đã lên storage nhưng ghi attachment thất bại.' }, { status: 500 })
    }

    if (deliverableId) {
      const { count } = await client
        .from('deliverable_versions')
        .select('*', { count: 'exact', head: true })
        .eq('deliverable_id', deliverableId)

      await client.from('deliverable_versions').insert({
        deliverable_id: deliverableId,
        version_number: (count ?? 0) + 1,
        attachment_id: attachment.id,
        submitted_by: context.uploaderId,
        review_status: 'PENDING',
      })

      await client
        .from('deliverables')
        .update({ status: 'SUBMITTED' })
        .eq('id', deliverableId)
        .eq('workspace_id', workspaceId)
    }

    const { data: signedUrl } = await client.storage
      .from('project-files')
      .createSignedUrl(storagePath, 86400)

    return NextResponse.json({
      ok: true,
      attachmentId: attachment.id,
      storagePath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      url: signedUrl?.signedUrl ?? null,
    })
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId') ?? ''
  const projectId = searchParams.get('projectId')
  const taskId = searchParams.get('taskId')

  if (!workspaceId) {
    return NextResponse.json({ error: 'Thiếu workspaceId.' }, { status: 400 })
  }

  const context = await getUploadContext(workspaceId)
  if (!context.ok) {
    return NextResponse.json({ error: context.message, files: [] }, { status: context.status })
  }

  const scopeError = await validateEntityScope({ workspaceId, projectId, taskId, deliverableId: null })
  if (scopeError) {
    return NextResponse.json({ error: scopeError, files: [] }, { status: 403 })
  }

  const client = createServiceClient()
  const folder = [workspaceId, projectId, taskId].filter(Boolean).join('/')

  const { data: files, error } = await client.storage
    .from('project-files')
    .list(folder, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } })

  if (error) return NextResponse.json({ error: error.message, files: [] }, { status: 500 })

  const withUrls = await Promise.all((files ?? []).map(async (file) => {
    const path = `${folder}/${file.name}`
    const { data } = await client.storage.from('project-files').createSignedUrl(path, 3600)
    return { ...file, url: data?.signedUrl ?? null, storagePath: path }
  }))

  return NextResponse.json({ files: withUrls })
}
