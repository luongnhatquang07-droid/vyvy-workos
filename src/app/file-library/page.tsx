'use client'

import React from 'react'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { FileList } from '@/components/ui/FileList'
import { FileUpload } from '@/components/ui/FileUpload'
import { useToast } from '@/components/feedback/Toast'
import { getVietnamDateKey } from '@/features/command-center/utils'
import { useCommandData } from '@/hooks/useCommandData'
import { normalizeVersionReviewStatus, versionReviewLabel, versionReviewTone } from '@/lib/deliverableVersionStatus'
import type {
  CommandCenterAttachmentRow,
  CommandCenterDeliverableRow,
  CommandCenterDeliverableVersionRow,
  CommandCenterPersonRow,
  CommandCenterProjectRow,
  CommandCenterTaskRow,
  CommandCenterTaskStepRow,
  CommandCenterWorkstreamRow,
} from '@/lib/database.types'

type FilterKey = 'all' | 'not_submitted' | 'submitted' | 'pending_review' | 'revision' | 'approved' | 'overdue'
type ScopeType = 'all' | 'project' | 'workstream' | 'task' | 'deliverable'
type LibraryScope = { type: ScopeType; id: string | null; label: string }
type DeliverableStatus = CommandCenterDeliverableRow['status']

interface DetailVersion extends CommandCenterDeliverableVersionRow {
  storageMode?: 'supabase' | 'external_url'
  attachment?: (CommandCenterAttachmentRow & { url?: string | null }) | null
}

interface DetailPayload {
  deliverable?: CommandCenterDeliverableRow
  versions?: DetailVersion[]
  error?: string
}

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'not_submitted', label: 'Chưa nộp' },
  { key: 'submitted', label: 'Đã nộp' },
  { key: 'pending_review', label: 'Chờ duyệt' },
  { key: 'revision', label: 'Yêu cầu sửa' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'overdue', label: 'Quá hạn' },
]

