'use client'

import React from 'react'
import { Drawer } from '@/components/feedback/Drawer'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { FileList } from '@/components/ui/FileList'
import { FileUpload } from '@/components/ui/FileUpload'
import { PageHead } from '@/components/ui/PageHead'
import { getVietnamDateKey } from '@/features/command-center/utils'
import { useCommandData } from '@/hooks/useCommandData'
import type {
  CommandCenterDeliverableRow,
  CommandCenterProjectRow,
  CommandCenterTaskRow,
  CommandCenterTaskStepRow,
} from '@/lib/database.types'

type FilterKey = 'all' | 'not_submitted' | 'overdue' | 'submitted' | 'revision' | 'approved'
type DeliverableStatus = CommandCenterDeliverableRow['status']

interface DetailVersion {
  id: string
  version_number: number
  review_status: 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED' | 'CANCELLED'
}

interface DetailPayload {
  deliverable?: CommandCenterDeliverableRow
  versions?: DetailVersion[]
  error?: string
}

interface CreateDraft {
  name: string
  description: string
  type: string
  requiredFormat: string
  projectId: string
  taskId: string
  stepId: string
  submitterId: string
  reviewerId: string
  dueDate: string
  isRequired: boolean
  requiresApproval: boolean
}

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'not_submitted', label: 'Chưa nộp' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'submitted', label: 'Đã nộp' },
  { key: 'revision', label: 'Yêu cầu sửa' },
  { key: 'approved', label: 'Đã duyệt' },
]

