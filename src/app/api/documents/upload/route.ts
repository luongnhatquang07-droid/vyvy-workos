import { NextRequest, NextResponse } from 'next/server'

import { inferFileContentType } from '@/lib/files/mime'
import { ensureLocalQaWriteAllowed } from '@/lib/localQaGuard'
import {
  createPlanDocumentVersion,
  DocumentSchemaNotReadyError,
  getPlanRequestContext,
  loadPlanTargetAccess,
  PlanAccessError,
  type PlanRequestContext,
} from '@/lib/documents/planService'
import type { CreatePlanDocumentInput, PlanTargetType } from '@/lib/documents/types'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'project-files'
const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip', 'html', 'htm',
])

export async function POST(request: NextRequest) {
  let attachmentId: string | null = null
  try {
    const form = await request.formData()
    const localGuard = ensureLocalQaWriteAllowed(
      request,
      Object.fromEntries(form.entries()),
      'Không được upload Plan từ localhost khi local đang trỏ production.',
    )
    if (localGuard) return localGuard

    const file = form.get('file') as File | null
    const projectId = cleanText(form.get('projectId'))
    const targetType = planTargetType(form.get('targetType'))
    const targetId = cleanText(form.get('targetId'))
    const title = cleanText(form.get('title')) || file?.name || ''
    const documentId = cleanText(form.get('documentId')) || null
    const description = cleanText(form.get('description')) || null
    const changeNote = cleanText(form.get('changeNote')) || null
    if (!file || !projectId || !targetType || !targetId || !title) {
      return NextResponse.json({ ok: false, error: 'Thiếu file hoặc phạm vi Plan.' }, { status: 400 })
    }

    const validationError = validateFile(file)
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 })
    }

    const context = await getPlanRequestContext()
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Bạn cần đăng nhập.' }, { status: 401 })
    }
    const access = await loadPlanTargetAccess(context, projectId, targetType, targetId)
    if (!access.canView || !access.canManage) {
      throw new PlanAccessError('Bạn không có quyền cập nhật kế hoạch này.')
    }

    await ensureStorageBucket(context)
    const storagePath = [
      context.workspaceId,
      'documents',
      'plans',
      targetType.toLowerCase(),
      targetId,
      `${Date.now()}_${crypto.randomUUID()}_${sanitizeFileName(file.name)}`,
    ].join('/')
    const mimeType = inferFileContentType(file.name, file.type)
    const bytes = await file.arrayBuffer()
    const uploadResult = await context.service.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false })
    if (uploadResult.error) throw new Error(uploadResult.error.message)

    const attachmentResult = await context.service
      .from('attachments')
      .insert({
        workspace_id: context.workspaceId,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: mimeType,
        size_bytes: file.size,
        uploaded_by: context.actor.personId,
      })
      .select('id')
      .single()
    if (attachmentResult.error || !attachmentResult.data?.id) {
      throw new Error('File đã lên storage nhưng chưa ghi được attachment.')
    }
    attachmentId = attachmentResult.data.id as string

    const input: CreatePlanDocumentInput = {
      projectId,
      targetType,
      targetId,
      documentId,
      title,
      description,
      changeNote,
      assetType: 'FILE',
      attachmentId,
      externalUrl: null,
    }
    const result = await createPlanDocumentVersion(context, input)
    return NextResponse.json({
      ok: true,
      result,
      file: {
        attachmentId,
        fileName: file.name,
        fileSize: file.size,
        mimeType,
        storagePath,
        url: fileOpenUrl(context.workspaceId, storagePath),
      },
    })
  } catch (error) {
    if (attachmentId) await softDeleteOrphanAttachment(attachmentId)
    if (error instanceof DocumentSchemaNotReadyError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 503 },
      )
    }
    if (error instanceof PlanAccessError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Không upload được Plan.' },
      { status: 500 },
    )
  }
}

async function ensureStorageBucket(context: PlanRequestContext) {
  const listResult = await context.service.storage.listBuckets()
  if (listResult.error) throw new Error(listResult.error.message)
  if (listResult.data?.some((bucket) => bucket.name === STORAGE_BUCKET)) return
  const createResult = await context.service.storage.createBucket(STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_SIZE,
  })
  if (createResult.error && !/already exists/i.test(createResult.error.message)) {
    throw new Error(createResult.error.message)
  }
}

async function softDeleteOrphanAttachment(attachmentId: string) {
  const context = await getPlanRequestContext()
  if (!context) return
  await context.service
    .from('attachments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('workspace_id', context.workspaceId)
    .eq('id', attachmentId)
}

function validateFile(file: File) {
  if (file.size <= 0) return 'File đang rỗng, chưa thể tải lên.'
  if (file.size > MAX_FILE_SIZE) return 'File vượt quá giới hạn 25MB.'
  if (!ALLOWED_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase() ?? '')) {
    return 'Chỉ hỗ trợ PDF, Word, Excel/CSV, ảnh, ZIP và HTML.'
  }
  return ''
}

function fileOpenUrl(workspaceId: string, storagePath: string) {
  return `/api/files/open?${new URLSearchParams({ workspaceId, path: storagePath }).toString()}`
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function cleanText(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function planTargetType(value: FormDataEntryValue | null): PlanTargetType | null {
  return value === 'PROJECT' || value === 'WORKSTREAM' ? value : null
}