const STATUS_META: Record<DeliverableStatus | 'OVERDUE', { label: string; icon: string; color: string; bg: string }> = {
  REQUIRED: { label: 'Chưa nộp', icon: 'ti-circle-dashed', color: 'var(--color-text-muted)', bg: 'rgba(255,255,255,0.06)' },
  NOT_SUBMITTED: { label: 'Chưa nộp', icon: 'ti-circle-dashed', color: 'var(--color-text-muted)', bg: 'rgba(255,255,255,0.06)' },
  SUBMITTED: { label: 'Đã nộp', icon: 'ti-cloud-check', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  MISSING_INFORMATION: { label: 'Thiếu thông tin', icon: 'ti-alert-circle', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  REVISION_REQUIRED: { label: 'Yêu cầu sửa', icon: 'ti-rotate-clockwise', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  APPROVED: { label: 'Đã duyệt', icon: 'ti-rosette-check', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  OVERDUE: { label: 'Quá hạn', icon: 'ti-alert-triangle', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
}

export default function FileLibraryPage() {
  const { data, loading, error, refresh } = useCommandData()
  const { toast } = useToast()
  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [scope, setScope] = React.useState<LibraryScope>({ type: 'all', id: null, label: 'Tất cả dự án' })
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<DetailPayload | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [detailError, setDetailError] = React.useState('')
  const [submissionOpen, setSubmissionOpen] = React.useState(false)
  const searchRef = React.useRef<HTMLInputElement>(null)

  const workspaceId = data?.workspaceId
  const today = getVietnamDateKey()
  const people = React.useMemo(() => data?.people ?? [], [data?.people])
  const projects = React.useMemo(() => data?.projects ?? [], [data?.projects])
  const workstreams = React.useMemo(() => data?.workstreams ?? [], [data?.workstreams])
  const tasks = React.useMemo(() => data?.tasks ?? [], [data?.tasks])
  const steps = React.useMemo(() => data?.taskSteps ?? [], [data?.taskSteps])
  const deliverables = React.useMemo(() => data?.deliverables ?? [], [data?.deliverables])
  const versions = React.useMemo(() => data?.deliverableVersions ?? [], [data?.deliverableVersions])
  const attachments = React.useMemo(() => data?.attachments ?? [], [data?.attachments])

  const peopleById = React.useMemo(() => indexById(people), [people])
  const projectsById = React.useMemo(() => indexById(projects), [projects])
  const workstreamsById = React.useMemo(() => indexById(workstreams), [workstreams])
  const tasksById = React.useMemo(() => indexById(tasks), [tasks])
  const stepsById = React.useMemo(() => indexById(steps), [steps])
  const attachmentsById = React.useMemo(() => indexById(attachments), [attachments])

  const versionsByDeliverable = React.useMemo(() => {
    const grouped: Record<string, CommandCenterDeliverableVersionRow[]> = {}
    versions.forEach((version) => {
      grouped[version.deliverable_id] ??= []
      grouped[version.deliverable_id].push(version)
    })
    Object.values(grouped).forEach((items) => items.sort((a, b) => b.version_number - a.version_number))
    return grouped
  }, [versions])

  const selected = selectedId ? deliverables.find((item) => item.id === selectedId) ?? null : null

  const counts = React.useMemo(() => {
    return {
      all: deliverables.length,
      not_submitted: deliverables.filter((item) => isNotSubmitted(item)).length,
      submitted: deliverables.filter((item) => item.status === 'SUBMITTED').length,
      pending_review: deliverables.filter((item) => isPendingReview(item, versionsByDeliverable[item.id]?.[0])).length,
      revision: deliverables.filter((item) => isRevision(item, versionsByDeliverable[item.id]?.[0])).length,
      approved: deliverables.filter((item) => item.status === 'APPROVED').length,
      overdue: deliverables.filter((item) => isOverdue(item, today)).length,
    }
  }, [deliverables, today, versionsByDeliverable])

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return deliverables.filter((item) => {
      const latest = versionsByDeliverable[item.id]?.[0]
      const attachment = latest?.attachment_id ? attachmentsById[latest.attachment_id] : null
      if (!matchesScope(item, scope, tasksById)) return false
      if (!matchesFilter(item, filter, today, latest)) return false
      if (!normalized) return true

      const task = item.task_id ? tasksById[item.task_id] : null
      const step = item.step_id ? stepsById[item.step_id] : null
      const workstream = task?.workstream_id ? workstreamsById[task.workstream_id] : null
      const projectId = getDeliverableProjectId(item, tasksById)
      const project = projectId ? projectsById[projectId] : null
      const submitter = item.submitter_id ? peopleById[item.submitter_id] : null
      const fileName = getVersionFileName(latest, attachment, item)
      const haystack = [
        item.name,
        item.description,
        item.required_format,
        item.type,
        fileName,
        project?.name,
        workstream?.name,
        task?.title,
        step?.title,
        submitter?.full_name,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(normalized)
    })
  }, [
    attachmentsById,
    deliverables,
    filter,
    peopleById,
    projectsById,
    query,
    scope,
    stepsById,
    tasksById,
    today,
    versionsByDeliverable,
    workstreamsById,
  ])

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  React.useEffect(() => {
    if (selectedId && workspaceId) void loadDetail(selectedId)
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
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không tải được chi tiết file.')
      setDetail(payload)
    } catch (err) {
      setDetail(null)
      setDetailError(err instanceof Error ? err.message : 'Không tải được chi tiết file.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function refreshAll() {
    await refresh()
    if (selectedId) await loadDetail(selectedId)
  }

  function requireSelection(action: 'upload' | 'link') {
    if (!selectedId) {
      toast('Chọn một mục file/bàn giao trước khi thao tác.', 'warning')
      return
    }
    setSubmissionOpen(true)
    toast(action === 'link' ? 'Mở phần gắn link ở panel chi tiết.' : 'Mở phần upload ở panel chi tiết.', 'info')
  }

  function selectDeliverable(id: string) {
    setSelectedId(id)
    setSubmissionOpen(false)
    setDetail(null)
    setDetailError('')
  }

  function exportList() {
    const payload = filtered.map((item) => {
      const latest = versionsByDeliverable[item.id]?.[0]
      const attachment = latest?.attachment_id ? attachmentsById[latest.attachment_id] : null
      const task = item.task_id ? tasksById[item.task_id] : null
      const project = getDeliverableProjectId(item, tasksById)
      return {
        deliverableId: item.id,
        name: item.name,
        status: item.status,
        fileName: getVersionFileName(latest, attachment, item),
        version: latest?.version_number ?? null,
        project: project ? projectsById[project]?.name ?? null : null,
        task: task?.title ?? null,
        submitter: item.submitter_id ? peopleById[item.submitter_id]?.full_name ?? null : null,
        dueDate: item.due_date,
      }
    })
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), items: payload }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `vyvy-file-library-${today}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={pageStyle}>
      <style>{responsiveCss}</style>

      <header style={heroStyle} data-vyvy-card="true">
        <div style={heroTopStyle}>
          <div style={heroTitleWrapStyle}>
            <div style={heroIconStyle}><i className="ti ti-folders" /></div>
            <div>
              <h1 style={titleStyle} data-vyvy-type="true" suppressHydrationWarning>Kho file</h1>
              <p style={subtitleStyle}>Tìm tài liệu, báo cáo, ảnh chụp và link theo dự án, đầu việc.</p>
            </div>
          </div>
          <div style={actionGroupStyle}>
            <button type="button" onClick={() => requireSelection('link')} style={ghostButtonStyle}><i className="ti ti-link-plus" /> Gắn link</button>
            <button type="button" onClick={() => requireSelection('upload')} style={primaryButtonStyle}><i className="ti ti-cloud-upload" /> Upload file</button>
            <button type="button" onClick={exportList} style={ghostButtonStyle}><i className="ti ti-download" /> Xuất danh sách</button>
            <button type="button" onClick={() => void refreshAll()} style={iconButtonStyle} aria-label="Làm mới"><i className="ti ti-refresh" /></button>
          </div>
        </div>

        <div style={searchWrapStyle}>
          <i className="ti ti-search" style={searchIconStyle} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên file, dự án, đầu việc, người nộp, loại file..."
            style={searchInputStyle}
          />
          <span style={shortcutStyle}>Ctrl K</span>
        </div>
      </header>

      <div style={filterRowStyle}>
        {FILTERS.map((item) => (
          <button key={item.key} type="button" onClick={() => setFilter(item.key)} style={chipStyle(filter === item.key)}>
            <span>{item.label}</span>
            <b>{counts[item.key]}</b>
          </button>
        ))}
      </div>

      {error ? <DataErrorState message={error} /> : null}

      <div className="file-library-grid">
        <ProjectTree
          projects={projects}
          workstreams={workstreams}
          tasks={tasks}
          deliverables={deliverables}
          versionsByDeliverable={versionsByDeliverable}
          attachmentsById={attachmentsById}
          tasksById={tasksById}
          activeScope={scope}
          selectedId={selectedId}
          onScope={setScope}
          onSelect={selectDeliverable}
        />

        <section style={listPanelStyle} data-vyvy-card="true">
          <div style={panelHeadStyle}>
            <div>
              <div style={eyebrowStyle}>{scope.label}</div>
              <h2 style={panelTitleStyle}>Danh sách file</h2>
            </div>
            <div style={countPillStyle}>{loading ? 'Đang tải' : `${filtered.length} mục`}</div>
          </div>

          {loading ? (
            <EmptyBlock icon="ti-loader-2" title="Đang tải kho file" desc="Đang đọc dữ liệu thật từ workspace." />
          ) : filtered.length === 0 ? (
            <EmptyBlock icon="ti-folder-search" title="Không có file phù hợp" desc="Thử đổi bộ lọc, cây dự án hoặc từ khóa tìm kiếm." />
          ) : (
            <div style={fileListStyle}>
              {filtered.map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  today={today}
                  selected={item.id === selectedId}
                  latestVersion={versionsByDeliverable[item.id]?.[0] ?? null}
                  attachment={versionsByDeliverable[item.id]?.[0]?.attachment_id ? attachmentsById[versionsByDeliverable[item.id][0].attachment_id!] : null}
                  peopleById={peopleById}
                  projectsById={projectsById}
                  tasksById={tasksById}
                  stepsById={stepsById}
                  workstreamsById={workstreamsById}
                  onClick={() => selectDeliverable(item.id)}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="file-library-detail" style={detailPanelStyle} data-vyvy-card="true">
          <DetailPanel
            selected={selected}
            detail={detail}
            detailLoading={detailLoading}
            detailError={detailError}
            workspaceId={workspaceId}
            submissionOpen={submissionOpen}
            onToggleSubmission={() => setSubmissionOpen((value) => !value)}
            onUploaded={() => void refreshAll()}
            today={today}
            peopleById={peopleById}
            projectsById={projectsById}
            tasksById={tasksById}
            stepsById={stepsById}
            workstreamsById={workstreamsById}
            versionsByDeliverable={versionsByDeliverable}
            attachmentsById={attachmentsById}
          />
        </aside>
      </div>
    </div>
  )
}

function ProjectTree({
  projects,
  workstreams,
  tasks,
  deliverables,
  versionsByDeliverable,
  attachmentsById,
  tasksById,
  activeScope,
  selectedId,
  onScope,
  onSelect,
}: {
  projects: CommandCenterProjectRow[]
  workstreams: CommandCenterWorkstreamRow[]
  tasks: CommandCenterTaskRow[]
  deliverables: CommandCenterDeliverableRow[]
  versionsByDeliverable: Record<string, CommandCenterDeliverableVersionRow[]>
  attachmentsById: Record<string, CommandCenterAttachmentRow>
  tasksById: Record<string, CommandCenterTaskRow>
  activeScope: LibraryScope
  selectedId: string | null
  onScope: (scope: LibraryScope) => void
  onSelect: (deliverableId: string) => void
}) {
  const unlinkedDeliverables = deliverables.filter((item) => !getDeliverableProjectId(item, tasksById))

  return (
    <section style={treePanelStyle} data-vyvy-card="true">
      <div style={panelHeadCompactStyle}>
        <div>
          <div style={eyebrowStyle}>Cây dự án</div>
          <h2 style={panelTitleStyle}>Theo cấu trúc việc</h2>
        </div>
        <span style={countPillStyle}>{deliverables.length}</span>
      </div>

      <div style={treeScrollStyle}>
        <TreeButton
          icon="ti-layout-list"
          label="Tất cả dự án"
          count={deliverables.length}
          depth={0}
          active={activeScope.type === 'all'}
          onClick={() => onScope({ type: 'all', id: null, label: 'Tất cả dự án' })}
        />

        {projects.map((project) => {
          const projectDeliverables = deliverables.filter((item) => getDeliverableProjectId(item, tasksById) === project.id)
          const projectWorkstreams = workstreams.filter((workstream) => workstream.project_id === project.id)
          const ungroupedTasks = tasks.filter((task) => task.project_id === project.id && !task.workstream_id)
          return (
            <React.Fragment key={project.id}>
              <TreeButton
                icon="ti-folder"
                label={project.name}
                count={projectDeliverables.length}
                depth={1}
                active={activeScope.type === 'project' && activeScope.id === project.id}
                onClick={() => onScope({ type: 'project', id: project.id, label: project.name })}
              />
              {projectWorkstreams.map((workstream) => (
                <WorkstreamTree
                  key={workstream.id}
                  workstream={workstream}
                  tasks={tasks.filter((task) => task.workstream_id === workstream.id)}
                  deliverables={deliverables}
                  versionsByDeliverable={versionsByDeliverable}
                  attachmentsById={attachmentsById}
                  tasksById={tasksById}
                  activeScope={activeScope}
                  selectedId={selectedId}
                  onScope={onScope}
                  onSelect={onSelect}
                />
              ))}
              {ungroupedTasks.map((task) => (
                <TaskTree
                  key={task.id}
                  task={task}
                  deliverables={deliverables.filter((item) => item.task_id === task.id)}
                  versionsByDeliverable={versionsByDeliverable}
                  attachmentsById={attachmentsById}
                  activeScope={activeScope}
                  selectedId={selectedId}
                  onScope={onScope}
                  onSelect={onSelect}
                />
              ))}
            </React.Fragment>
          )
        })}

        {unlinkedDeliverables.length ? (
          <>
            <TreeButton
              icon="ti-folder-question"
              label="Chưa gắn dự án"
              count={unlinkedDeliverables.length}
              depth={1}
              active={false}
              onClick={() => onScope({ type: 'all', id: null, label: 'Chưa gắn dự án' })}
            />
            {unlinkedDeliverables.map((item) => (
              <DeliverableTreeItem
                key={item.id}
                item={item}
                latestVersion={versionsByDeliverable[item.id]?.[0] ?? null}
                attachment={versionsByDeliverable[item.id]?.[0]?.attachment_id ? attachmentsById[versionsByDeliverable[item.id][0].attachment_id!] : null}
                depth={2}
                selected={selectedId === item.id}
                onSelect={onSelect}
              />
            ))}
          </>
        ) : null}
      </div>
    </section>
  )
}

function WorkstreamTree(props: {
  workstream: CommandCenterWorkstreamRow
  tasks: CommandCenterTaskRow[]
  deliverables: CommandCenterDeliverableRow[]
  versionsByDeliverable: Record<string, CommandCenterDeliverableVersionRow[]>
  attachmentsById: Record<string, CommandCenterAttachmentRow>
  tasksById: Record<string, CommandCenterTaskRow>
  activeScope: LibraryScope
  selectedId: string | null
  onScope: (scope: LibraryScope) => void
  onSelect: (deliverableId: string) => void
}) {
  const count = props.deliverables.filter((item) => props.tasksById[item.task_id ?? '']?.workstream_id === props.workstream.id).length
  return (
    <>
      <TreeButton
        icon="ti-stack-2"
        label={props.workstream.name}
        count={count}
        depth={2}
        active={props.activeScope.type === 'workstream' && props.activeScope.id === props.workstream.id}
        onClick={() => props.onScope({ type: 'workstream', id: props.workstream.id, label: props.workstream.name })}
      />
      {props.tasks.map((task) => (
        <TaskTree
          key={task.id}
          task={task}
          deliverables={props.deliverables.filter((item) => item.task_id === task.id)}
          versionsByDeliverable={props.versionsByDeliverable}
          attachmentsById={props.attachmentsById}
          activeScope={props.activeScope}
          selectedId={props.selectedId}
          onScope={props.onScope}
          onSelect={props.onSelect}
        />
      ))}
    </>
  )
}

function TaskTree({
  task,
  deliverables,
  versionsByDeliverable,
  attachmentsById,
  activeScope,
  selectedId,
  onScope,
  onSelect,
}: {
  task: CommandCenterTaskRow
  deliverables: CommandCenterDeliverableRow[]
  versionsByDeliverable: Record<string, CommandCenterDeliverableVersionRow[]>
  attachmentsById: Record<string, CommandCenterAttachmentRow>
  activeScope: LibraryScope
  selectedId: string | null
  onScope: (scope: LibraryScope) => void
  onSelect: (deliverableId: string) => void
}) {
  return (
    <>
      <TreeButton
        icon="ti-list-check"
        label={task.title}
        count={deliverables.length}
        depth={3}
        active={activeScope.type === 'task' && activeScope.id === task.id}
        onClick={() => onScope({ type: 'task', id: task.id, label: task.title })}
      />
      {deliverables.map((item) => (
        <DeliverableTreeItem
          key={item.id}
          item={item}
          latestVersion={versionsByDeliverable[item.id]?.[0] ?? null}
          attachment={versionsByDeliverable[item.id]?.[0]?.attachment_id ? attachmentsById[versionsByDeliverable[item.id][0].attachment_id!] : null}
          depth={4}
          selected={selectedId === item.id}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

function DeliverableTreeItem({
  item,
  latestVersion,
  attachment,
  depth,
  selected,
  onSelect,
}: {
  item: CommandCenterDeliverableRow
  latestVersion: CommandCenterDeliverableVersionRow | null
  attachment: CommandCenterAttachmentRow | null
  depth: number
  selected: boolean
  onSelect: (deliverableId: string) => void
}) {
  const fileName = getVersionFileName(latestVersion, attachment, item)
  return (
    <>
      <TreeButton
        icon="ti-file-description"
        label={item.name}
        count={latestVersion ? latestVersion.version_number : 0}
        depth={depth}
        active={selected}
        onClick={() => onSelect(item.id)}
      />
      {latestVersion ? (
        <TreeButton
          icon={latestVersion.external_url ? 'ti-link' : fileIcon(fileName, attachment?.mime_type)}
          label={fileName}
          count={latestVersion.version_number}
          depth={depth + 1}
          active={selected}
          onClick={() => onSelect(item.id)}
          muted
        />
      ) : null}
    </>
  )
}

function TreeButton({
  icon,
  label,
  count,
  depth,
  active,
  muted,
  onClick,
}: {
  icon: string
  label: string
  count: number
  depth: number
  active: boolean
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} style={treeButtonStyle(depth, active, muted)}>
      <i className={`ti ${icon}`} />
      <span style={treeLabelStyle}>{label}</span>
      <span style={treeCountStyle(active)}>{count}</span>
    </button>
  )
}

function FileRow({
  item,
  today,
  selected,
  latestVersion,
  attachment,
  peopleById,
  projectsById,
  tasksById,
  stepsById,
  workstreamsById,
  onClick,
}: {
  item: CommandCenterDeliverableRow
  today: string
  selected: boolean
  latestVersion: CommandCenterDeliverableVersionRow | null
  attachment: CommandCenterAttachmentRow | null
  peopleById: Record<string, CommandCenterPersonRow>
  projectsById: Record<string, CommandCenterProjectRow>
  tasksById: Record<string, CommandCenterTaskRow>
  stepsById: Record<string, CommandCenterTaskStepRow>
  workstreamsById: Record<string, CommandCenterWorkstreamRow>
  onClick: () => void
}) {
  const task = item.task_id ? tasksById[item.task_id] : null
  const step = item.step_id ? stepsById[item.step_id] : null
  const projectId = getDeliverableProjectId(item, tasksById)
  const project = projectId ? projectsById[projectId] : null
  const workstream = task?.workstream_id ? workstreamsById[task.workstream_id] : null
  const submitter = item.submitter_id ? peopleById[item.submitter_id] : null
  const status = STATUS_META[isOverdue(item, today) ? 'OVERDUE' : item.status]
  const fileName = getVersionFileName(latestVersion, attachment, item)
  const fileType = latestVersion?.external_url ? 'Link ngoài' : fileTypeLabel(fileName, attachment?.mime_type)
  const reviewStatus = latestVersion ? normalizeVersionReviewStatus(latestVersion.review_status) : null
  const reviewTone = versionReviewTone(reviewStatus)

  return (
    <button type="button" onClick={onClick} style={fileRowStyle(selected)}>
      <div style={fileIconStyle(status.color)}>
        <i className={`ti ${latestVersion?.external_url ? 'ti-link' : fileIcon(fileName, attachment?.mime_type)}`} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={fileNameStyle}>{fileName}</div>
        <div style={fileSubStyle}>{item.name}</div>
        <div style={fileMetaStyle}>
          <span><i className="ti ti-folder" /> {project?.name ?? 'Chưa gắn dự án'}</span>
          {workstream ? <span><i className="ti ti-stack-2" /> {workstream.name}</span> : null}
          <span><i className="ti ti-list-check" /> {task?.title ?? 'Chưa gắn đầu việc'}</span>
          {step ? <span><i className="ti ti-route" /> {step.title}</span> : null}
          <span><i className="ti ti-user" /> {submitter?.full_name ?? 'Chưa gắn người nộp'}</span>
        </div>
      </div>
      <div style={rowSideStyle}>
        <span style={{ ...statusBadgeStyle, color: status.color, background: status.bg }}>
          <i className={`ti ${status.icon}`} /> {status.label}
        </span>
        <span style={rowTinyStyle}>
          {latestVersion ? `${fileType} · v${latestVersion.version_number}` : 'Chưa có version'}
          {attachment?.size_bytes ? ` · ${formatBytes(attachment.size_bytes)}` : ''}
        </span>
        <span style={{ ...rowTinyStyle, color: latestVersion ? reviewTone.color : 'var(--color-text-muted)' }}>
          {latestVersion ? versionReviewLabel(reviewStatus) : (item.due_date ? `Hạn ${formatDate(item.due_date)}` : 'Chưa có hạn')}
        </span>
      </div>
    </button>
  )
}

function DetailPanel({
  selected,
  detail,
  detailLoading,
  detailError,
  workspaceId,
  submissionOpen,
  onToggleSubmission,
  onUploaded,
  today,
  peopleById,
  projectsById,
  tasksById,
  stepsById,
  workstreamsById,
  versionsByDeliverable,
  attachmentsById,
}: {
  selected: CommandCenterDeliverableRow | null
  detail: DetailPayload | null
  detailLoading: boolean
  detailError: string
  workspaceId?: string
  submissionOpen: boolean
  onToggleSubmission: () => void
  onUploaded: () => void
  today: string
  peopleById: Record<string, CommandCenterPersonRow>
  projectsById: Record<string, CommandCenterProjectRow>
  tasksById: Record<string, CommandCenterTaskRow>
  stepsById: Record<string, CommandCenterTaskStepRow>
  workstreamsById: Record<string, CommandCenterWorkstreamRow>
  versionsByDeliverable: Record<string, CommandCenterDeliverableVersionRow[]>
  attachmentsById: Record<string, CommandCenterAttachmentRow>
}) {
  const peopleOptions = React.useMemo(
    () => Object.entries(peopleById).map(([id, person]) => ({ ...person, id })),
    [peopleById],
  )

  if (!selected) {
    return <EmptyBlock icon="ti-file-search" title="Chưa chọn file" desc="Chọn một mục trong danh sách để xem version, upload hoặc gắn link." compact />
  }

  const task = selected.task_id ? tasksById[selected.task_id] : null
  const step = selected.step_id ? stepsById[selected.step_id] : null
  const projectId = getDeliverableProjectId(selected, tasksById)
  const project = projectId ? projectsById[projectId] : null
  const workstream = task?.workstream_id ? workstreamsById[task.workstream_id] : null
  const submitter = selected.submitter_id ? peopleById[selected.submitter_id] : null
  const reviewer = selected.reviewer_id ? peopleById[selected.reviewer_id] : null
  const fallbackVersion = versionsByDeliverable[selected.id]?.[0] ?? null
  const fallbackAttachment = fallbackVersion?.attachment_id ? attachmentsById[fallbackVersion.attachment_id] : null
  const latestDetailVersion = detail?.versions?.[0] ?? null
  const status = STATUS_META[isOverdue(selected, today) ? 'OVERDUE' : selected.status]
  const latestName = getVersionFileName(latestDetailVersion ?? fallbackVersion, latestDetailVersion?.attachment ?? fallbackAttachment, selected)
  const latestMime = latestDetailVersion?.attachment?.mime_type ?? fallbackAttachment?.mime_type
  const latestTypeLabel = (latestDetailVersion ?? fallbackVersion)?.external_url ? 'Link ngoài' : fileTypeLabel(latestName, latestMime)

  return (
    <div style={detailWrapStyle}>
      <div style={detailTopStyle}>
        <div style={detailIconStyle(status.color)}>
          <i className={`ti ${latestDetailVersion?.external_url ? 'ti-link' : fileIcon(latestName, latestDetailVersion?.attachment?.mime_type ?? fallbackAttachment?.mime_type)}`} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={eyebrowStyle}>Chi tiết file</div>
          <h2 style={detailTitleStyle}>{latestName}</h2>
          <div style={detailSubStyle}>{selected.name}</div>
        </div>
      </div>

      <div style={detailBadgeRowStyle}>
        <span style={{ ...statusBadgeStyle, color: status.color, background: status.bg }}><i className={`ti ${status.icon}`} /> {status.label}</span>
        <span style={softBadgeStyle}>{latestTypeLabel}</span>
        {latestDetailVersion ?? fallbackVersion ? <span style={softBadgeStyle}>Version {(latestDetailVersion ?? fallbackVersion)?.version_number}</span> : null}
        {selected.is_required ? <span style={softBadgeStyle}>Bắt buộc</span> : null}
      </div>

      {detailError ? <div style={errorBlockStyle}>{detailError}</div> : null}
      {detailLoading ? <div style={loadingLineStyle}>Đang tải version...</div> : null}

      <section style={detailSectionStyle}>
        <div style={sectionTitleStyle}>Vị trí trong dự án</div>
        <InfoLine icon="ti-folder" label="Dự án" value={project?.name ?? 'Chưa gắn dự án'} />
        <InfoLine icon="ti-stack-2" label="Đầu việc lớn" value={workstream?.name ?? 'Chưa gắn'} />
        <InfoLine icon="ti-list-check" label="Đầu việc con" value={task?.title ?? 'Chưa gắn'} />
        <InfoLine icon="ti-route" label="Bước" value={step?.title ?? 'Không gắn step'} />
      </section>

      <section style={detailSectionStyle}>
        <div style={sectionTitleStyle}>Thông tin nộp</div>
        <InfoLine icon="ti-user" label="Người nộp" value={submitter?.full_name ?? 'Chưa gắn'} />
        <InfoLine icon="ti-user-check" label="Người duyệt" value={reviewer?.full_name ?? 'Chưa gắn'} />
        <InfoLine icon="ti-calendar-due" label="Deadline" value={selected.due_date ? formatDate(selected.due_date) : 'Chưa có'} />
        <InfoLine icon="ti-file-code" label="Định dạng" value={latestTypeLabel || selected.required_format || selected.type || 'Chưa ghi'} />
      </section>

      {selected.description ? (
        <section style={detailSectionStyle}>
          <div style={sectionTitleStyle}>Ghi chú</div>
          <p style={noteTextStyle}>{selected.description}</p>
        </section>
      ) : null}

      <section style={detailSectionStyle}>
        <button type="button" onClick={onToggleSubmission} style={sectionToggleStyle}>
          <span><i className="ti ti-cloud-upload" /> Nộp file hoặc gắn link</span>
          <i className={`ti ${submissionOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} />
        </button>
        {submissionOpen ? (
          workspaceId ? (
            <FileUpload
              workspaceId={workspaceId}
              projectId={selected.project_id ?? task?.project_id ?? undefined}
              taskId={selected.task_id ?? undefined}
              deliverableId={selected.id}
              compact
              label="Upload file mới vào kho"
              peopleOptions={peopleOptions}
              defaultApproverId={selected.reviewer_id ?? project?.owner_id ?? null}
              requiresApproval
              onUploaded={onUploaded}
            />
          ) : (
            <div style={errorBlockStyle}>Chưa xác định workspace nên chưa thể upload.</div>
          )
        ) : (
          <div style={mutedLineStyle}>Mở khi cần upload version mới hoặc gắn link ngoài.</div>
        )}
      </section>

      <section style={detailSectionStyle}>
        <div style={sectionTitleStyle}>Lịch sử version</div>
        {workspaceId ? (
          <FileList
            workspaceId={workspaceId}
            projectId={projectId ?? undefined}
            taskId={selected.task_id ?? undefined}
            deliverableId={selected.id}
            refreshKey={detail?.versions?.length ?? 0}
            peopleById={peopleById}
            reviewerId={selected.reviewer_id}
            requiresApproval
            onChanged={onUploaded}
          />
        ) : (
          <div style={mutedLineStyle}>Chưa xác định workspace nên chưa tải được lịch sử version.</div>
        )}
      </section>
    </div>
  )
}

function InfoLine({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={infoLineStyle}>
      <i className={`ti ${icon}`} />
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

function EmptyBlock({ icon, title, desc, compact }: { icon: string; title: string; desc: string; compact?: boolean }) {
  return (
    <div style={emptyBlockStyle(compact)}>
      <i className={`ti ${icon}`} />
      <strong>{title}</strong>
      <span>{desc}</span>
    </div>
  )
}

function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]))
}

function getDeliverableProjectId(item: CommandCenterDeliverableRow, tasksById: Record<string, CommandCenterTaskRow>) {
  return item.project_id ?? (item.task_id ? tasksById[item.task_id]?.project_id ?? null : null)
}

function matchesScope(item: CommandCenterDeliverableRow, scope: LibraryScope, tasksById: Record<string, CommandCenterTaskRow>) {
  if (scope.type === 'all') return true
  if (scope.type === 'deliverable') return item.id === scope.id
  const task = item.task_id ? tasksById[item.task_id] : null
  if (scope.type === 'project') return getDeliverableProjectId(item, tasksById) === scope.id
  if (scope.type === 'workstream') return task?.workstream_id === scope.id
  if (scope.type === 'task') return item.task_id === scope.id
  return true
}

function matchesFilter(
  item: CommandCenterDeliverableRow,
  filter: FilterKey,
  today: string,
  latestVersion?: CommandCenterDeliverableVersionRow | null,
) {
  if (filter === 'all') return true
  if (filter === 'not_submitted') return isNotSubmitted(item)
  if (filter === 'submitted') return item.status === 'SUBMITTED'
  if (filter === 'pending_review') return isPendingReview(item, latestVersion)
  if (filter === 'revision') return isRevision(item, latestVersion)
  if (filter === 'approved') return item.status === 'APPROVED'
  if (filter === 'overdue') return isOverdue(item, today)
  return true
}

function isNotSubmitted(item: CommandCenterDeliverableRow) {
  return item.status === 'REQUIRED' || item.status === 'NOT_SUBMITTED'
}

function isPendingReview(item: CommandCenterDeliverableRow, latestVersion?: CommandCenterDeliverableVersionRow | null) {
  const latestStatus = latestVersion ? normalizeVersionReviewStatus(latestVersion.review_status) : null
  return item.status === 'SUBMITTED' || latestStatus === 'PENDING' || latestStatus === 'PENDING_REVIEW'
}

function isRevision(item: CommandCenterDeliverableRow, latestVersion?: CommandCenterDeliverableVersionRow | null) {
  const latestStatus = latestVersion ? normalizeVersionReviewStatus(latestVersion.review_status) : null
  return item.status === 'REVISION_REQUIRED' || item.status === 'MISSING_INFORMATION' || latestStatus === 'REVISION_REQUESTED' || latestStatus === 'REJECTED'
}

function isOverdue(item: CommandCenterDeliverableRow, today: string) {
  return Boolean(item.due_date && item.due_date < today && !['SUBMITTED', 'APPROVED'].includes(item.status))
}

function getVersionFileName(
  version: CommandCenterDeliverableVersionRow | DetailVersion | null | undefined,
  attachment: CommandCenterAttachmentRow | DetailVersion['attachment'] | null | undefined,
  item: CommandCenterDeliverableRow,
) {
  return version?.external_url ?? attachment?.file_name ?? item.name
}

function fileIcon(name: string, mime?: string | null) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (mime?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext ?? '')) return 'ti-photo'
  if (['html', 'htm'].includes(ext ?? '') || mime?.includes('html') || mime?.includes('xhtml')) return 'ti-file-code'
  if (ext === 'pdf' || mime?.includes('pdf')) return 'ti-file-type-pdf'
  if (['doc', 'docx'].includes(ext ?? '') || mime?.includes('word')) return 'ti-file-type-doc'
  if (['xls', 'xlsx', 'csv'].includes(ext ?? '') || mime?.includes('excel') || mime?.includes('sheet')) return 'ti-file-type-xls'
  if (['zip', 'rar', '7z'].includes(ext ?? '')) return 'ti-file-zip'
  return 'ti-file'
}