const STATUS_META: Record<DeliverableStatus | 'OVERDUE', { label: string; color: string; bg: string }> = {
  REQUIRED: { label: 'Chưa nộp', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  NOT_SUBMITTED: { label: 'Chưa nộp', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  SUBMITTED: { label: 'Đã nộp', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  MISSING_INFORMATION: { label: 'Thiếu thông tin', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  REVISION_REQUIRED: { label: 'Yêu cầu sửa', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  APPROVED: { label: 'Đã duyệt', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  OVERDUE: { label: 'Quá hạn', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
}

function createDraft(): CreateDraft {
  return {
    name: '',
    description: '',
    type: 'file',
    requiredFormat: '',
    projectId: '',
    taskId: '',
    stepId: '',
    submitterId: '',
    reviewerId: '',
    dueDate: '',
    isRequired: true,
    requiresApproval: false,
  }
}

export default function DeliverablesPage() {
  const { data, loading, error, refresh } = useCommandData()
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [query, setQuery] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<DetailPayload | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [detailError, setDetailError] = React.useState('')
  const [reviewComment, setReviewComment] = React.useState('')
  const [reminderMessage, setReminderMessage] = React.useState('')
  const [pendingReminder, setPendingReminder] = React.useState(false)
  const [showCreate, setShowCreate] = React.useState(false)
  const [draft, setDraft] = React.useState<CreateDraft>(createDraft)
  const [formError, setFormError] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const deliverables = React.useMemo(() => data?.deliverables ?? [], [data?.deliverables])
  const people = React.useMemo(() => data?.people ?? [], [data?.people])
  const tasks = React.useMemo(() => data?.tasks ?? [], [data?.tasks])
  const steps = React.useMemo(() => data?.taskSteps ?? [], [data?.taskSteps])
  const projects = React.useMemo(() => data?.projects ?? [], [data?.projects])
  const workspaceId = data?.workspaceId
  const today = getVietnamDateKey()

  const peopleById = React.useMemo(() => Object.fromEntries(people.map((person) => [person.id, person])), [people])
  const tasksById = React.useMemo(() => Object.fromEntries(tasks.map((task) => [task.id, task])), [tasks])
  const projectsById = React.useMemo(() => Object.fromEntries(projects.map((project) => [project.id, project])), [projects])
  const stepsById = React.useMemo(() => Object.fromEntries(steps.map((step) => [step.id, step])), [steps])

  const selected = selectedId ? deliverables.find((item) => item.id === selectedId) ?? null : null

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return deliverables.filter((item) => {
      const isOverdue = Boolean(item.due_date && item.due_date < today && !['SUBMITTED', 'APPROVED'].includes(item.status))
      if (filter === 'not_submitted' && !['REQUIRED', 'NOT_SUBMITTED'].includes(item.status)) return false
      if (filter === 'overdue' && !isOverdue) return false
      if (filter === 'submitted' && item.status !== 'SUBMITTED') return false
      if (filter === 'revision' && !['REVISION_REQUIRED', 'MISSING_INFORMATION'].includes(item.status)) return false
      if (filter === 'approved' && item.status !== 'APPROVED') return false

      if (!normalized) return true
      const task = item.task_id ? tasksById[item.task_id] : null
      const project = item.project_id ? projectsById[item.project_id] : null
      const submitter = item.submitter_id ? peopleById[item.submitter_id] : null
      const haystack = `${item.name} ${item.description ?? ''} ${task?.title ?? ''} ${project?.name ?? ''} ${submitter?.full_name ?? ''}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [deliverables, filter, peopleById, projectsById, query, tasksById, today])

  const lateCount = deliverables.filter((item) => item.due_date && item.due_date < today && !['SUBMITTED', 'APPROVED'].includes(item.status)).length
  const submittedCount = deliverables.filter((item) => item.status === 'SUBMITTED').length
  const approvedCount = deliverables.filter((item) => item.status === 'APPROVED').length

  React.useEffect(() => {
    if (!selectedId || !workspaceId) return
    void loadDetail(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, workspaceId])

  async function loadDetail(id = selectedId) {
    if (!workspaceId || !id) return
    setDetailLoading(true)
    setDetailError('')
    try {
      const params = new URLSearchParams({ workspaceId, deliverableId: id })
      const response = await fetch(`/api/deliverables?${params}`)
      const payload = (await response.json()) as DetailPayload
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không tải được chi tiết bàn giao.')
      setDetail(payload)
    } catch (err) {
      setDetail(null)
      setDetailError(err instanceof Error ? err.message : 'Không tải được chi tiết bàn giao.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function reloadAll(id = selectedId) {
    await refresh()
    if (id) await loadDetail(id)
  }

  async function createDeliverable() {
    if (!workspaceId) return
    setFormError('')
    if (!draft.name.trim()) {
      setFormError('Tên bàn giao không được để trống.')
      return
    }
    setBusy(true)
    try {
      const linkedTask = draft.stepId ? stepsById[draft.stepId]?.task_id ?? draft.taskId : draft.taskId
      const task = linkedTask ? tasksById[linkedTask] : null
      const payload = {
        ...draft,
        workspaceId,
        taskId: linkedTask || null,
        projectId: draft.projectId || task?.project_id || null,
        stepId: draft.stepId || null,
        submitterId: draft.submitterId || task?.owner_id || null,
        reviewerId: draft.reviewerId || null,
      }
      const response = await fetch('/api/deliverables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as { deliverableId?: string; error?: string }
      if (!response.ok || result.error) throw new Error(result.error ?? 'Không tạo được bàn giao.')
      setShowCreate(false)
      setDraft(createDraft())
      await refresh()
      if (result.deliverableId) setSelectedId(result.deliverableId)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không tạo được bàn giao.')
    } finally {
      setBusy(false)
    }
  }

  async function runAction(action: 'approve' | 'requestRevision' | 'markMissing') {
    if (!workspaceId || !selectedId) return
    setBusy(true)
    setDetailError('')
    try {
      const latestVersionId = detail?.versions?.[0]?.id
      const response = await fetch('/api/deliverables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          deliverableId: selectedId,
          action,
          versionId: latestVersionId,
          reviewComment: reviewComment.trim(),
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không cập nhật được bàn giao.')
      setReviewComment('')
      await reloadAll(selectedId)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Không cập nhật được bàn giao.')
    } finally {
      setBusy(false)
    }
  }

  async function prepareReminder(item: CommandCenterDeliverableRow) {
    const submitter = item.submitter_id ? peopleById[item.submitter_id] : null
    const task = item.task_id ? tasksById[item.task_id] : null
    const message = [
      `Nhắc nộp file/báo cáo: ${item.name}.`,
      item.due_date ? `Deadline: ${new Date(item.due_date).toLocaleDateString('vi-VN')}.` : '',
      task ? `Liên quan đầu việc: ${task.title}.` : '',
      'Bạn phản hồi giúp Quang tình trạng và gửi file/link khi xong nhé.',
    ].filter(Boolean).join(' ')

    setReminderMessage(message)
    setPendingReminder(true)
    try {
      await navigator.clipboard.writeText(message)
    } catch {
      // User can still copy the visible message manually.
    }
    if (submitter?.messenger_url) {
      window.open(submitter.messenger_url, '_blank', 'noopener,noreferrer')
    }
  }

  async function confirmReminder(confirmedSent: boolean) {
    if (!workspaceId || !selectedId || !selected) return
    setBusy(true)
    setDetailError('')
    try {
      const response = await fetch('/api/deliverables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          deliverableId: selectedId,
          action: 'confirmReminder',
          confirmedSent,
          message: reminderMessage,
          personId: selected.submitter_id,
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không ghi nhận được nhắc việc.')
      setPendingReminder(false)
      await reloadAll(selectedId)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Không ghi nhận được nhắc việc.')
    } finally {
      setBusy(false)
    }
  }

  function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      storageMode: 'supabase',
      warning: 'File blob nằm trong Supabase Storage; JSON này chỉ chứa metadata và link đã ký tạm thời nếu đang mở detail.',
      deliverables,
      selectedDetail: detail,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vyvy-deliverables-${getVietnamDateKey()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-files"
        title="Tài liệu & bàn giao"
        desc="Theo dõi file, link, version và trạng thái duyệt để khóa hoàn thành suông."
        actions={(
          <>
            <button type="button" onClick={exportJson} style={ghostButtonStyle}><i className="ti ti-download" /> Export JSON</button>
            <button type="button" onClick={() => setShowCreate(true)} style={primaryButtonStyle}><i className="ti ti-plus" /> Tạo bàn giao</button>
          </>
        )}
      />

      {error ? <DataErrorState message={error} /> : null}

      <div style={summaryGrid}>
        <MetricCard icon="ti-alert-circle" label="Đang trễ hạn" value={lateCount} tone="danger" />
        <MetricCard icon="ti-upload" label="Đã nộp chờ xem" value={submittedCount} tone="warning" />
        <MetricCard icon="ti-rosette-check" label="Đã duyệt" value={approvedCount} tone="success" />
        <MetricCard icon="ti-stack-2" label="Tổng mục bàn giao" value={deliverables.length} tone="neutral" />
      </div>

      <section style={panelStyle}>
        <div style={panelHead}>
          <div>
            <div style={eyebrow}>Danh sách bàn giao</div>
            <div style={panelTitle}>Toàn bộ file và báo cáo</div>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo file, task, dự án, người nộp..."
            style={searchInputStyle}
          />
        </div>

        <div style={filterRowStyle}>
          {FILTERS.map((item) => (
            <button key={item.key} type="button" onClick={() => setFilter(item.key)} style={filterButtonStyle(filter === item.key)}>
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={emptyState}>Đang tải danh sách bàn giao...</div>
        ) : error ? (
          <div style={errorState}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={emptyState}>Không có bàn giao phù hợp bộ lọc hiện tại.</div>
        ) : (
          <div style={listStyle}>
            {filtered.map((item, index) => (
              <DeliverableRow
                key={item.id}
                item={item}
                index={index}
                total={filtered.length}
                today={today}
                people={peopleById}
                tasks={tasksById}
                projects={projectsById}
                onOpen={() => setSelectedId(item.id)}
                onRemind={() => void prepareReminder(item)}
              />
            ))}
          </div>
        )}
      </section>

      <Drawer open={Boolean(selectedId)} onClose={() => { setSelectedId(null); setDetail(null); setPendingReminder(false) }} title="Chi tiết bàn giao" width={620}>
        {!selected ? (
          <div style={emptyState}>Không tìm thấy bàn giao.</div>
        ) : (
          <DeliverableDetail
            item={selected}
            detail={detail}
            loading={detailLoading}
            error={detailError}
            workspaceId={workspaceId}
            people={peopleById}
            tasks={tasksById}
            projects={projectsById}
            steps={stepsById}
            reviewComment={reviewComment}
            onReviewComment={setReviewComment}
            onUploaded={() => void reloadAll(selected.id)}
            onApprove={() => void runAction('approve')}
            onRevision={() => void runAction('requestRevision')}
            onMissing={() => void runAction('markMissing')}
            onRemind={() => void prepareReminder(selected)}
            busy={busy}
            pendingReminder={pendingReminder}
            reminderMessage={reminderMessage}
            onConfirmReminder={(confirmed) => void confirmReminder(confirmed)}
          />
        )}
      </Drawer>

      <Drawer open={showCreate} onClose={() => setShowCreate(false)} title="Tạo bàn giao" width={560}>
        <CreateDeliverableForm
          draft={draft}
          onChange={setDraft}
          people={people}
          projects={projects}
          tasks={tasks}
          steps={steps}
          error={formError}
          busy={busy}
          onSubmit={() => void createDeliverable()}
        />
      </Drawer>
    </div>
  )
}

function DeliverableRow({
  item,
  index,
  total,
  today,
  people,
  tasks,
  projects,
  onOpen,
  onRemind,
}: {
  item: CommandCenterDeliverableRow
  index: number
  total: number
  today: string
  people: Record<string, { full_name: string }>
  tasks: Record<string, CommandCenterTaskRow>
  projects: Record<string, CommandCenterProjectRow>
  onOpen: () => void
  onRemind: () => void
}) {
  const isLate = item.due_date && item.due_date < today && !['SUBMITTED', 'APPROVED'].includes(item.status)
  const status = STATUS_META[isLate ? 'OVERDUE' : item.status] ?? STATUS_META.NOT_SUBMITTED
  const owner = item.submitter_id ? people[item.submitter_id] : null
  const reviewer = item.reviewer_id ? people[item.reviewer_id] : null
  const task = item.task_id ? tasks[item.task_id] : null
  const project = item.project_id ? projects[item.project_id] : null

  return (
    <div style={{ ...rowWrap, borderBottom: index < total - 1 ? '1px solid var(--color-border)' : undefined }}>
      <div style={rowHeader(status.color)}>
        <div style={fileIcon}><i className="ti ti-file-text" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={itemTitle}>{item.name}</div>
          <div style={itemMeta}>
            <span>Nộp: {owner?.full_name ?? 'Chưa gắn'}</span>
            <span>Kiểm tra: {reviewer?.full_name ?? 'Chưa gắn'}</span>
            <span>{project?.name ?? 'Chưa gắn dự án'}</span>
            <span>{task?.title ?? 'Chưa gắn task'}</span>
            <span>{item.due_date ? new Date(item.due_date).toLocaleDateString('vi-VN') : 'Chưa có hạn'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ ...badgeBase, color: status.color, background: status.bg }}>{status.label}</span>
          <button type="button" onClick={onRemind} style={ghostButtonStyle}>Nhắc</button>
          <button type="button" onClick={onOpen} style={primarySmallButtonStyle}>Mở chi tiết</button>
        </div>
      </div>
    </div>
  )
}

function DeliverableDetail({
  item,
  detail,
  loading,
  error,
  workspaceId,
  people,
  tasks,
  projects,
  steps,
  reviewComment,
  onReviewComment,
  onUploaded,
  onApprove,
  onRevision,
  onMissing,
  onRemind,
  busy,
  pendingReminder,
  reminderMessage,
  onConfirmReminder,
}: {
  item: CommandCenterDeliverableRow
  detail: DetailPayload | null
  loading: boolean
  error: string
  workspaceId?: string
  people: Record<string, { full_name?: string; name?: string; messenger_url?: string | null }>
  tasks: Record<string, CommandCenterTaskRow>
  projects: Record<string, CommandCenterProjectRow>
  steps: Record<string, CommandCenterTaskStepRow>
  reviewComment: string
  onReviewComment: (value: string) => void
  onUploaded: () => void
  onApprove: () => void
  onRevision: () => void
  onMissing: () => void
  onRemind: () => void
  busy: boolean
  pendingReminder: boolean
  reminderMessage: string
  onConfirmReminder: (confirmed: boolean) => void
}) {
  const task = item.task_id ? tasks[item.task_id] : null
  const project = item.project_id ? projects[item.project_id] : null
  const step = item.step_id ? steps[item.step_id] : null
  const submitter = item.submitter_id ? people[item.submitter_id] : null
  const reviewer = item.reviewer_id ? people[item.reviewer_id] : null
  const status = STATUS_META[item.status] ?? STATUS_META.NOT_SUBMITTED

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={detailHeroStyle}>
        <div>
          <div style={eyebrow}>Bàn giao</div>
          <h2 style={detailTitleStyle}>{item.name}</h2>
          <div style={itemMeta}>
            <span>Dự án: {project?.name ?? 'Chưa gắn'}</span>
            <span>Task: {task?.title ?? 'Chưa gắn'}</span>
            <span>Step: {step?.title ?? 'Không có'}</span>
          </div>
        </div>
        <span style={{ ...badgeBase, color: status.color, background: status.bg }}>{status.label}</span>
      </div>

      {error ? <div style={errorState}>{error}</div> : null}
      {loading ? <div style={emptyState}>Đang tải lịch sử version...</div> : null}

      <div style={infoGridStyle}>
        <Info label="Người nộp" value={submitter?.full_name ?? submitter?.name ?? 'Chưa gắn'} />
        <Info label="Người kiểm tra" value={reviewer?.full_name ?? reviewer?.name ?? 'Chưa gắn'} />
        <Info label="Deadline" value={item.due_date ? new Date(item.due_date).toLocaleDateString('vi-VN') : 'Chưa có'} />
        <Info label="Định dạng yêu cầu" value={item.required_format ?? 'Chưa ghi'} />
        <Info label="Bắt buộc" value={item.is_required ? 'Có' : 'Không'} />
        <Info label="Version được duyệt" value={item.approved_version_id ? 'Đã có' : 'Chưa có'} />
      </div>

      {item.description ? <div style={noteBlockStyle}>{item.description}</div> : null}

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Nộp file hoặc link</div>
        {workspaceId ? (
          <FileUpload
            workspaceId={workspaceId}
            projectId={item.project_id ?? undefined}
            taskId={item.task_id ?? undefined}
            deliverableId={item.id}
            compact
            label="Nộp file mới cho bàn giao này"
            onUploaded={onUploaded}
          />
        ) : (
          <div style={errorState}>Chưa xác định workspace nên chưa thể nộp file.</div>
        )}
      </section>

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Lịch sử version</div>
        {workspaceId ? (
          <FileList
            workspaceId={workspaceId}
            projectId={item.project_id ?? undefined}
            taskId={item.task_id ?? undefined}
            deliverableId={item.id}
            refreshKey={detail?.versions?.length ?? 0}
            peopleById={people}
            onChanged={onUploaded}
          />
        ) : null}
      </section>

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Review</div>
        <textarea
          value={reviewComment}
          onChange={(event) => onReviewComment(event.target.value)}
          placeholder="Nhận xét khi duyệt/yêu cầu sửa/đánh dấu thiếu thông tin..."
          style={textareaStyle}
        />
        <div style={actionRowStyle}>
          <button type="button" onClick={onMissing} disabled={busy} style={ghostButtonStyle}>Thiếu thông tin</button>
          <button type="button" onClick={onRevision} disabled={busy} style={dangerButtonStyle}>Yêu cầu sửa</button>
          <button type="button" onClick={onApprove} disabled={busy} style={primaryButtonStyle}>Duyệt</button>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Nhắc nộp file</div>
        <button type="button" onClick={onRemind} disabled={busy} style={ghostButtonStyle}>
          <i className="ti ti-send" /> Copy nội dung & mở Messenger
        </button>
        {pendingReminder ? (
          <div style={reminderBoxStyle}>
            <div style={noteBlockStyle}>{reminderMessage}</div>
            <div style={actionRowStyle}>
              <button type="button" onClick={() => onConfirmReminder(false)} disabled={busy} style={ghostButtonStyle}>Chưa gửi</button>
              <button type="button" onClick={() => onConfirmReminder(true)} disabled={busy} style={primaryButtonStyle}>Đã gửi</button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function CreateDeliverableForm({
  draft,
  onChange,
  people,
  projects,
  tasks,
  steps,
  error,
  busy,
  onSubmit,
}: {
  draft: CreateDraft
  onChange: (draft: CreateDraft) => void
  people: Array<{ id: string; full_name: string }>
  projects: CommandCenterProjectRow[]
  tasks: CommandCenterTaskRow[]
  steps: CommandCenterTaskStepRow[]
  error: string
  busy: boolean
  onSubmit: () => void
}) {
  const taskOptions = draft.projectId ? tasks.filter((task) => task.project_id === draft.projectId) : tasks
  const stepOptions = draft.taskId ? steps.filter((step) => step.task_id === draft.taskId) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error ? <div style={errorState}>{error}</div> : null}
      <Field label="Tên file/báo cáo cần nộp">
        <input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} style={inputStyle} />
      </Field>
      <Field label="Mô tả">
        <textarea value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} style={textareaStyle} />
      </Field>
      <div style={twoColStyle}>
        <Field label="Dự án">
          <select value={draft.projectId} onChange={(e) => onChange({ ...draft, projectId: e.target.value, taskId: '', stepId: '' })} style={inputStyle}>
            <option value="">Chưa gắn</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </Field>
        <Field label="Task">
          <select value={draft.taskId} onChange={(e) => onChange({ ...draft, taskId: e.target.value, stepId: '' })} style={inputStyle}>
            <option value="">Chưa gắn</option>
            {taskOptions.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Step">
        <select value={draft.stepId} onChange={(e) => onChange({ ...draft, stepId: e.target.value })} style={inputStyle}>
          <option value="">Không gắn step</option>
          {stepOptions.map((step) => <option key={step.id} value={step.id}>{step.title}</option>)}
        </select>
      </Field>
      <div style={twoColStyle}>
        <Field label="Người phải nộp">
          <select value={draft.submitterId} onChange={(e) => onChange({ ...draft, submitterId: e.target.value })} style={inputStyle}>
            <option value="">Tự lấy owner task nếu có</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
          </select>
        </Field>
        <Field label="Người kiểm tra">
          <select value={draft.reviewerId} onChange={(e) => onChange({ ...draft, reviewerId: e.target.value })} style={inputStyle}>
            <option value="">Chưa gắn</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
          </select>
        </Field>
      </div>
      <div style={twoColStyle}>
        <Field label="Deadline">
          <input type="date" value={draft.dueDate} onChange={(e) => onChange({ ...draft, dueDate: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="Định dạng yêu cầu">
          <input value={draft.requiredFormat} onChange={(e) => onChange({ ...draft, requiredFormat: e.target.value })} placeholder="PDF, Sheet, ZIP..." style={inputStyle} />
        </Field>
      </div>
      <label style={checkStyle}><input type="checkbox" checked={draft.isRequired} onChange={(e) => onChange({ ...draft, isRequired: e.target.checked })} /> Bắt buộc để hoàn thành task</label>
      <label style={checkStyle}><input type="checkbox" checked={draft.requiresApproval} onChange={(e) => onChange({ ...draft, requiresApproval: e.target.checked })} /> Cần người kiểm tra duyệt</label>
      <div style={actionRowStyle}>
        <button type="button" onClick={onSubmit} disabled={busy} style={primaryButtonStyle}>
          {busy ? 'Đang tạo...' : 'Tạo bàn giao'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoCellStyle}>
      <div style={fieldLabelStyle}>{label}</div>
      <div style={{ color: 'var(--color-text)', fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function MetricCard({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: 'danger' | 'warning' | 'success' | 'neutral' }) {
  const color = tone === 'danger' ? 'var(--color-danger)' : tone === 'warning' ? 'var(--color-warning)' : tone === 'success' ? 'var(--color-success)' : 'var(--color-text)'
  const bg = tone === 'danger' ? 'var(--color-danger-bg)' : tone === 'warning' ? 'var(--color-warning-bg)' : tone === 'success' ? 'var(--color-success-bg)' : 'var(--color-surface-2)'
  return (
    <div style={metricCard}>
      <div style={{ ...metricIcon, background: bg, color }}><i className={`ti ${icon}`} /></div>
      <div>
        <div style={metricValue}>{value}</div>
        <div style={metricLabel}>{label}</div>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = { padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }
const summaryGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-3)' }
const metricCard: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }
const metricIcon: React.CSSProperties = { width: 38, height: 38, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }
const metricValue: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 24, lineHeight: 1, fontWeight: 700, color: 'var(--color-text)' }
const metricLabel: React.CSSProperties = { marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)' }
const panelStyle: React.CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }
const panelHead: React.CSSProperties = { padding: '18px 20px 14px', borderBottom: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: '1fr minmax(220px, 360px)', gap: 16, alignItems: 'center' }
const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700 }
const panelTitle: React.CSSProperties = { marginTop: 4, fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }
const searchInputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', color: 'var(--color-text)' }
const filterRowStyle: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--color-border)' }
const filterButtonStyle = (active: boolean): React.CSSProperties => ({ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '7px 11px', fontSize: 12, fontWeight: 800, background: active ? 'var(--color-charcoal)' : 'var(--color-surface)', color: active ? '#fff' : 'var(--color-text-muted)' })
const listStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' }
const rowWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column' }
const rowHeader = (accent: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderLeft: `3px solid ${accent}` })
const fileIcon: React.CSSProperties = { width: 42, height: 42, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: 18, flexShrink: 0 }
const itemTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }
const itemMeta: React.CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: 11, color: 'var(--color-text-muted)' }
const badgeBase: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 700 }
const primaryButtonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(218,223,33,.4)', background: 'var(--color-lime)', color: 'var(--color-lime-ink)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }
const primarySmallButtonStyle: React.CSSProperties = { ...primaryButtonStyle, padding: '7px 10px' }
const ghostButtonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }
const dangerButtonStyle: React.CSSProperties = { ...ghostButtonStyle, color: 'var(--color-danger)', background: 'var(--color-danger-bg)', border: '1px solid rgba(184,64,64,.24)' }
const emptyState: React.CSSProperties = { padding: '38px 24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }
const errorState: React.CSSProperties = { padding: '12px 14px', color: 'var(--color-danger)', background: 'var(--color-danger-bg)', border: '1px solid rgba(184,64,64,0.18)', borderRadius: 'var(--radius-md)', fontSize: 13, lineHeight: 1.5 }
const detailHeroStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }
const detailTitleStyle: React.CSSProperties = { margin: '4px 0 0', fontSize: 22, fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }
const infoGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }
const infoCellStyle: React.CSSProperties = { background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }
const fieldLabelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }
const noteBlockStyle: React.CSSProperties = { background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 10, fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }
const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--color-border)', paddingTop: 14 }
const sectionTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: 'var(--color-text)' }
const textareaStyle: React.CSSProperties = { width: '100%', minHeight: 82, boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', color: 'var(--color-text)', padding: 10, resize: 'vertical', fontFamily: 'inherit' }
const actionRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }
const reminderBoxStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 10 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', color: 'var(--color-text)', padding: '9px 10px' }
const twoColStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }
const checkStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text)' }
