import { NextRequest, NextResponse } from 'next/server'

import { ensureLocalQaWriteAllowed } from '@/lib/localQaGuard'
import { normalizeExternalSubmissionUrl } from '@/lib/files/externalLinks'
import {
  createPlanDocumentVersion,
  DocumentSchemaNotReadyError,
  getPlanRequestContext,
  loadProjectPlanTree,
  PlanAccessError,
} from '@/lib/documents/planService'
import type { CreatePlanDocumentInput, PlanTargetType } from '@/lib/documents/types'

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId')?.trim() ?? ''
    if (!projectId) {
      return NextResponse.json({ ok: false, error: 'Thiếu projectId.' }, { status: 400 })
    }

    const context = await getPlanRequestContext()
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Bạn cần đăng nhập.' }, { status: 401 })
    }

    const data = await loadProjectPlanTree(context, projectId)
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return planErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>
    const localGuard = ensureLocalQaWriteAllowed(
      request,
      body,
      'Không được tạo Plan từ localhost khi local đang trỏ production.',
    )
    if (localGuard) return localGuard

    const context = await getPlanRequestContext()
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Bạn cần đăng nhập.' }, { status: 401 })
    }

    const projectId = text(body.projectId)
    const targetType = planTargetType(body.targetType)
    const targetId = text(body.targetId)
    const title = text(body.title)
    const rawExternalUrl = text(body.externalUrl)
    if (!projectId || !targetType || !targetId || !title || !rawExternalUrl) {
      return NextResponse.json({ ok: false, error: 'Thiếu thông tin Plan cần lưu.' }, { status: 400 })
    }
    let externalUrl: string
    try {
      externalUrl = normalizeExternalSubmissionUrl(rawExternalUrl)
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : 'URL is invalid.' },
        { status: 400 },
      )
    }

    const input: CreatePlanDocumentInput = {
      projectId,
      targetType,
      targetId,
      documentId: nullableText(body.documentId),
      title,
      description: nullableText(body.description),
      changeNote: nullableText(body.changeNote),
      assetType: 'LINK',
      attachmentId: null,
      externalUrl,
    }
    const result = await createPlanDocumentVersion(context, input)
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    return planErrorResponse(error)
  }
}

function planErrorResponse(error: unknown) {
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
    { ok: false, error: error instanceof Error ? error.message : 'Không xử lý được tài liệu kế hoạch.' },
    { status: 500 },
  )
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function nullableText(value: unknown) {
  const valueText = text(value)
  return valueText || null
}

function planTargetType(value: unknown): PlanTargetType | null {
  return value === 'PROJECT' || value === 'WORKSTREAM' ? value : null
}