function fileTypeLabel(name: string, mime?: string | null) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['html', 'htm'].includes(ext ?? '') || mime?.includes('html') || mime?.includes('xhtml')) return 'HTML'
  if (mime?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext ?? '')) return 'Ảnh'
  if (ext === 'pdf' || mime?.includes('pdf')) return 'PDF'
  if (['doc', 'docx'].includes(ext ?? '') || mime?.includes('word')) return 'Word'
  if (['xls', 'xlsx', 'csv'].includes(ext ?? '') || mime?.includes('excel') || mime?.includes('sheet')) return 'Excel/CSV'
  if (['zip', 'rar', '7z'].includes(ext ?? '')) return 'Nén'
  return ext ? ext.toUpperCase() : 'File'
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('vi-VN')
}

const pageStyle: React.CSSProperties = {
  minHeight: '100%',
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const heroStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-5)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0) 38%), var(--color-surface)',
  boxShadow: 'var(--shadow-premium)',
}

const heroTopStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  marginBottom: 'var(--space-4)',
}

const heroTitleWrapStyle: React.CSSProperties = { display: 'flex', gap: 'var(--space-3)', alignItems: 'center', minWidth: 0 }
const heroIconStyle: React.CSSProperties = { width: 44, height: 44, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-lime)', color: 'var(--color-lime-ink)', fontSize: 20, flexShrink: 0 }
const titleStyle: React.CSSProperties = { margin: 0, fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500, color: 'var(--color-text)', lineHeight: 1.15 }
const subtitleStyle: React.CSSProperties = { margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }
const actionGroupStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }
const primaryButtonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(218,223,33,.45)', background: 'var(--color-lime)', color: 'var(--color-lime-ink)', fontSize: 12, fontWeight: 800 }
const ghostButtonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text)', fontSize: 12, fontWeight: 800 }
const iconButtonStyle: React.CSSProperties = { width: 36, height: 36, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }
const searchWrapStyle: React.CSSProperties = { height: 48, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-2)', padding: '0 12px' }
const searchIconStyle: React.CSSProperties = { color: 'var(--color-text-muted)', fontSize: 18, flexShrink: 0 }
const searchInputStyle: React.CSSProperties = { flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'var(--color-text)', fontSize: 14 }
const shortcutStyle: React.CSSProperties = { flexShrink: 0, border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', padding: '3px 8px', fontSize: 11, fontFamily: 'var(--font-mono)' }
const filterRowStyle: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
const chipStyle = (active: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 'var(--radius-full)', border: `1px solid ${active ? 'rgba(218,223,33,.45)' : 'var(--color-border)'}`, background: active ? 'rgba(218,223,33,.12)' : 'var(--color-surface)', color: active ? 'var(--color-lime-d)' : 'var(--color-text-muted)', fontSize: 12, fontWeight: 800 })
const treePanelStyle: React.CSSProperties = { minHeight: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-premium)', overflow: 'hidden' }
const listPanelStyle: React.CSSProperties = { minHeight: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-premium)', overflow: 'hidden' }
const detailPanelStyle: React.CSSProperties = { minHeight: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-premium)', overflow: 'hidden', alignSelf: 'start', position: 'sticky', top: 16, maxHeight: 'calc(100vh - 96px)' }
const panelHeadStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--color-border)' }
const panelHeadCompactStyle: React.CSSProperties = { ...panelHeadStyle, padding: '15px 16px' }
const eyebrowStyle: React.CSSProperties = { fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 800 }
const panelTitleStyle: React.CSSProperties = { margin: '3px 0 0', fontSize: 16, fontWeight: 800, color: 'var(--color-text)' }
const countPillStyle: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '4px 9px', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }
const treeScrollStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 8px 14px', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }
const treeButtonStyle = (depth: number, active: boolean, muted?: boolean): React.CSSProperties => ({ width: '100%', minHeight: 30, display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto', alignItems: 'center', gap: 7, padding: `6px 8px 6px ${8 + depth * 13}px`, borderRadius: 'var(--radius-md)', background: active ? 'rgba(218,223,33,.12)' : 'transparent', color: active ? 'var(--color-lime-d)' : muted ? 'var(--color-text-muted)' : 'var(--color-text)', fontSize: muted ? 11 : 12, textAlign: 'left' })
const treeLabelStyle: React.CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }
const treeCountStyle = (active: boolean): React.CSSProperties => ({ color: active ? 'var(--color-lime-d)' : 'var(--color-text-muted)', fontSize: 10, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '1px 6px' })
const fileListStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, padding: 12, maxHeight: 'calc(100vh - 292px)', overflowY: 'auto' }
const fileRowStyle = (selected: boolean): React.CSSProperties => ({ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 13, borderRadius: 'var(--radius-lg)', border: `1px solid ${selected ? 'rgba(218,223,33,.38)' : 'var(--color-border)'}`, background: selected ? 'linear-gradient(180deg, rgba(218,223,33,.09), rgba(218,223,33,.025)), var(--color-surface-2)' : 'var(--color-surface-2)', textAlign: 'left' })
const fileIconStyle = (color: string): React.CSSProperties => ({ width: 42, height: 42, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color, fontSize: 19, flexShrink: 0 })
const fileNameStyle: React.CSSProperties = { color: 'var(--color-text)', fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const fileSubStyle: React.CSSProperties = { color: 'var(--color-text-muted)', fontSize: 12, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const fileMetaStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '7px 11px', marginTop: 8, color: 'var(--color-text-muted)', fontSize: 11 }
const rowSideStyle: React.CSSProperties = { flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, maxWidth: 150 }
const statusBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }
const rowTinyStyle: React.CSSProperties = { color: 'var(--color-text-muted)', fontSize: 11, textAlign: 'right' }
const detailWrapStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, padding: 16, maxHeight: 'calc(100vh - 96px)', overflowY: 'auto' }
const detailTopStyle: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start' }
const detailIconStyle = (color: string): React.CSSProperties => ({ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color, fontSize: 20 })
const detailTitleStyle: React.CSSProperties = { margin: '4px 0 0', color: 'var(--color-text)', fontSize: 20, fontFamily: 'var(--font-serif)', lineHeight: 1.2, overflowWrap: 'anywhere' }
const detailSubStyle: React.CSSProperties = { marginTop: 5, color: 'var(--color-text-muted)', fontSize: 12, lineHeight: 1.45 }
const detailBadgeRowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 7 }
const softBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 800 }
const detailSectionStyle: React.CSSProperties = { borderTop: '1px solid var(--color-border)', paddingTop: 13, display: 'flex', flexDirection: 'column', gap: 9 }
const sectionTitleStyle: React.CSSProperties = { color: 'var(--color-text)', fontSize: 13, fontWeight: 850 }
const infoLineStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '18px 84px minmax(0, 1fr)', gap: 8, alignItems: 'center', color: 'var(--color-text-muted)', fontSize: 12 }
const noteTextStyle: React.CSSProperties = { margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.6, fontSize: 12.5 }
const sectionToggleStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text)', fontSize: 13, fontWeight: 800 }
const mutedLineStyle: React.CSSProperties = { color: 'var(--color-text-muted)', fontSize: 12, lineHeight: 1.5 }
const loadingLineStyle: React.CSSProperties = { color: 'var(--color-text-muted)', fontSize: 12, padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)' }
const errorBlockStyle: React.CSSProperties = { color: 'var(--color-danger)', background: 'var(--color-danger-bg)', border: '1px solid rgba(184,64,64,.22)', borderRadius: 'var(--radius-md)', padding: 10, fontSize: 12, lineHeight: 1.5 }
const emptyBlockStyle = (compact?: boolean): React.CSSProperties => ({ minHeight: compact ? 260 : 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-text-muted)', textAlign: 'center', padding: 24 })

const responsiveCss = `
  .file-library-grid {
    display: grid;
    grid-template-columns: minmax(240px, 300px) minmax(420px, 1fr) minmax(320px, 380px);
    gap: var(--space-4);
    align-items: start;
  }
  @media (max-width: 1240px) {
    .file-library-grid {
      grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    }
    .file-library-detail {
      grid-column: 1 / -1;
      position: static !important;
      max-height: none !important;
    }
  }
  @media (max-width: 860px) {
    .file-library-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`
