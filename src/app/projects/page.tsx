'use client'

import React from 'react'
import { Drawer } from '@/components/feedback/Drawer'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { FileList } from '@/components/ui/FileList'
import { FileUpload } from '@/components/ui/FileUpload'
import { PageHead } from '@/components/ui/PageHead'
import { getVietnamDateKey } from '@/features/command-center/utils'
import { CommandDataProvider, useCommandData } from '@/hooks/useCommandData'
import type {
  CommandCenterDeliverableRow,
  CommandCenterMeetingRow,
  CommandCenterPersonRow,
  CommandCenterProjectRow,
  CommandCenterTaskStepRow,
  CommandCenterTaskRow,
  CommandCenterWorkstreamRow,
} from '@/lib/database.types'

type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'BLOCKED' | 'PENDING_APPROVAL' | 'REVISION_REQUIRED' | 'COMPLETED' | 'CANCELLED'
type ComposerMode = 'project' | 'workstream' | 'subtask' | 'meeting' | null
type ViewTab = 'overview' | 'kanban' | 'gantt' | 'meetings'
type StepTemplate = 'none' | 'basic' | 'approval'
type DetailSection = 'report' | 'files' | 'workflow' | 'deadline'

interface AttachmentItem {
  id: string
  name: string
  url: string | null
}

interface StepItem {
  id: string
  title: string
  description: string
  ownerId: string | null
  dueDate: string
  missingDueDate?: boolean
  status: TaskStatus
  note: string
  isRequired: boolean
  requiresDeliverable: boolean
  deliverableId: string | null
  deliverableStatus: CommandCenterDeliverableRow['status'] | null
}

interface StepDraft {
  title: string
  description: string
  ownerId: string
  dueDate: string
  status: TaskStatus
  isRequired: boolean
  requiresDeliverable: boolean
}

interface SubtaskItem {
  id: string
  sourceTaskId: string | null
  title: string
  ownerId: string | null
  supporterIds: string[]
  startDate: string
  dueDate: string
  missingStartDate?: boolean
  missingDueDate?: boolean
  status: TaskStatus
  reportText: string
  needsFile: boolean
  attachments: AttachmentItem[]
  deadlineHistory: Array<{ id: string; oldDate: string; newDate: string; reason: string }>
  steps: StepItem[]
}

interface WorkstreamItem {
  id: string
  title: string
  ownerId: string | null
  startDate: string
  dueDate: string
  status: TaskStatus
  subtasks: SubtaskItem[]
}

interface MeetingItem {
  id: string
  title: string
  schedule: string
  cadence: string
  recap: string
  filesNeeded: string
  links: string
}

interface ProjectWorkspace {
  id: string
  sourceProjectId: string | null
  name: string
  code: string
  ownerId: string | null
  startDate: string
  dueDate: string
  description: string
  workstreams: WorkstreamItem[]
  meetings: MeetingItem[]
}

interface ComposerDraft {
  name: string
  code: string
  description: string
  ownerId: string
  startDate: string
  dueDate: string
  cadence: string
  recap: string
  filesNeeded: string
  links: string
  needsFile: boolean
  stepTemplate: StepTemplate
}

interface DragDraft {
  level: 'project' | 'workstream' | 'subtask' | 'step'
  projectId: string
  workstreamId?: string
  subtaskId?: string
  stepId?: string
  oldDate: string
  newDate: string
}

const STATUS_META: Record<TaskStatus, { label: string; bg: string; color: string }> = {
  NOT_STARTED: { label: 'Chưa bắt đầu', bg: 'var(--surface-3)', color: 'var(--txt-2)' },
  IN_PROGRESS: { label: 'Đang làm', bg: 'var(--color-waiting-bg)', color: 'var(--color-waiting)' },
  WAITING: { label: 'Đang chờ', bg: 'rgba(107,138,153,0.16)', color: '#6B8A99' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  REVISION_REQUIRED: { label: 'Cần sửa', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' },
  COMPLETED: { label: 'Hoàn thành', bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
  BLOCKED: { label: 'Bị chặn', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' },
  CANCELLED: { label: 'Đã hủy', bg: 'var(--surface-3)', color: 'var(--txt-3)' },
}
const KANBAN_COLUMNS: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED']
const STEP_STATUSES: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PENDING_APPROVAL', 'REVISION_REQUIRED', 'COMPLETED']
const DAY_MS = 24 * 60 * 60 * 1000

export default function ProjectsPage() {
  return (
    <CommandDataProvider>
      <ProjectsPageContent />
    </CommandDataProvider>
  )
}

function ProjectsPageContent() {
  const { data, loading, error, refresh } = useCommandData()
  const people = React.useMemo(
    () => Object.fromEntries(((data?.people ?? []) as CommandCenterPersonRow[]).map((person) => [person.id, person])),
    [data?.people],
  )

  const [workspace, setWorkspace] = React.useState<ProjectWorkspace[]>([])
  const [ready, setReady] = React.useState(false)
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null)
  const [selectedSubtaskId, setSelectedSubtaskId] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState<ViewTab>('overview')
  const [composerMode, setComposerMode] = React.useState<ComposerMode>(null)
  const [composerParentId, setComposerParentId] = React.useState<string | null>(null)
  const [composerDraft, setComposerDraft] = React.useState<ComposerDraft>(createDraft())
  const [deadlineDraft, setDeadlineDraft] = React.useState<DragDraft | null>(null)
  const [deadlineReason, setDeadlineReason] = React.useState('')
  const [activeUploadStepId, setActiveUploadStepId] = React.useState<string | null>(null)
  const [openDetailSections, setOpenDetailSections] = React.useState<DetailSection[]>([])
  const [fileRefreshKey, setFileRefreshKey] = React.useState(0)

  React.useEffect(() => {
    if (loading) return

    const seeded = seedWorkspace(
      data?.projects ?? [],
      data?.tasks ?? [],
      data?.people ?? [],
      data?.workstreams ?? [],
      data?.taskSteps ?? [],
      data?.deliverables ?? [],
      data?.meetings ?? [],
    )
    queueMicrotask(() => {
      setWorkspace(seeded)
      setSelectedProjectId(seeded[0]?.id ?? null)
      setSelectedSubtaskId(null)
      setReady(true)
    })
  }, [data?.deliverables, data?.meetings, data?.people, data?.projects, data?.taskSteps, data?.tasks, data?.workstreams, loading])

  React.useEffect(() => {
    queueMicrotask(() => {
      setOpenDetailSections([])
      setActiveUploadStepId(null)
    })
  }, [selectedSubtaskId])

  function selectSubtask(subtaskId: string) {
    setSelectedSubtaskId((current) => (current === subtaskId ? null : subtaskId))
  }

  const selectedProject = workspace.find((project) => project.id === selectedProjectId) ?? workspace[0] ?? null
  const selectedSubtask = selectedProject ? findSubtask(selectedProject, selectedSubtaskId) : null
  const workspaceId = data?.workspaceId
  const activeUploadStep =
    selectedSubtask?.steps.find((step) => step.id === activeUploadStepId && step.deliverableId)
    ?? selectedSubtask?.steps.find((step) => step.requiresDeliverable && step.deliverableId)
    ?? null

  const metrics = React.useMemo(() => {
    const allWorkstreams = workspace.flatMap((project) => project.workstreams)
    const allSubtasks = allWorkstreams.flatMap((item) => item.subtasks)
    return {
      projects: workspace.length,
      workstreams: allWorkstreams.length,
      subtasks: allSubtasks.length,
      overdue: allSubtasks.filter((item) => isOverdue(item.dueDate, item.status)).length,
    }
  }, [workspace])

  function ensureSelection(nextWorkspace: ProjectWorkspace[]) {
    const nextProject = nextWorkspace.find((project) => project.id === selectedProjectId) ?? nextWorkspace[0] ?? null
    setSelectedProjectId(nextProject?.id ?? null)
    const nextSubtask = nextProject ? findSubtask(nextProject, selectedSubtaskId) : null
    setSelectedSubtaskId(nextSubtask?.id ?? null)
  }

  function updateWorkspace(mutator: (current: ProjectWorkspace[]) => ProjectWorkspace[]) {
    setWorkspace((current) => {
      const next = normalizeWorkspaceTree(mutator(current))
      ensureSelection(next)
      return next
    })
  }

  async function commitWorkspaceMutation(
    method: 'POST' | 'PATCH' | 'DELETE',
    body: Record<string, unknown>,
  ): Promise<{ id?: string; ok?: boolean } | null> {
    try {
      const response = await fetch('/api/workspace-items', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as { id?: string; ok?: boolean; error?: string }
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không cập nhật được database.')
      await refresh()
      return payload
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Không cập nhật được database.')
      await refresh()
      return null
    }
  }

  function toggleSubtaskSection(section: DetailSection) {
    setOpenDetailSections((current) => {
      if (current.includes(section)) return current.filter((item) => item !== section)
      const next = [...current, section]
      return next.length > 2 ? next.slice(next.length - 2) : next
    })
  }

  function openSubtaskSection(section: DetailSection) {
    setOpenDetailSections((current) => {
      if (current.includes(section)) return current
      const next = [...current, section]
      return next.length > 2 ? next.slice(next.length - 2) : next
    })
  }

  function openBlockedSection(subtask: SubtaskItem) {
    openSubtaskSection(getBlockedSection(subtask))
  }

  function openComposer(mode: ComposerMode, parentId?: string) {
    setComposerMode(mode)
    setComposerParentId(parentId ?? null)
    setComposerDraft(createDraft(selectedProject?.ownerId ?? null, selectedProject?.dueDate))
  }

  async function saveComposer() {
    if (!composerMode) return
    if (composerMode === 'project') {
      const result = await commitWorkspaceMutation('POST', {
        type: 'project',
        payload: composerDraft,
      })
      if (result?.id) {
        setSelectedProjectId(result.id)
        setSelectedSubtaskId(null)
      }
    }

    if (composerMode === 'workstream' && selectedProject) {
      await commitWorkspaceMutation('POST', {
        type: 'workstream',
        payload: {
          ...composerDraft,
          projectId: selectedProject.sourceProjectId ?? selectedProject.id,
        },
      })
    }

    if (composerMode === 'subtask' && selectedProject && composerParentId) {
      const result = await commitWorkspaceMutation('POST', {
        type: 'task',
        payload: {
          ...composerDraft,
          projectId: selectedProject.sourceProjectId ?? selectedProject.id,
          workstreamId: composerParentId,
        },
      })
      if (result?.id) {
        setSelectedSubtaskId(result.id)
      }
    }

    if (composerMode === 'meeting' && selectedProject) {
      await commitWorkspaceMutation('POST', {
        type: 'meeting',
        payload: {
          ...composerDraft,
          projectId: selectedProject.sourceProjectId ?? selectedProject.id,
          schedule: `${composerDraft.startDate} 10:00`,
        },
      })
      setActiveTab('meetings')
    }

    setComposerMode(null)
    setComposerParentId(null)
  }

  function updateSubtaskField<K extends keyof SubtaskItem>(field: K, value: SubtaskItem[K]) {
    if (!selectedProject || !selectedSubtask) return
    updateWorkspace((current) =>
      current.map((project) =>
        project.id !== selectedProject.id
          ? project
          : {
              ...project,
              workstreams: project.workstreams.map((workstream) => ({
                ...workstream,
                subtasks: workstream.subtasks.map((subtask) =>
                  subtask.id !== selectedSubtask.id ? subtask : { ...subtask, [field]: value },
                ),
              })),
            },
      ),
    )
  }

  function updateStep(subtaskId: string, stepId: string, patch: Partial<StepItem>) {
    if (!selectedProject) return
    updateWorkspace((current) =>
      current.map((project) =>
        project.id !== selectedProject.id
          ? project
          : {
              ...project,
              workstreams: project.workstreams.map((workstream) => ({
                ...workstream,
                subtasks: workstream.subtasks.map((subtask) =>
                  subtask.id !== subtaskId
                    ? subtask
                    : {
                        ...subtask,
                        status:
                          patch.status === 'COMPLETED' && subtask.steps.filter((step) => step.isRequired).every((step) => step.id === stepId || step.status === 'COMPLETED')
                            ? 'PENDING_APPROVAL'
                            : subtask.status,
                        steps: subtask.steps.map((step) => (step.id !== stepId ? step : { ...step, ...patch })),
                      },
                ),
              })),
            },
      ),
    )
    void commitWorkspaceMutation('PATCH', {
      type: 'step',
      id: stepId,
      patch: {
        title: patch.title,
        ownerId: patch.ownerId,
        dueDate: patch.dueDate,
        status: patch.status,
        description: patch.description ?? patch.note,
        isRequired: patch.isRequired,
        requiresDeliverable: patch.requiresDeliverable,
      },
    })
  }

  async function addStep(subtaskId: string, draft: StepDraft) {
    if (!selectedProject) return
    const subtask = findSubtask(selectedProject, subtaskId)
    if (subtask?.sourceTaskId) {
      await commitWorkspaceMutation('POST', {
        type: 'step',
        payload: {
          taskId: subtask.sourceTaskId,
          title: draft.title,
          description: draft.description,
          ownerId: draft.ownerId || null,
          dueDate: draft.dueDate,
          status: draft.status,
          isRequired: draft.isRequired,
          requiresDeliverable: draft.requiresDeliverable,
        },
      })
      return
    }
    updateWorkspace((current) =>
      current.map((project) =>
        project.id !== selectedProject.id
          ? project
          : {
              ...project,
              workstreams: project.workstreams.map((workstream) => ({
                ...workstream,
                subtasks: workstream.subtasks.map((subtask) =>
                  subtask.id !== subtaskId
                    ? subtask
                    : {
                        ...subtask,
                        steps: [
                          ...subtask.steps,
                          {
                            ...makeStep(draft.title, draft.ownerId || null, draft.dueDate),
                            description: draft.description,
                            note: draft.description,
                            status: draft.status,
                            isRequired: draft.isRequired,
                            requiresDeliverable: draft.requiresDeliverable,
                          },
                        ],
                      },
                ),
              })),
            },
      ),
    )
  }

  async function deleteProject(projectId: string) {
    const project = workspace.find((item) => item.id === projectId)
    if (!project || !window.confirm(`Xoa du an "${project.name}" va toan bo dau viec ben trong?`)) return
    await commitWorkspaceMutation('DELETE', { type: 'project', id: project.sourceProjectId ?? project.id })
  }

  async function deleteWorkstream(projectId: string, workstreamId: string) {
    const project = workspace.find((item) => item.id === projectId)
    const workstream = project?.workstreams.find((item) => item.id === workstreamId)
    if (!workstream || !window.confirm(`Xoa dau viec lon "${workstream.title}" va cac dau viec con ben trong?`)) return
    if (workstream.id.startsWith('ungrouped-')) {
      window.alert('Nhóm này được tạo tự động vì task chưa gắn đầu việc lớn. Hãy xóa hoặc chuyển từng đầu việc con.')
      return
    }
    await commitWorkspaceMutation('DELETE', { type: 'workstream', id: workstreamId })
    updateWorkspace((current) =>
      current.map((item) =>
        item.id !== projectId
          ? item
          : {
              ...item,
              workstreams: item.workstreams.filter((stream) => stream.id !== workstreamId),
            },
      ),
    )
  }

  async function deleteSubtask(projectId: string, subtaskId: string) {
    const project = workspace.find((item) => item.id === projectId)
    const subtask = project?.workstreams.flatMap((stream) => stream.subtasks).find((item) => item.id === subtaskId)
    if (!subtask || !window.confirm(`Xoa dau viec con "${subtask.title}"?`)) return
    await commitWorkspaceMutation('DELETE', { type: 'task', id: subtask.sourceTaskId ?? subtask.id })
    updateWorkspace((current) =>
      current.map((item) =>
        item.id !== projectId
          ? item
          : {
              ...item,
              workstreams: item.workstreams.map((stream) => ({
                ...stream,
                subtasks: stream.subtasks.filter((task) => task.id !== subtaskId),
              })),
            },
      ),
    )
  }

  async function deleteStep(subtaskId: string, stepId: string) {
    if (!selectedProject) return
    const step = selectedSubtask?.steps.find((item) => item.id === stepId)
    if (!step || !window.confirm(`Xoa buoc "${step.title}"?`)) return
    await commitWorkspaceMutation('DELETE', { type: 'step', id: stepId })
    updateWorkspace((current) =>
      current.map((project) =>
        project.id !== selectedProject.id
          ? project
          : {
              ...project,
              workstreams: project.workstreams.map((workstream) => ({
                ...workstream,
                subtasks: workstream.subtasks.map((subtask) =>
                  subtask.id !== subtaskId
                    ? subtask
                    : {
                        ...subtask,
                        steps: subtask.steps.filter((item) => item.id !== stepId),
                      },
                ),
              })),
            },
      ),
    )
  }

  function requestStatusChange(nextStatus: TaskStatus) {
    if (!selectedSubtask) return
    if (nextStatus === 'COMPLETED') {
      const blockers = getCompletionBlockers(selectedSubtask)
      if (blockers.length) {
        window.alert(`Chưa thể hoàn thành vì còn thiếu: ${blockers.join('; ')}.`)
        openBlockedSection(selectedSubtask)
        return
      }
    }
    if (requiresEvidence(nextStatus) && !hasEvidence(selectedSubtask)) {
      setActiveTab('overview')
      openSubtaskSection('files')
    }
    updateSubtaskField('status', nextStatus)
    void commitWorkspaceMutation('PATCH', {
      type: 'task',
      id: selectedSubtask.sourceTaskId ?? selectedSubtask.id,
      patch: { status: nextStatus },
    })
  }

  function handleBarShift(
    level: DragDraft['level'],
    projectId: string,
    workstreamId: string | undefined,
    subtaskId: string | undefined,
    stepId: string | undefined,
    oldDate: string,
    delta: number,
  ) {
    if (!delta) return
    setDeadlineDraft({
      level,
      projectId,
      workstreamId,
      subtaskId,
      stepId,
      oldDate,
      newDate: shiftDate(oldDate, delta),
    })
    setDeadlineReason('')
  }

  function applyDeadlineShift() {
    if (!deadlineDraft || !deadlineReason.trim()) return
    const patchTarget =
      deadlineDraft.level === 'project'
        ? { type: 'project', id: workspace.find((project) => project.id === deadlineDraft.projectId)?.sourceProjectId ?? deadlineDraft.projectId }
        : deadlineDraft.level === 'workstream'
          ? { type: 'workstream', id: deadlineDraft.workstreamId ?? '' }
          : deadlineDraft.level === 'step'
            ? { type: 'step', id: deadlineDraft.stepId ?? '' }
            : {
                type: 'task',
                id:
                  workspace
                    .find((project) => project.id === deadlineDraft.projectId)
                    ?.workstreams.flatMap((workstream) => workstream.subtasks)
                    .find((subtask) => subtask.id === deadlineDraft.subtaskId)?.sourceTaskId ?? deadlineDraft.subtaskId ?? '',
              }
    updateWorkspace((current) =>
      current.map((project) => {
        if (project.id !== deadlineDraft.projectId) return project
        if (deadlineDraft.level === 'project') {
          return { ...project, dueDate: deadlineDraft.newDate }
        }
        return {
          ...project,
          workstreams: project.workstreams.map((workstream) => {
            if (deadlineDraft.workstreamId && workstream.id !== deadlineDraft.workstreamId) return workstream
            if (deadlineDraft.level === 'workstream') {
              return { ...workstream, dueDate: deadlineDraft.newDate }
            }
            return {
              ...workstream,
              subtasks: workstream.subtasks.map((subtask) =>
                subtask.id !== deadlineDraft.subtaskId
                  ? subtask
                  : deadlineDraft.level === 'step'
                    ? {
                        ...subtask,
                        steps: subtask.steps.map((step) =>
                          step.id !== deadlineDraft.stepId ? step : { ...step, dueDate: deadlineDraft.newDate },
                        ),
                      }
                    : {
                        ...subtask,
                        dueDate: deadlineDraft.newDate,
                        deadlineHistory: [
                          {
                            id: makeId('history'),
                            oldDate: deadlineDraft.oldDate,
                            newDate: deadlineDraft.newDate,
                            reason: deadlineReason.trim(),
                          },
                          ...subtask.deadlineHistory,
                        ],
                      },
              ),
            }
          }),
        }
      }),
    )
    void commitWorkspaceMutation('PATCH', {
      ...patchTarget,
      patch: { dueDate: deadlineDraft.newDate, description: deadlineReason.trim() },
    })
    setDeadlineDraft(null)
    setDeadlineReason('')
  }

  function renderInlineSubtaskDetail(subtask: SubtaskItem) {
    if (!selectedProject || selectedSubtaskId !== subtask.id) return null

    return (
      <section data-vyvy-inline-subtask-detail="true" style={subtaskPanel}>
        <div style={subtaskPanelHead}>
          <div>
            <div style={eyebrow}>Chi tiáº¿t Ä‘áº§u viá»‡c con</div>
            <div style={sectionTitle}>{subtask.title}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <DangerButton icon="ti-trash" onClick={() => deleteSubtask(selectedProject.id, subtask.id)}>XÃ³a Ä‘áº§u viá»‡c con</DangerButton>
            <select value={subtask.status} onChange={(e) => requestStatusChange(e.target.value as TaskStatus)} style={selectStyle}>
              {Object.entries(STATUS_META).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
            <select
              value={subtask.ownerId ?? ''}
              onChange={(e) => updateSubtaskField('ownerId', e.target.value || null)}
              style={selectStyle}
            >
              <option value="">ChÆ°a gáº¯n ngÆ°á»i</option>
              {Object.values(people).map((person) => (
                <option key={person.id} value={person.id}>{person.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        <SubtaskCompactDetail
          subtask={subtask}
          project={selectedProject}
          people={people}
          workspaceId={workspaceId}
          activeUploadStep={activeUploadStep}
          openSections={openDetailSections}
          fileRefreshKey={fileRefreshKey}
          onToggleSection={toggleSubtaskSection}
          onOpenBlockedSection={() => openBlockedSection(subtask)}
          onUpdateReport={(value) => updateSubtaskField('reportText', value)}
          onUpdateAttachments={(attachments) => updateSubtaskField('attachments', attachments)}
          onFilesChanged={() => {
            setFileRefreshKey((value) => value + 1)
            void refresh()
          }}
          onUpdateStep={(stepId, patch) => updateStep(subtask.id, stepId, patch)}
          onDeleteStep={(stepId) => deleteStep(subtask.id, stepId)}
          onAddStep={(draft) => addStep(subtask.id, draft)}
          onUploadForStep={(stepId) => {
            setActiveUploadStepId(stepId)
            openSubtaskSection('files')
          }}
        />
      </section>
    )
  }

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-folders"
        title="Dự án"
        desc="Quản lý theo 4 tầng: dự án → đầu việc lớn → đầu việc con → các bước hoàn thành, kèm họp, file và kéo deadline."
        actions={
          <>
            <GhostButton icon="ti-calendar-week" onClick={() => setActiveTab('gantt')}>Timeline / Gantt</GhostButton>
            <PrimaryButton icon="ti-plus" onClick={() => openComposer('project')}>Tạo dự án</PrimaryButton>
          </>
        }
      />

      {error ? <DataErrorState message={error} /> : null}

      <div style={metricGrid}>
        <Metric icon="ti-folders" label="Dự án" value={metrics.projects} />
        <Metric icon="ti-stack-2" label="Đầu việc lớn" value={metrics.workstreams} />
        <Metric icon="ti-list-check" label="Đầu việc con" value={metrics.subtasks} />
        <Metric icon="ti-alert-triangle" label="Trễ hạn" value={metrics.overdue} danger />
      </div>

      {!ready || loading ? (
        <section style={sectionCard}><div style={loadingState}>Đang tải workspace dự án...</div></section>
      ) : workspace.length === 0 ? (
        <section style={sectionCard}><div style={loadingState}>Chưa có dự án. Bấm “Tạo dự án” để bắt đầu.</div></section>
      ) : (
        <div style={workspaceLayout}>
          <aside style={projectRail}>
            <div style={railHeader}>
              <div>
                <div style={eyebrow}>Danh sách dự án</div>
                <div style={sectionTitle}>Bấm để mở workspace</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {workspace.map((project) => {
                const progress = getProjectProgress(project)
                return (
                  <button
                    key={project.id}
                    data-vyvy-card="true"
                    onClick={() => {
                      setSelectedProjectId(project.id)
                      setSelectedSubtaskId(null)
                    }}
                    style={projectCardStyle(project.id === selectedProject?.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={projectNameStyle}>{project.name}</div>
                        <div style={mutedMetaStyle}>{project.code} · {project.workstreams.length} đầu việc lớn</div>
                      </div>
                      <span style={progressBadgeStyle}>{progress}%</span>
                    </div>
                    <div style={progressTrack}><span data-vyvy-bar="true" style={{ ...progressFill, width: `${progress}%` }} /></div>
                    <div style={inlineMetaStyle}>
                      <span>{project.workstreams.flatMap((item) => item.subtasks).length} đầu việc con</span>
                      <span>{toShortDate(project.dueDate)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>

          {selectedProject ? (
            <div style={workspaceMainLayout}>
              <section style={detailShell}>
              <div style={detailHeader}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={detailTitleRow}>
                    <h2 style={projectHeadline}>{selectedProject.name}</h2>
                    <span style={statusChipStyle(projectHealth(selectedProject).bg, projectHealth(selectedProject).color)}>
                      {projectHealth(selectedProject).label}
                    </span>
                    <span style={progressBadgeStyle}>{getProjectProgress(selectedProject)}%</span>
                  </div>
                  <div style={detailMeta}>
                    <span>{people[selectedProject.ownerId ?? '']?.full_name ?? 'Chưa gắn chủ dự án'}</span>
                    <span>Deadline {toShortDate(selectedProject.dueDate)}</span>
                    <span>{selectedProject.workstreams.length} đầu việc lớn</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <GhostButton icon="ti-stack-2" onClick={() => openComposer('workstream')}>Tạo đầu việc lớn</GhostButton>
                  <GhostButton icon="ti-microphone-2" onClick={() => openComposer('meeting')}>Tạo cuộc họp</GhostButton>
                  <DangerButton icon="ti-trash" onClick={() => deleteProject(selectedProject.id)}>Xóa dự án</DangerButton>
                  <PrimaryButton
                    icon="ti-plus"
                    onClick={() => openComposer('subtask', selectedProject.workstreams[0]?.id)}
                    disabled={!selectedProject.workstreams.length}
                  >
                    Tạo đầu việc con
                  </PrimaryButton>
                </div>
              </div>

              <div style={tabRow}>
                {[
                  { key: 'overview', label: 'Tổng quan' },
                  { key: 'kanban', label: 'Kanban' },
                  { key: 'gantt', label: 'Timeline / Gantt' },
                  { key: 'meetings', label: 'Cuộc họp' },
                ].map((tab) => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key as ViewTab)} style={tabStyle(activeTab === tab.key)}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' ? (
                <OverviewTab
                  project={selectedProject}
                  people={people}
                  selectedSubtaskId={selectedSubtaskId}
                  onSelectSubtask={selectSubtask}
                  renderSubtaskDetail={renderInlineSubtaskDetail}
                  onOpenSubtaskComposer={(workstreamId) => openComposer('subtask', workstreamId)}
                  onDeleteWorkstream={(workstreamId) => deleteWorkstream(selectedProject.id, workstreamId)}
                />
              ) : null}

              {activeTab === 'kanban' ? (
                <KanbanTab
                  project={selectedProject}
                  people={people}
                  onSelectSubtask={selectSubtask}
                  selectedSubtaskId={selectedSubtaskId}
                  renderSubtaskDetail={renderInlineSubtaskDetail}
                />
              ) : null}

              {activeTab === 'gantt' ? (
                <GanttTab project={selectedProject} onShift={handleBarShift} />
              ) : null}

              {activeTab === 'meetings' ? (
                <MeetingsTab project={selectedProject} />
              ) : null}


              </section>
            </div>
          ) : null}
        </div>
      )}

      {composerMode ? (
        <ModalShell
          title={composerTitle(composerMode)}
          onClose={() => setComposerMode(null)}
          onSubmit={saveComposer}
          submitLabel="Lưu"
        >
          <div style={formGrid}>
            <Field label={composerMode === 'meeting' ? 'Tên cuộc họp' : 'Tên'}>
              <input value={composerDraft.name} onChange={(e) => setComposerDraft((current) => ({ ...current, name: e.target.value }))} style={inputStyle} />
            </Field>

            {composerMode === 'project' ? (
              <Field label="Mã dự án">
                <input value={composerDraft.code} onChange={(e) => setComposerDraft((current) => ({ ...current, code: e.target.value }))} style={inputStyle} />
              </Field>
            ) : null}

            <Field label="Người phụ trách">
              <select value={composerDraft.ownerId} onChange={(e) => setComposerDraft((current) => ({ ...current, ownerId: e.target.value }))} style={inputStyle}>
                <option value="">Chưa gắn người</option>
                {Object.values(people).map((person) => (
                  <option key={person.id} value={person.id}>{person.full_name}</option>
                ))}
              </select>
            </Field>

            <Field label="Ngày bắt đầu">
              <input type="date" value={composerDraft.startDate} onChange={(e) => setComposerDraft((current) => ({ ...current, startDate: e.target.value }))} style={inputStyle} />
            </Field>

            <Field label="Deadline">
              <input type="date" value={composerDraft.dueDate} onChange={(e) => setComposerDraft((current) => ({ ...current, dueDate: e.target.value }))} style={inputStyle} />
            </Field>

            {composerMode === 'subtask' ? (
              <>
                <Field label="Mẫu quy trình">
                  <select
                    value={composerDraft.stepTemplate}
                    onChange={(e) => setComposerDraft((current) => ({ ...current, stepTemplate: e.target.value as StepTemplate }))}
                    style={inputStyle}
                  >
                    <option value="none">Không tạo bước</option>
                    <option value="basic">Mẫu cơ bản: Nhận việc → Thực hiện → Nộp kết quả</option>
                    <option value="approval">Mẫu có duyệt: Nhận việc → Thực hiện → Nộp file → Chờ duyệt</option>
                  </select>
                </Field>
                <Field label="Bắt buộc có file kết quả">
                  <label style={toggleWrap}>
                    <input type="checkbox" checked={composerDraft.needsFile} onChange={(e) => setComposerDraft((current) => ({ ...current, needsFile: e.target.checked }))} />
                    <span>Có</span>
                  </label>
                </Field>
              </>
            ) : null}
          </div>

          {composerMode === 'meeting' ? (
            <>
              <Field label="Nhịp họp">
                <input value={composerDraft.cadence} onChange={(e) => setComposerDraft((current) => ({ ...current, cadence: e.target.value }))} placeholder="VD: Thứ 7 hằng tuần lúc 10:00" style={inputStyle} />
              </Field>
              <Field label="RECAP cuộc họp trước">
                <textarea value={composerDraft.recap} onChange={(e) => setComposerDraft((current) => ({ ...current, recap: e.target.value }))} style={textareaStyle} />
              </Field>
              <Field label="File cần chuẩn bị">
                <textarea value={composerDraft.filesNeeded} onChange={(e) => setComposerDraft((current) => ({ ...current, filesNeeded: e.target.value }))} style={textareaStyle} />
              </Field>
              <Field label="Link liên quan">
                <textarea value={composerDraft.links} onChange={(e) => setComposerDraft((current) => ({ ...current, links: e.target.value }))} style={textareaStyle} />
              </Field>
            </>
          ) : (
            <Field label="Mô tả">
              <textarea value={composerDraft.description} onChange={(e) => setComposerDraft((current) => ({ ...current, description: e.target.value }))} style={textareaStyle} />
            </Field>
          )}
        </ModalShell>
      ) : null}

      {deadlineDraft ? (
        <ModalShell
          title="Lý do dời deadline"
          onClose={() => setDeadlineDraft(null)}
          onSubmit={applyDeadlineShift}
          submitLabel="Xác nhận dời lịch"
          submitDisabled={!deadlineReason.trim()}
        >
          <div style={mutedMetaStyle}>
            Deadline cũ {toShortDate(deadlineDraft.oldDate)} → deadline mới {toShortDate(deadlineDraft.newDate)}
          </div>
          <Field label="Lý do của người phụ trách">
            <textarea value={deadlineReason} onChange={(e) => setDeadlineReason(e.target.value)} placeholder="Ghi rõ lý do dời deadline, vướng mắc và cam kết mới..." style={textareaStyle} />
          </Field>
        </ModalShell>
      ) : null}
    </div>
  )
}

function SubtaskCompactDetail({
  subtask,
  project,
  people,
  workspaceId,
  activeUploadStep,
  openSections,
  fileRefreshKey,
  onToggleSection,
  onOpenBlockedSection,
  onUpdateReport,
  onUpdateAttachments,
  onFilesChanged,
  onUpdateStep,
  onDeleteStep,
  onAddStep,
  onUploadForStep,
}: {
  subtask: SubtaskItem
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  workspaceId?: string
  activeUploadStep: StepItem | null
  openSections: DetailSection[]
  fileRefreshKey: number
  onToggleSection: (section: DetailSection) => void
  onOpenBlockedSection: () => void
  onUpdateReport: (value: string) => void
  onUpdateAttachments: (attachments: AttachmentItem[]) => void
  onFilesChanged: () => void
  onUpdateStep: (stepId: string, patch: Partial<StepItem>) => void
  onDeleteStep: (stepId: string) => void
  onAddStep: (draft: StepDraft) => void
  onUploadForStep: (stepId: string) => void
}) {
  const blockers = getCompletionBlockers(subtask)
  const workflowSummary = getWorkflowSummary(subtask)
  const fileSummary = getFileSummary(subtask)
  const deadlineSummary = getDeadlineSummary(subtask)
  const peopleById = React.useMemo(
    () => Object.fromEntries(Object.values(people).map((person) => [person.id, { full_name: person.full_name }])),
    [people],
  )

  return (
    <div style={compactDetailStack}>
      <div style={subtaskMetaGrid}>
        <div style={compactMetaCard}>
          <span style={fieldLabel}>Owner</span>
          <strong>{people[subtask.ownerId ?? '']?.full_name ?? 'Chưa gắn người'}</strong>
        </div>
        <div style={compactMetaCard}>
          <span style={fieldLabel}>Deadline</span>
          <strong>{subtask.dueDate ? toShortDate(subtask.dueDate) : 'Chưa có'}</strong>
        </div>
        <div style={compactMetaCard}>
          <span style={fieldLabel}>Progress</span>
          <div style={progressBigRow}>
            <div style={progressTrack}>
              <span data-vyvy-bar="true" style={{ ...progressFill, width: `${getSubtaskProgress(subtask)}%` }} />
            </div>
            <span style={progressBadgeStyle}>{getSubtaskProgress(subtask)}%</span>
          </div>
        </div>
      </div>

      {blockers.length ? (
        <div style={compactWarningBanner}>
          <div>
            <strong>Chưa thể hoàn thành:</strong> {getCompactBlockerText(subtask)}
          </div>
          <button type="button" onClick={onOpenBlockedSection} style={warningActionButton}>
            Mở phần cần xử lý
          </button>
        </div>
      ) : null}

      <div style={summaryCardGrid}>
        <SummaryCard
          icon="ti-list-check"
          title="Quy trình"
          value={workflowSummary.value}
          hint={workflowSummary.hint}
          tone={workflowSummary.tone}
          active={openSections.includes('workflow')}
          onClick={() => onToggleSection('workflow')}
        />
        <SummaryCard
          icon="ti-paperclip"
          title="File/Báo cáo"
          value={fileSummary.value}
          hint={fileSummary.hint}
          tone={fileSummary.tone}
          active={openSections.includes('files')}
          badge={fileSummary.badge}
          onClick={() => onToggleSection('files')}
        />
        <SummaryCard
          icon="ti-calendar-time"
          title="Deadline"
          value={deadlineSummary.value}
          hint={deadlineSummary.hint}
          tone={deadlineSummary.tone}
          active={openSections.includes('deadline')}
          onClick={() => onToggleSection('deadline')}
        />
      </div>

      <div style={accordionStack}>
        <AccordionSection
          id="report"
          title="Báo cáo / cập nhật kết quả"
          summary={subtask.reportText.trim() ? 'Đã có báo cáo' : 'Chưa có cập nhật'}
          open={openSections.includes('report')}
          onToggle={() => onToggleSection('report')}
        >
          <textarea
            value={subtask.reportText}
            onChange={(event) => onUpdateReport(event.target.value)}
            placeholder="Nhập báo cáo, kết quả, khó khăn, phần cần hỗ trợ..."
            style={textareaStyle}
          />
          <div style={accordionActionRow}>
            <button type="button" onClick={() => onUpdateReport(subtask.reportText)} style={smallPrimaryButton}>
              Lưu cập nhật
            </button>
          </div>
        </AccordionSection>

        <AccordionSection
          id="files"
          title="File / bàn giao"
          summary={fileSummary.value}
          badge={fileSummary.badge}
          open={openSections.includes('files')}
          onToggle={() => onToggleSection('files')}
        >
          <div style={fieldLabel}>
            {activeUploadStep ? `Upload file cho bước: ${activeUploadStep.title}` : 'Upload file kết quả'}
          </div>
          <FileUpload
            workspaceId={workspaceId}
            projectId={project.sourceProjectId ?? undefined}
            taskId={subtask.sourceTaskId ?? undefined}
            deliverableId={activeUploadStep?.deliverableId ?? undefined}
            compact
            label="Tải file hoàn thành, báo cáo, ảnh chụp, tài liệu"
            onUploaded={(file) => {
              onUpdateAttachments([
                {
                  id: file.attachmentId ?? file.versionId ?? file.url ?? `${Date.now()}`,
                  name: file.fileName,
                  url: file.url,
                },
                ...subtask.attachments,
              ])
              onFilesChanged()
            }}
          />

          {activeUploadStep?.deliverableId ? (
            <FileList
              workspaceId={workspaceId}
              projectId={project.sourceProjectId ?? undefined}
              taskId={subtask.sourceTaskId ?? undefined}
              deliverableId={activeUploadStep.deliverableId}
              refreshKey={fileRefreshKey}
              peopleById={peopleById}
              onChanged={onFilesChanged}
            />
          ) : null}

          <div style={fieldLabel}>File đã gắn vào đầu việc</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {subtask.attachments.length === 0 ? (
              <div style={emptyInline}>Chưa có file nào. Nếu đầu việc cần bằng chứng, hãy upload ở trên.</div>
            ) : (
              subtask.attachments.map((file) => (
                <a key={file.id} href={file.url ?? '#'} target="_blank" rel="noreferrer" style={fileRowStyle}>
                  <i className="ti ti-paperclip" />
                  <span style={{ flex: 1, minWidth: 0 }}>{file.name}</span>
                  <i className="ti ti-external-link" />
                </a>
              ))
            )}
          </div>
        </AccordionSection>

        <AccordionSection
          id="workflow"
          title="Quy trình thực hiện"
          summary={workflowSummary.value}
          open={openSections.includes('workflow')}
          onToggle={() => onToggleSection('workflow')}
        >
          <StepWorkflowPanel
            key={subtask.id}
            subtask={subtask}
            people={people}
            onUpdateStep={onUpdateStep}
            onDeleteStep={onDeleteStep}
            onAddStep={onAddStep}
            onUploadForStep={onUploadForStep}
          />
        </AccordionSection>

        <AccordionSection
          id="deadline"
          title="Lịch sử deadline"
          summary={deadlineSummary.value}
          open={openSections.includes('deadline')}
          onToggle={() => onToggleSection('deadline')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {subtask.deadlineHistory.length === 0 ? (
              <div style={emptyInline}>Chưa có lần dời deadline nào.</div>
            ) : (
              subtask.deadlineHistory.map((entry) => (
                <div key={entry.id} style={historyRowStyle}>
                  <div style={{ fontWeight: 700, color: 'var(--txt)' }}>
                    {toShortDate(entry.oldDate)} → {toShortDate(entry.newDate)}
                  </div>
                  <div style={mutedMetaStyle}>{entry.reason}</div>
                </div>
              ))
            )}
          </div>
        </AccordionSection>
      </div>
    </div>
  )
}

function SummaryCard({
  icon,
  title,
  value,
  hint,
  tone,
  active,
  badge,
  onClick,
}: {
  icon: string
  title: string
  value: string
  hint: string
  tone: 'neutral' | 'good' | 'warning' | 'danger'
  active: boolean
  badge?: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} style={summaryCardStyle(active, tone)}>
      <span style={summaryIconStyle(tone)}><i className={`ti ${icon}`} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={summaryTitleStyle}>{title}</span>
        <strong style={summaryValueStyle}>{value}</strong>
        <span style={summaryHintStyle}>{hint}</span>
      </span>
      {badge ? <span style={summaryBadgeStyle(tone)}>{badge}</span> : null}
    </button>
  )
}

function AccordionSection({
  title,
  summary,
  badge,
  open,
  onToggle,
  children,
}: {
  id: DetailSection
  title: string
  summary: string
  badge?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section style={accordionSectionStyle}>
      <button type="button" onClick={onToggle} style={accordionHeaderStyle}>
        <span style={accordionChevronStyle(open)}>
          <i className="ti ti-chevron-right" />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={accordionTitleStyle}>{title}</strong>
          <span style={accordionSummaryStyle}>{summary}</span>
        </span>
        {badge ? <span style={accordionBadgeStyle}>{badge}</span> : null}
      </button>
      {open ? <div style={accordionBodyStyle}>{children}</div> : null}
    </section>
  )
}

function StepWorkflowPanel({
  subtask,
  people,
  onUpdateStep,
  onDeleteStep,
  onAddStep,
  onUploadForStep,
}: {
  subtask: SubtaskItem
  people: Record<string, CommandCenterPersonRow>
  onUpdateStep: (stepId: string, patch: Partial<StepItem>) => void
  onDeleteStep: (stepId: string) => void
  onAddStep: (draft: StepDraft) => void
  onUploadForStep: (stepId: string) => void
}) {
  const [adding, setAdding] = React.useState(false)
  const [draft, setDraft] = React.useState<StepDraft>(() => createStepDraft(subtask))
  const blockers = getCompletionBlockers(subtask)

  function saveNewStep() {
    if (!draft.title.trim()) return
    onAddStep(draft)
    setDraft(createStepDraft(subtask))
    setAdding(false)
  }

  return (
    <section style={stepWorkflowShell}>
      <div style={stepWorkflowHeader}>
        <div>
          <div style={fieldLabel}>Quy trình thực hiện đầu việc con</div>
          <div style={mutedMetaStyle}>Các bước giúp theo dõi tiến độ và kiểm tra điều kiện hoàn thành đầu việc.</div>
        </div>
        <span style={progressBadgeStyle}>{getSubtaskProgress(subtask)}%</span>
      </div>

      <div style={stepTemplateNote}>
        Đây là mẫu bước mặc định nếu được chọn khi tạo đầu việc con. Bạn có thể sửa, xóa hoặc thêm bước mới.
      </div>

      <div style={stepProgressText}>{getSubtaskProgressText(subtask)}</div>

      {blockers.length ? (
        <div style={warningBanner}>Chưa thể hoàn thành vì còn thiếu: {blockers.join('; ')}.</div>
      ) : null}

      {subtask.steps.length === 0 ? (
        <div style={emptyInline}>Đầu việc con này chưa có bước. Bấm thêm bước để tạo quy trình theo dõi thật.</div>
      ) : (
        <div style={stepperList}>
          {subtask.steps.map((step, index) => (
            <StepCard
              key={step.id}
              index={index}
              step={step}
              people={people}
              onUpdate={(patch) => onUpdateStep(step.id, patch)}
              onDelete={() => onDeleteStep(step.id)}
              onUpload={() => onUploadForStep(step.id)}
            />
          ))}
        </div>
      )}

      {adding ? (
        <StepDraftForm
          draft={draft}
          people={people}
          submitLabel="Lưu bước"
          onChange={setDraft}
          onCancel={() => setAdding(false)}
          onSubmit={saveNewStep}
        />
      ) : (
        <GhostButton icon="ti-plus" onClick={() => {
          setDraft(createStepDraft(subtask))
          setAdding(true)
        }}>
          Thêm bước
        </GhostButton>
      )}
    </section>
  )
}

function StepCard({
  index,
  step,
  people,
  onUpdate,
  onDelete,
  onUpload,
}: {
  index: number
  step: StepItem
  people: Record<string, CommandCenterPersonRow>
  onUpdate: (patch: Partial<StepItem>) => void
  onDelete: () => void
  onUpload: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<StepDraft>(() => stepToDraft(step))

  const nextQuickStatus: TaskStatus =
    step.status === 'COMPLETED'
      ? 'IN_PROGRESS'
      : step.status === 'NOT_STARTED'
        ? 'IN_PROGRESS'
        : 'COMPLETED'

  function saveEdit() {
    if (!draft.title.trim()) return
    onUpdate({
      title: draft.title,
      description: draft.description,
      note: draft.description,
      ownerId: draft.ownerId || null,
      dueDate: draft.dueDate,
      status: draft.status,
      isRequired: draft.isRequired,
      requiresDeliverable: draft.requiresDeliverable,
    })
    setEditing(false)
  }

  return (
    <div style={stepperItem}>
      <div style={stepMarkerStyle(step.status)}>
        {step.status === 'COMPLETED' ? <i className="ti ti-check" /> : index + 1}
      </div>
      <div style={stepConnector} />
      <div style={stepCardStyle(step.status)}>
        <div style={stepCardHeader}>
          <div style={{ minWidth: 0 }}>
            <div style={stepTitleStyle}>{step.title}</div>
            <div style={stepDescriptionStyle}>{step.description || stepObjective(step)}</div>
          </div>
          <span style={statusChipStyle(STATUS_META[step.status].bg, STATUS_META[step.status].color)}>
            {STATUS_META[step.status].label}
          </span>
        </div>

        <div style={stepMetaGrid}>
          <span>Người phụ trách: <strong>{people[step.ownerId ?? '']?.full_name ?? 'Chưa gắn'}</strong></span>
          <span>Deadline: <strong>{step.dueDate ? toShortDate(step.dueDate) : 'Chưa có'}</strong></span>
          <span>Bắt buộc: <strong>{step.isRequired ? 'Có' : 'Không'}</strong></span>
          <span>File/báo cáo: <strong>{deliverableStatusLabel(step)}</strong></span>
        </div>

        {editing ? (
          <StepDraftForm
            draft={draft}
            people={people}
            submitLabel="Lưu thay đổi"
            onChange={setDraft}
            onCancel={() => setEditing(false)}
            onSubmit={saveEdit}
          />
        ) : (
          <div style={stepActionRow}>
            <GhostButton icon={step.status === 'COMPLETED' ? 'ti-rotate-clockwise' : nextQuickStatus === 'COMPLETED' ? 'ti-check' : 'ti-player-play'} onClick={() => onUpdate({ status: nextQuickStatus })}>
              {step.status === 'COMPLETED' ? 'Mở lại' : nextQuickStatus === 'COMPLETED' ? 'Đánh dấu xong' : 'Bắt đầu'}
            </GhostButton>
            {step.requiresDeliverable ? (
              <GhostButton icon="ti-upload" onClick={onUpload}>Tải file cho bước này</GhostButton>
            ) : null}
            <GhostButton icon="ti-pencil" onClick={() => setEditing(true)}>Sửa</GhostButton>
            <IconButton label="Xóa bước" icon="ti-trash" tone="danger" onClick={onDelete} />
          </div>
        )}
      </div>
    </div>
  )
}

function StepDraftForm({
  draft,
  people,
  submitLabel,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: StepDraft
  people: Record<string, CommandCenterPersonRow>
  submitLabel: string
  onChange: (draft: StepDraft) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div style={stepDraftForm}>
      <Field label="Tên bước">
        <input value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} style={inputStyle} />
      </Field>
      <Field label="Mô tả / mục tiêu">
        <textarea value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} style={textareaStyle} />
      </Field>
      <div style={stepEditGrid}>
        <Field label="Người phụ trách">
          <select value={draft.ownerId} onChange={(e) => onChange({ ...draft, ownerId: e.target.value })} style={inputStyle}>
            <option value="">Chưa gắn</option>
            {Object.values(people).map((person) => (
              <option key={person.id} value={person.id}>{person.full_name}</option>
            ))}
          </select>
        </Field>
        <Field label="Deadline">
          <input type="date" value={draft.dueDate} onChange={(e) => onChange({ ...draft, dueDate: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="Trạng thái">
          <select value={draft.status} onChange={(e) => onChange({ ...draft, status: e.target.value as TaskStatus })} style={inputStyle}>
            {STEP_STATUSES.map((status) => (
              <option key={status} value={status}>{STATUS_META[status].label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div style={stepToggleRow}>
        <label style={toggleWrap}>
          <input type="checkbox" checked={draft.isRequired} onChange={(e) => onChange({ ...draft, isRequired: e.target.checked })} />
          <span>Bước bắt buộc</span>
        </label>
        <label style={toggleWrap}>
          <input type="checkbox" checked={draft.requiresDeliverable} onChange={(e) => onChange({ ...draft, requiresDeliverable: e.target.checked })} />
          <span>Yêu cầu file/báo cáo</span>
        </label>
      </div>
      <div style={stepActionRow}>
        <PrimaryButton icon="ti-device-floppy" onClick={onSubmit}>{submitLabel}</PrimaryButton>
        <GhostButton icon="ti-x" onClick={onCancel}>Hủy</GhostButton>
      </div>
    </div>
  )
}

function OverviewTab({
  project,
  people,
  selectedSubtaskId,
  onSelectSubtask,
  renderSubtaskDetail,
  onOpenSubtaskComposer,
  onDeleteWorkstream,
}: {
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  selectedSubtaskId: string | null
  onSelectSubtask: (id: string) => void
  renderSubtaskDetail: (subtask: SubtaskItem) => React.ReactNode
  onOpenSubtaskComposer: (workstreamId: string) => void
  onDeleteWorkstream: (workstreamId: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {project.workstreams.map((workstream) => (
        <section key={workstream.id} style={workstreamCard}>
          <div style={workstreamHead}>
            <div>
              <div style={sectionTitle}>{workstream.title}</div>
              <div style={detailMeta}>
                <span>{people[workstream.ownerId ?? '']?.full_name ?? 'Chưa gắn người'}</span>
                <span>{workstream.subtasks.length} đầu việc con</span>
                <span>{getWorkstreamProgress(workstream)}%</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={miniProgressWrap}>
                <div style={progressTrack}><span data-vyvy-bar="true" style={{ ...progressFill, width: `${getWorkstreamProgress(workstream)}%` }} /></div>
                <span style={mutedMetaStyle}>{getWorkstreamProgress(workstream)}%</span>
              </div>
              <DangerButton icon="ti-trash" onClick={() => onDeleteWorkstream(workstream.id)}>Xóa đầu việc lớn</DangerButton>
              <GhostButton icon="ti-plus" onClick={() => onOpenSubtaskComposer(workstream.id)}>Thêm đầu việc con</GhostButton>
            </div>
          </div>

          {workstream.subtasks.length === 0 ? (
            <div style={emptyInline}>Đầu việc lớn này chưa có đầu việc con.</div>
          ) : (
            <div style={subtaskTable}>
              {workstream.subtasks.map((subtask) => (
                <div key={subtask.id} style={subtaskInlineItem}>
                <button
                  key={subtask.id}
                  data-vyvy-row="true"
                  onClick={() => onSelectSubtask(subtask.id)}
                  style={subtaskRowStyle(selectedSubtaskId === subtask.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={subtaskTitleStyle}>{subtask.title}</div>
                    <div style={mutedMetaStyle}>
                      {people[subtask.ownerId ?? '']?.full_name ?? 'Chưa gắn người'} · deadline {toShortDate(subtask.dueDate)}
                    </div>
                  </div>
                  <div style={rowRightMeta}>
                    <span style={statusChipStyle(STATUS_META[subtask.status].bg, STATUS_META[subtask.status].color)}>
                      {STATUS_META[subtask.status].label}
                    </span>
                    <span style={progressBadgeStyle}>{getSubtaskProgress(subtask)}%</span>
                  </div>
                </button>
                  {renderSubtaskDetail(subtask)}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

function KanbanTab({
  project,
  people,
  selectedSubtaskId,
  onSelectSubtask,
  renderSubtaskDetail,
}: {
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  selectedSubtaskId: string | null
  onSelectSubtask: (id: string) => void
  renderSubtaskDetail: (subtask: SubtaskItem) => React.ReactNode
}) {
  const subtasks = project.workstreams.flatMap((workstream) =>
    workstream.subtasks.map((subtask) => ({ ...subtask, workstreamTitle: workstream.title })),
  )

  return (
    <div style={kanbanGrid}>
      {KANBAN_COLUMNS.map((status) => {
        const items = subtasks.filter((subtask) => subtask.status === status)
        return (
          <section key={status} style={kanbanColumn}>
            <div style={kanbanHead}>
              <span>{STATUS_META[status].label}</span>
              <span style={progressBadgeStyle}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((subtask) => (
                <div key={subtask.id} style={subtaskInlineItem}>
                <button onClick={() => onSelectSubtask(subtask.id)} style={kanbanCard(selectedSubtaskId === subtask.id)}>
                  <div style={mutedMetaStyle}>{subtask.workstreamTitle}</div>
                  <div style={kanbanTitle}>{subtask.title}</div>
                  <div style={progressTrack}><span data-vyvy-bar="true" style={{ ...progressFill, width: `${getSubtaskProgress(subtask)}%` }} /></div>
                  <div style={inlineMetaStyle}>
                    <span>{people[subtask.ownerId ?? '']?.full_name ?? 'Chưa gắn người'}</span>
                    <span>{toShortDate(subtask.dueDate)}</span>
                  </div>
                </button>
                  {renderSubtaskDetail(subtask)}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

type GanttLevel = 'project' | 'workstream' | 'subtask' | 'step'
type GanttFilter = 'all' | 'overdue' | 'active' | 'waiting' | 'pending' | 'completed' | 'missing'

interface GanttItem {
  id: string
  level: GanttLevel
  title: string
  subtitle: string
  projectId: string
  workstreamId?: string
  subtaskId?: string
  stepId?: string
  startDate: string
  dueDate: string
  status: TaskStatus
  progress: number
  indent: number
  missingStartDate?: boolean
  missingDueDate?: boolean
}

function GanttTimelineTab({
  project,
  onShift,
}: {
  project: ProjectWorkspace
  onShift: (
    level: DragDraft['level'],
    projectId: string,
    workstreamId: string | undefined,
    subtaskId: string | undefined,
    stepId: string | undefined,
    oldDate: string,
    delta: number,
  ) => void
}) {
  const [filter, setFilter] = React.useState<GanttFilter>('all')
  const [selected, setSelected] = React.useState<GanttItem | null>(null)
  const today = getVietnamDateKey()
  const allRows = React.useMemo(() => buildGanttItems(project), [project])
  const visibleRows = allRows.filter((row) => {
    if (filter === 'overdue') return isOverdue(row.dueDate, row.status)
    if (filter === 'active') return row.status === 'IN_PROGRESS'
    if (filter === 'waiting') return row.status === 'WAITING' || row.status === 'BLOCKED'
    if (filter === 'pending') return row.status === 'PENDING_APPROVAL' || row.status === 'REVISION_REQUIRED'
    if (filter === 'completed') return row.status === 'COMPLETED'
    if (filter === 'missing') return row.missingDueDate || row.missingStartDate
    return true
  })
  const rows = visibleRows.length ? visibleRows : allRows
  const minStart = minDate([today, ...rows.map((row) => row.startDate)])
  const maxEnd = maxDate([today, ...rows.map((row) => row.dueDate)])
  const timelineStart = shiftDate(minStart, -2)
  const timelineEnd = shiftDate(maxEnd, 3)
  const totalDays = Math.max(dayDiff(timelineStart, timelineEnd) + 1, 1)
  const dayWidth = totalDays > 90 ? 26 : totalDays > 45 ? 34 : 44
  const timelineWidth = totalDays * dayWidth
  const tickStep = totalDays > 70 ? 7 : 1
  const ticks = Array.from({ length: Math.ceil(totalDays / tickStep) }, (_, index) => shiftDate(timelineStart, index * tickStep))
  const todayLeft = dayDiff(timelineStart, today) * dayWidth

  return (
    <section style={ganttShell}>
      <div style={ganttToolbar}>
        <div>
          <div style={sectionTitle}>Timeline / Gantt</div>
          <div style={mutedMetaStyle}>Kéo thanh để dời deadline. Khi thả ra app sẽ yêu cầu nhập lý do.</div>
        </div>
        <select value={filter} onChange={(event) => setFilter(event.target.value as GanttFilter)} style={selectStyle}>
          <option value="all">Tất cả</option>
          <option value="overdue">Quá hạn</option>
          <option value="active">Đang làm</option>
          <option value="waiting">Đang chờ / bị chặn</option>
          <option value="pending">Chờ duyệt / cần sửa</option>
          <option value="completed">Hoàn thành</option>
          <option value="missing">Thiếu ngày</option>
        </select>
      </div>

      <div style={ganttLegend}>
        <span><span style={legendDot('var(--color-lime)')} /> Hôm nay</span>
        <span><span style={legendDot('var(--color-success)')} /> Hoàn thành</span>
        <span><span style={legendDot('var(--color-warning)')} /> Chờ duyệt</span>
        <span><span style={legendDot('var(--color-danger)')} /> Quá hạn / bị chặn</span>
      </div>

      <div style={ganttScroll}>
        <div style={{ ...ganttGrid, gridTemplateColumns: `340px ${timelineWidth}px` }}>
          <div style={ganttCornerCell}>Hạng mục</div>
          <div style={{ ...ganttHeaderCell, width: timelineWidth }}>
            {ticks.map((tick) => (
              <span key={tick} style={{ ...ganttTick, left: dayDiff(timelineStart, tick) * dayWidth, width: tickStep * dayWidth }}>
                {tickStep === 1 ? toShortDate(tick) : `Tuần ${getWeekNumber(tick)}`}
              </span>
            ))}
            {todayLeft >= 0 && todayLeft <= timelineWidth ? <span style={{ ...ganttTodayLine, left: todayLeft }} /> : null}
          </div>

          {rows.length === 0 ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={emptyInline}>Dự án này chưa có dữ liệu để vẽ Timeline/Gantt.</div>
            </div>
          ) : rows.map((row) => {
            const left = Math.max(0, dayDiff(timelineStart, row.startDate) * dayWidth)
            const width = Math.max(dayWidth, (dayDiff(row.startDate, row.dueDate) + 1) * dayWidth)
            return (
              <React.Fragment key={row.id}>
                <button type="button" onClick={() => setSelected(row)} style={ganttLabelCell(row.indent)}>
                  <span style={ganttLevelBadge(row.level)}>{ganttLevelLabel(row.level)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={ganttItemTitle}>{row.title}</span>
                    <span style={mutedMetaStyle}>{row.subtitle}</span>
                  </span>
                </button>
                <div style={{ ...ganttTrack, width: timelineWidth }}>
                  {todayLeft >= 0 && todayLeft <= timelineWidth ? <span style={{ ...ganttTodayLine, left: todayLeft }} /> : null}
                  <TimelineBar
                    item={row}
                    left={left}
                    width={width}
                    dayWidth={dayWidth}
                    onSelect={() => setSelected(row)}
                    onShift={(delta) => onShift(row.level, row.projectId, row.workstreamId, row.subtaskId, row.stepId, row.dueDate, delta)}
                  />
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>

      <Drawer open={Boolean(selected)} title={selected?.title ?? 'Chi tiết timeline'} onClose={() => setSelected(null)} width={420}>
        {selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={statusChipStyle(STATUS_META[selected.status].bg, STATUS_META[selected.status].color)}>
              {STATUS_META[selected.status].label}
            </span>
            <div style={drawerInfoGrid}>
              <div><strong>Cấp:</strong> {ganttLevelLabel(selected.level)}</div>
              <div><strong>Bắt đầu:</strong> {selected.missingStartDate ? 'Chưa nhập' : toShortDate(selected.startDate)}</div>
              <div><strong>Deadline:</strong> {selected.missingDueDate ? 'Chưa nhập' : toShortDate(selected.dueDate)}</div>
              <div><strong>Tiến độ:</strong> {selected.progress}%</div>
            </div>
            <div style={mutedMetaStyle}>{selected.subtitle}</div>
            <div style={warningBanner}>Muốn dời deadline: kéo thanh trên timeline, thả chuột, rồi nhập lý do.</div>
          </div>
        ) : null}
      </Drawer>
    </section>
  )
}

function GanttTab({
  project,
  onShift,
}: {
  project: ProjectWorkspace
  onShift: (
    level: DragDraft['level'],
    projectId: string,
    workstreamId: string | undefined,
    subtaskId: string | undefined,
    stepId: string | undefined,
    oldDate: string,
    delta: number,
  ) => void
}) {
  return <GanttTimelineTab project={project} onShift={onShift} />

  const rows = [
    { level: 'project' as const, projectId: project.id, workstreamId: undefined, subtaskId: undefined, title: project.name, startDate: project.startDate, dueDate: project.dueDate },
    ...project.workstreams.flatMap((workstream) => [
      { level: 'workstream' as const, projectId: project.id, workstreamId: workstream.id, subtaskId: undefined, title: workstream.title, startDate: workstream.startDate, dueDate: workstream.dueDate },
      ...workstream.subtasks.map((subtask) => ({
        level: 'subtask' as const,
        projectId: project.id,
        workstreamId: workstream.id,
        subtaskId: subtask.id,
        title: `• ${subtask.title}`,
        startDate: subtask.startDate,
        dueDate: subtask.dueDate,
      })),
    ]),
  ]

  const startBase = rows.reduce((min, row) => (row.startDate < min ? row.startDate : min), project.startDate)

  return (
    <section style={ganttShell}>
      <div style={ganttLegend}>
        <span><span style={legendDot('var(--color-lime)')} /> Hôm nay</span>
        <span><span style={legendDot('var(--color-danger)')} /> Cần lý do khi dời</span>
      </div>

      <div style={ganttTable}>
        {rows.map((row) => {
          const offset = dayDiff(startBase, row.startDate)
          const duration = Math.max(dayDiff(row.startDate, row.dueDate) + 1, 1)
          return (
            <div key={`${row.level}-${row.title}`} style={ganttRow}>
              <div style={ganttLabel}>{row.title}</div>
              <DraggableBar
                offset={offset}
                duration={duration}
                danger={row.level === 'subtask' && row.dueDate < getVietnamDateKey()}
                onShift={(delta) => onShift(row.level, row.projectId, row.workstreamId, row.subtaskId, undefined, row.dueDate, delta)}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TimelineBar({
  item,
  left,
  width,
  dayWidth,
  onSelect,
  onShift,
}: {
  item: GanttItem
  left: number
  width: number
  dayWidth: number
  onSelect: () => void
  onShift: (delta: number) => void
}) {
  const dragStart = React.useRef<number | null>(null)
  const deltaRef = React.useRef(0)
  const tone = ganttBarTone(item)

  return (
    <button
      type="button"
      title={`${item.title} · ${toShortDate(item.startDate)} - ${toShortDate(item.dueDate)}`}
      onPointerDown={(event) => {
        dragStart.current = event.clientX
        deltaRef.current = 0
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (dragStart.current === null) return
        deltaRef.current = Math.round((event.clientX - dragStart.current) / dayWidth)
        ;(event.currentTarget as HTMLElement).style.transform = `translateX(${deltaRef.current * dayWidth}px)`
      }}
      onPointerUp={(event) => {
        ;(event.currentTarget as HTMLElement).style.transform = 'translateX(0)'
        if (dragStart.current !== null && deltaRef.current !== 0) onShift(deltaRef.current)
        else onSelect()
        dragStart.current = null
        deltaRef.current = 0
        ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
      }}
      style={{
        ...ganttBarButton,
        left,
        width,
        background: tone.bg,
        borderColor: tone.border,
        color: tone.color,
      }}
    >
      <span style={{ ...ganttBarFill, width: `${Math.min(item.progress, 100)}%`, background: tone.fill }} />
      <span style={ganttBarText}>{item.title}</span>
    </button>
  )
}

function buildGanttItems(project: ProjectWorkspace): GanttItem[] {
  const projectProgress = getProjectProgress(project)
  const projectStatus = progressStatus(projectProgress, project.dueDate)
  const rows: GanttItem[] = [{
    id: `project-${project.id}`,
    level: 'project',
    title: project.name,
    subtitle: `${project.code} · ${project.workstreams.length} đầu việc lớn`,
    projectId: project.id,
    startDate: project.startDate,
    dueDate: project.dueDate,
    status: projectStatus,
    progress: projectProgress,
    indent: 0,
  }]

  for (const workstream of project.workstreams) {
    const streamProgress = getWorkstreamProgress(workstream)
    rows.push({
      id: `workstream-${workstream.id}`,
      level: 'workstream',
      title: workstream.title,
      subtitle: `${workstream.subtasks.length} đầu việc con · ${streamProgress}%`,
      projectId: project.id,
      workstreamId: workstream.id,
      startDate: workstream.startDate,
      dueDate: workstream.dueDate,
      status: progressStatus(streamProgress, workstream.dueDate, workstream.status),
      progress: streamProgress,
      indent: 1,
    })

    for (const subtask of workstream.subtasks) {
      const subtaskProgress = getSubtaskProgress(subtask)
      rows.push({
        id: `subtask-${subtask.id}`,
        level: 'subtask',
        title: subtask.title,
        subtitle: `${STATUS_META[subtask.status].label} · ${getSubtaskProgressText(subtask)}`,
        projectId: project.id,
        workstreamId: workstream.id,
        subtaskId: subtask.id,
        startDate: subtask.startDate,
        dueDate: subtask.dueDate,
        status: subtask.status,
        progress: subtaskProgress,
        indent: 2,
        missingStartDate: subtask.missingStartDate,
        missingDueDate: subtask.missingDueDate,
      })

      for (const step of subtask.steps) {
        const stepProgress = step.status === 'COMPLETED' ? 100 : 0
        rows.push({
          id: `step-${step.id}`,
          level: 'step',
          title: step.title,
          subtitle: `${STATUS_META[step.status].label} · ${step.isRequired ? 'Bắt buộc' : 'Không bắt buộc'} · ${deliverableStatusLabel(step)}`,
          projectId: project.id,
          workstreamId: workstream.id,
          subtaskId: subtask.id,
          stepId: step.id,
          startDate: shiftDate(step.dueDate || subtask.dueDate, -1),
          dueDate: step.dueDate || subtask.dueDate,
          status: step.status,
          progress: stepProgress,
          indent: 3,
          missingDueDate: step.missingDueDate,
        })
      }
    }
  }

  return rows
}

function progressStatus(progress: number, dueDate: string, fallback: TaskStatus = 'NOT_STARTED'): TaskStatus {
  if (progress >= 100) return 'COMPLETED'
  if (isOverdue(dueDate, fallback)) return 'BLOCKED'
  if (progress > 0) return 'IN_PROGRESS'
  return fallback
}

function minDate(values: string[]) {
  return values.reduce((min, value) => (value < min ? value : min), values[0] ?? getVietnamDateKey())
}

function maxDate(values: string[]) {
  return values.reduce((max, value) => (value > max ? value : max), values[0] ?? getVietnamDateKey())
}

function getWeekNumber(value: string) {
  const date = new Date(value)
  const firstDay = new Date(date.getFullYear(), 0, 1)
  return Math.ceil((((date.getTime() - firstDay.getTime()) / DAY_MS) + firstDay.getDay() + 1) / 7)
}

function ganttLevelLabel(level: GanttLevel) {
  if (level === 'project') return 'Dự án'
  if (level === 'workstream') return 'Đầu việc lớn'
  if (level === 'subtask') return 'Đầu việc con'
  return 'Bước'
}

function ganttBarTone(item: GanttItem) {
  if (isOverdue(item.dueDate, item.status)) return { bg: 'rgba(184,64,64,.2)', fill: 'rgba(184,64,64,.55)', border: 'rgba(184,64,64,.45)', color: 'var(--txt)' }
  if (item.status === 'COMPLETED') return { bg: 'rgba(96,145,92,.18)', fill: 'rgba(96,145,92,.6)', border: 'rgba(96,145,92,.38)', color: 'var(--txt)' }
  if (item.status === 'PENDING_APPROVAL' || item.status === 'REVISION_REQUIRED') return { bg: 'rgba(184,139,62,.18)', fill: 'rgba(184,139,62,.55)', border: 'rgba(184,139,62,.38)', color: 'var(--txt)' }
  if (item.status === 'WAITING' || item.status === 'BLOCKED') return { bg: 'rgba(107,138,153,.16)', fill: 'rgba(107,138,153,.5)', border: 'rgba(107,138,153,.34)', color: 'var(--txt)' }
  return { bg: 'rgba(157,184,199,.16)', fill: 'rgba(157,184,199,.5)', border: 'rgba(157,184,199,.34)', color: 'var(--txt)' }
}

function MeetingsTab({ project }: { project: ProjectWorkspace }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
      <section style={workstreamCard}>
        <div style={workstreamHead}>
          <div>
            <div style={sectionTitle}>Lịch họp</div>
            <div style={mutedMetaStyle}>Giữ recap, nhịp họp và file chuẩn bị trong cùng một nơi.</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {project.meetings.length === 0 ? (
            <div style={emptyInline}>Chưa có cuộc họp nào cho dự án này.</div>
          ) : (
            project.meetings.map((meeting) => (
              <div key={meeting.id} style={meetingCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={subtaskTitleStyle}>{meeting.title}</div>
                    <div style={mutedMetaStyle}>{meeting.schedule} · {meeting.cadence || 'Một lần'}</div>
                  </div>
                </div>
                <div style={meetingInfoStyle}>
                  <div><strong>RECAP:</strong> {meeting.recap || 'Chưa có recap.'}</div>
                  <div><strong>File cần chuẩn bị:</strong> {meeting.filesNeeded || 'Chưa ghi.'}</div>
                  <div><strong>Link:</strong> {meeting.links || 'Chưa có link.'}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={workstreamCard}>
        <div style={sectionTitle}>Nhắc trước cuộc họp</div>
        <div style={mutedMetaStyle}>Mặc định: việc định kỳ nhắc trước 2 ngày, cuộc họp nhắc trước 1 tiếng.</div>
        <div style={reminderBox}>
          <div>• Nhắc lịch họp trước 1 tiếng cho người liên quan</div>
          <div>• Việc định kỳ tuần / tháng nhắc trước 2 ngày</div>
          <div>• Có chỗ để lưu recap, link họp và file chuẩn bị</div>
        </div>
      </section>
    </div>
  )
}

function DraggableBar({
  offset,
  duration,
  danger,
  onShift,
}: {
  offset: number
  duration: number
  danger?: boolean
  onShift: (delta: number) => void
}) {
  const dragStart = React.useRef<number | null>(null)
  const deltaRef = React.useRef(0)

  return (
    <div style={ganttTrack}>
      <div
        onPointerDown={(event) => {
          dragStart.current = event.clientX
          deltaRef.current = 0
          ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (dragStart.current === null) return
          deltaRef.current = Math.round((event.clientX - dragStart.current) / 34)
          ;(event.currentTarget as HTMLElement).style.transform = `translateX(${deltaRef.current * 34}px)`
        }}
        onPointerUp={(event) => {
          ;(event.currentTarget as HTMLElement).style.transform = 'translateX(0)'
          if (dragStart.current !== null && deltaRef.current !== 0) onShift(deltaRef.current)
          dragStart.current = null
          deltaRef.current = 0
          ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
        }}
        style={{
          ...ganttBar,
          marginLeft: offset * 34,
          width: Math.max(duration * 34, 34),
          background: danger ? '#df6666' : '#9db8c7',
        }}
      />
    </div>
  )
}

function ModalShell({
  title,
  onClose,
  onSubmit,
  submitLabel,
  children,
  submitDisabled,
}: {
  title: string
  onClose: () => void
  onSubmit: () => void
  submitLabel: string
  children: React.ReactNode
  submitDisabled?: boolean
}) {
  return (
    <div style={modalOverlay}>
      <div style={modalCard}>
        <div style={modalHead}>
          <div style={sectionTitle}>{title}</div>
          <button onClick={onClose} style={iconGhostBtn}><i className="ti ti-x" /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
        <div style={modalFoot}>
          <GhostButton icon="ti-x" onClick={onClose}>Đóng</GhostButton>
          <PrimaryButton icon="ti-check" onClick={onSubmit} disabled={submitDisabled}>{submitLabel}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  )
}

function Metric({ icon, label, value, danger = false }: { icon: string; label: string; value: number; danger?: boolean }) {
  return (
    <div style={metricCard}>
      <div style={{ ...metricIcon, color: danger ? 'var(--color-danger)' : 'var(--color-olive)', background: danger ? 'var(--color-danger-bg)' : 'rgba(45, 51, 26, 0.08)' }}>
        <i className={`ti ${icon}`} />
      </div>
      <div>
        <div style={metricValue}>{value}</div>
        <div style={metricLabel}>{label}</div>
      </div>
    </div>
  )
}

function GhostButton({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode
  icon: string
  onClick?: () => void
}) {
  return (
    <button onClick={onClick} style={ghostBtnStyle}>
      <i className={`ti ${icon}`} />
      {children}
    </button>
  )
}

function PrimaryButton({
  children,
  icon,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  icon: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...primaryBtnStyle, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <i className={`ti ${icon}`} />
      {children}
    </button>
  )
}

function DangerButton({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode
  icon: string
  onClick?: () => void
}) {
  return (
    <button onClick={onClick} style={dangerBtnStyle}>
      <i className={`ti ${icon}`} />
      {children}
    </button>
  )
}

function IconButton({
  label,
  icon,
  onClick,
  tone = 'default',
}: {
  label: string
  icon: string
  onClick?: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} style={iconButtonStyle(tone)}>
      <i className={`ti ${icon}`} />
    </button>
  )
}

function seedWorkspace(
  projects: CommandCenterProjectRow[],
  tasks: CommandCenterTaskRow[],
  people: CommandCenterPersonRow[],
  workstreams: CommandCenterWorkstreamRow[],
  taskSteps: CommandCenterTaskStepRow[],
  deliverables: CommandCenterDeliverableRow[],
  meetings: CommandCenterMeetingRow[],
): ProjectWorkspace[] {
  const today = getVietnamDateKey()
  const fallbackOwner = people[0]?.id ?? null

  return normalizeWorkspaceTree(projects.map((project, index) => {
    const projectTasks = tasks.filter((task) => task.project_id === project.id)
    const projectWorkstreams = workstreams.filter((workstream) => workstream.project_id === project.id)
    const startDate = project.start_date ?? shiftDate(today, index * 3)
    const mappedWorkstreams = projectWorkstreams.map((workstream) => {
      const streamTasks = projectTasks.filter((task) => task.workstream_id === workstream.id)
      const subtasks = streamTasks.map((task, taskIndex) => toSeedSubtask(task, startDate, taskIndex, taskSteps, deliverables))
      return toWorkstreamItem(workstream, subtasks, startDate, fallbackOwner)
    })

    const ungroupedTasks = projectTasks.filter((task) => !task.workstream_id || !projectWorkstreams.some((stream) => stream.id === task.workstream_id))
    const ungroupedWorkstream: WorkstreamItem | null = ungroupedTasks.length
      ? {
          id: `ungrouped-${project.id}`,
          title: 'Chưa phân nhóm',
          ownerId: project.owner_id ?? fallbackOwner,
          startDate,
          dueDate: project.due_date ?? shiftDate(startDate, 21),
          status: 'NOT_STARTED',
          subtasks: ungroupedTasks.map((task, taskIndex) => toSeedSubtask(task, startDate, taskIndex, taskSteps, deliverables)),
        }
      : null
    const projectTree = ungroupedWorkstream ? [...mappedWorkstreams, ungroupedWorkstream] : mappedWorkstreams
    const dueDate = project.due_date ?? projectTree.map((item) => item.dueDate).filter(Boolean).sort().at(-1) ?? shiftDate(startDate, 21)

    return {
      id: project.id,
      sourceProjectId: project.id,
      name: project.name,
      code: project.code ?? `PRJ-${index + 1}`,
      ownerId: project.owner_id ?? fallbackOwner,
      startDate,
      dueDate,
      description: '',
      workstreams: projectTree,
      meetings: meetings
        .filter((meeting) => meeting.project_id === project.id)
        .map((meeting) => ({
          id: meeting.id,
          title: meeting.title,
          schedule: meeting.start_at ? meeting.start_at.replace('T', ' ').slice(0, 16) : 'Chưa có lịch',
          cadence: '',
          recap: '',
          filesNeeded: '',
          links: '',
        })),
    }
  }))
}

function toWorkstreamItem(
  workstream: CommandCenterWorkstreamRow,
  subtasks: SubtaskItem[],
  projectStart: string,
  fallbackOwner: string | null,
): WorkstreamItem {
  return {
    id: workstream.id,
    title: workstream.name,
    ownerId: workstream.owner_id ?? fallbackOwner,
    startDate: workstream.start_date ?? subtasks[0]?.startDate ?? projectStart,
    dueDate: workstream.due_date ?? subtasks.map((task) => task.dueDate).filter(Boolean).sort().at(-1) ?? shiftDate(projectStart, 14),
    status: deriveWorkstreamStatus(subtasks),
    subtasks,
  }
}

function toSeedSubtask(
  task: CommandCenterTaskRow,
  projectStart: string,
  index: number,
  taskSteps: CommandCenterTaskStepRow[],
  deliverables: CommandCenterDeliverableRow[],
): SubtaskItem {
  const dueDate = task.due_date ?? shiftDate(projectStart, 5 + index * 2)
  const startDate = task.start_date ?? shiftDate(dueDate, -3)
  const taskDeliverables = deliverables.filter((deliverable) => deliverable.task_id === task.id)
  const persistedSteps = taskSteps
    .filter((step) => step.task_id === task.id)
    .map((step) => {
      const linkedDeliverable = taskDeliverables.find((deliverable) => deliverable.step_id === step.id)
      return {
        id: step.id,
        title: step.title,
        description: step.description ?? '',
        ownerId: step.owner_id,
        dueDate: step.due_date ?? dueDate,
        missingDueDate: !step.due_date,
        status: normalizeStatus(step.status),
        note: step.description ?? '',
        isRequired: step.is_required !== false,
        requiresDeliverable: Boolean(linkedDeliverable),
        deliverableId: linkedDeliverable?.id ?? null,
        deliverableStatus: linkedDeliverable?.status ?? null,
      }
    })
  const taskLevelDeliverable = taskDeliverables.find((deliverable) => !deliverable.step_id)

  return {
    id: task.id,
    sourceTaskId: task.id,
    title: task.title,
    ownerId: task.owner_id,
    supporterIds: [],
    startDate,
    dueDate,
    missingStartDate: !task.start_date,
    missingDueDate: !task.due_date,
    status: normalizeStatus(task.status),
    reportText: '',
    needsFile: Boolean(taskLevelDeliverable ?? taskDeliverables.length),
    attachments: [],
    deadlineHistory: [],
    steps: persistedSteps,
  }
}

function normalizeStatus(value: string): TaskStatus {
  if (value === 'COMPLETED') return 'COMPLETED'
  if (value === 'PENDING_APPROVAL') return 'PENDING_APPROVAL'
  if (value === 'BLOCKED') return 'BLOCKED'
  if (value === 'WAITING') return 'WAITING'
  if (value === 'REVISION_REQUIRED') return 'REVISION_REQUIRED'
  if (value === 'CANCELLED') return 'CANCELLED'
  if (value === 'IN_PROGRESS') return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

function makeStep(title: string, ownerId: string | null, dueDate: string): StepItem {
  return {
    id: makeId('step'),
    title,
    description: '',
    ownerId,
    dueDate,
    status: 'NOT_STARTED',
    note: '',
    isRequired: true,
    requiresDeliverable: false,
    deliverableId: null,
    deliverableStatus: null,
  }
}

function createStepDraft(subtask: SubtaskItem): StepDraft {
  return {
    title: '',
    description: '',
    ownerId: subtask.ownerId ?? '',
    dueDate: subtask.dueDate,
    status: 'NOT_STARTED',
    isRequired: true,
    requiresDeliverable: false,
  }
}

function stepToDraft(step: StepItem): StepDraft {
  return {
    title: step.title,
    description: step.description || step.note,
    ownerId: step.ownerId ?? '',
    dueDate: step.dueDate,
    status: step.status,
    isRequired: step.isRequired,
    requiresDeliverable: step.requiresDeliverable,
  }
}

function stepObjective(step: StepItem) {
  const lowerTitle = step.title.toLowerCase()
  if (lowerTitle.includes('nộp') || lowerTitle.includes('file') || lowerTitle.includes('báo cáo')) {
    return 'Bắt buộc có file, đường link hoặc báo cáo để đủ điều kiện hoàn thành đầu việc.'
  }
  if (lowerTitle.includes('duyệt')) return 'Chờ người duyệt kiểm tra và phản hồi kết quả.'
  if (lowerTitle.includes('nhận')) return 'Xác nhận đã hiểu yêu cầu và đầu ra cần nộp.'
  return 'Cập nhật tiến độ để mọi người biết bước này đang ở trạng thái nào.'
}

function deliverableStatusLabel(step: StepItem) {
  if (!step.requiresDeliverable) return 'Không yêu cầu'
  if (!step.deliverableId) return 'Chưa tạo mục file'
  if (step.deliverableStatus === 'SUBMITTED') return 'Đã nộp 1 file'
  if (step.deliverableStatus === 'APPROVED') return 'File đã duyệt'
  if (step.deliverableStatus === 'REVISION_REQUIRED' || step.deliverableStatus === 'MISSING_INFORMATION') return 'File cần sửa'
  return 'Chưa nộp file/báo cáo'
}

function createDraft(ownerId?: string | null, dueDate?: string): ComposerDraft {
  return {
    name: '',
    code: '',
    description: '',
    ownerId: ownerId ?? '',
    startDate: getVietnamDateKey(),
    dueDate: dueDate ?? shiftDate(getVietnamDateKey(), 7),
    cadence: '',
    recap: '',
    filesNeeded: '',
    links: '',
    needsFile: true,
    stepTemplate: 'basic',
  }
}

function composerTitle(mode: ComposerMode) {
  if (mode === 'project') return 'Tạo dự án'
  if (mode === 'workstream') return 'Tạo đầu việc lớn'
  if (mode === 'subtask') return 'Tạo đầu việc con'
  return 'Tạo cuộc họp'
}

function findSubtask(project: ProjectWorkspace, subtaskId: string | null) {
  for (const workstream of project.workstreams) {
    for (const subtask of workstream.subtasks) {
      if (subtask.id === subtaskId) return subtask
    }
  }
  return null
}

function normalizeWorkspaceTree(projects: ProjectWorkspace[]) {
  return projects.map((project) => {
    const workstreams = project.workstreams.map((workstream) => {
      const subtasks = workstream.subtasks.map(normalizeSubtaskState)
      const subtaskDueDates = subtasks.map((subtask) => subtask.dueDate).filter(Boolean)
      const subtaskStartDates = subtasks.map((subtask) => subtask.startDate).filter(Boolean)

      return {
        ...workstream,
        startDate: subtaskStartDates.length ? subtaskStartDates.reduce((min, value) => (value < min ? value : min), subtaskStartDates[0]) : workstream.startDate,
        dueDate: subtaskDueDates.length ? subtaskDueDates.reduce((max, value) => (value > max ? value : max), subtaskDueDates[0]) : workstream.dueDate,
        status: deriveWorkstreamStatus(subtasks),
        subtasks,
      }
    })

    const workstreamDueDates = workstreams.map((workstream) => workstream.dueDate).filter(Boolean)
    const workstreamStartDates = workstreams.map((workstream) => workstream.startDate).filter(Boolean)

    return {
      ...project,
      startDate: workstreamStartDates.length ? workstreamStartDates.reduce((min, value) => (value < min ? value : min), workstreamStartDates[0]) : project.startDate,
      dueDate: workstreamDueDates.length ? workstreamDueDates.reduce((max, value) => (value > max ? value : max), workstreamDueDates[0]) : project.dueDate,
      workstreams,
    }
  })
}

function normalizeSubtaskState(subtask: SubtaskItem): SubtaskItem {
  if (!subtask.steps.length) return subtask

  const requiredSteps = subtask.steps.filter((step) => step.isRequired)
  const progressSteps = requiredSteps.length ? requiredSteps : subtask.steps
  const completedCount = progressSteps.filter((step) => step.status === 'COMPLETED').length
  const latestStepDate = subtask.steps.reduce((max, step) => (step.dueDate > max ? step.dueDate : max), subtask.steps[0].dueDate)
  let nextStatus = subtask.status

  if (subtask.status !== 'BLOCKED' && subtask.status !== 'COMPLETED') {
    if (completedCount === 0) nextStatus = 'NOT_STARTED'
    else if (completedCount === progressSteps.length) nextStatus = 'PENDING_APPROVAL'
    else nextStatus = 'IN_PROGRESS'
  }

  return {
    ...subtask,
    status: nextStatus,
    dueDate: latestStepDate > subtask.dueDate ? latestStepDate : subtask.dueDate,
  }
}

function deriveWorkstreamStatus(subtasks: SubtaskItem[]): TaskStatus {
  if (!subtasks.length) return 'NOT_STARTED'
  if (subtasks.every((subtask) => subtask.status === 'COMPLETED')) return 'COMPLETED'
  if (subtasks.some((subtask) => subtask.status === 'BLOCKED')) return 'BLOCKED'
  if (subtasks.some((subtask) => subtask.status === 'REVISION_REQUIRED')) return 'REVISION_REQUIRED'
  if (subtasks.some((subtask) => subtask.status === 'PENDING_APPROVAL')) return 'PENDING_APPROVAL'
  if (subtasks.some((subtask) => subtask.status === 'IN_PROGRESS')) return 'IN_PROGRESS'
  if (subtasks.some((subtask) => subtask.status === 'WAITING')) return 'WAITING'
  return 'NOT_STARTED'
}

function getSubtaskProgress(subtask: SubtaskItem) {
  if (!subtask.steps.length) return 0
  const requiredSteps = subtask.steps.filter((step) => step.isRequired)
  const progressSteps = requiredSteps.length ? requiredSteps : subtask.steps
  return Math.round((progressSteps.filter((step) => step.status === 'COMPLETED').length / progressSteps.length) * 100)
}

function getRequiredStepStats(subtask: SubtaskItem) {
  const requiredSteps = subtask.steps.filter((step) => step.isRequired)
  const progressSteps = requiredSteps.length ? requiredSteps : subtask.steps
  return {
    completed: progressSteps.filter((step) => step.status === 'COMPLETED').length,
    total: progressSteps.length,
    requiredCompleted: requiredSteps.filter((step) => step.status === 'COMPLETED').length,
    requiredTotal: requiredSteps.length,
  }
}

function getSubtaskProgressText(subtask: SubtaskItem) {
  const stats = getRequiredStepStats(subtask)
  if (!stats.total) return 'Tiến độ: chưa có bước nào nên chưa tự tính phần trăm.'
  const requiredText = stats.requiredTotal
    ? ` · Bắt buộc: ${stats.requiredCompleted}/${stats.requiredTotal} bước đã xong`
    : ''
  return `Tiến độ: ${stats.completed}/${stats.total} bước hoàn thành · ${getSubtaskProgress(subtask)}%${requiredText}`
}

function getWorkflowSummary(subtask: SubtaskItem): { value: string; hint: string; tone: 'neutral' | 'good' | 'warning' | 'danger' } {
  const stats = getRequiredStepStats(subtask)
  if (!stats.total) {
    return {
      value: 'Chưa có bước',
      hint: 'Bấm để thêm quy trình.',
      tone: 'warning',
    }
  }
  const progress = getSubtaskProgress(subtask)
  const hasBlockedStep = subtask.steps.some((step) => ['BLOCKED', 'REVISION_REQUIRED'].includes(step.status))
  return {
    value: `${stats.completed}/${stats.total} bước xong`,
    hint: `${progress}% tiến độ theo bước`,
    tone: hasBlockedStep ? 'danger' : progress === 100 ? 'good' : 'neutral',
  }
}

function getFileSummary(subtask: SubtaskItem): { value: string; hint: string; tone: 'neutral' | 'good' | 'warning' | 'danger'; badge?: string } {
  const revisionSteps = getRevisionDeliverableSteps(subtask)
  if (revisionSteps.length) {
    return {
      value: 'File cần sửa',
      hint: revisionSteps.map((step) => step.title).join(', '),
      tone: 'danger',
      badge: 'Cần xử lý',
    }
  }

  const missingSteps = getMissingDeliverableSteps(subtask)
  if (missingSteps.length || ((subtask.needsFile || requiresEvidence(subtask.status)) && !hasEvidence(subtask))) {
    return {
      value: 'Chưa nộp file',
      hint: missingSteps.length ? `${missingSteps.length} bước còn thiếu file/báo cáo` : 'Cần file hoặc báo cáo trước khi chốt.',
      tone: 'warning',
      badge: 'Thiếu',
    }
  }

  const submittedCount = subtask.attachments.length + subtask.steps.filter((step) => ['SUBMITTED', 'APPROVED'].includes(step.deliverableStatus ?? '')).length
  if (submittedCount > 0 || subtask.reportText.trim()) {
    return {
      value: submittedCount > 0 ? `Đã nộp ${submittedCount} mục` : 'Đã có báo cáo',
      hint: subtask.steps.some((step) => step.deliverableStatus === 'APPROVED') ? 'Có file đã duyệt' : 'Đang có bằng chứng/báo cáo',
      tone: 'good',
    }
  }

  return {
    value: 'Chưa yêu cầu file',
    hint: 'Mở khi cần nộp báo cáo hoặc gắn link.',
    tone: 'neutral',
  }
}

function getDeadlineSummary(subtask: SubtaskItem): { value: string; hint: string; tone: 'neutral' | 'good' | 'warning' | 'danger' } {
  if (subtask.deadlineHistory.length) {
    return {
      value: `Đã dời ${subtask.deadlineHistory.length} lần`,
      hint: `Deadline hiện tại: ${subtask.dueDate ? toShortDate(subtask.dueDate) : 'chưa có'}`,
      tone: 'warning',
    }
  }
  if (!subtask.dueDate) {
    return {
      value: 'Chưa có deadline',
      hint: 'Cần bổ sung deadline nếu phải chốt kết quả.',
      tone: 'neutral',
    }
  }
  if (isOverdue(subtask.dueDate, subtask.status)) {
    return {
      value: 'Trễ',
      hint: `Deadline: ${toShortDate(subtask.dueDate)}`,
      tone: 'danger',
    }
  }
  return {
    value: 'Đúng hạn',
    hint: subtask.dueDate ? `Deadline: ${toShortDate(subtask.dueDate)}` : 'Chưa có deadline',
    tone: 'good',
  }
}

function getMissingDeliverableSteps(subtask: SubtaskItem) {
  return subtask.steps.filter(
    (step) =>
      step.requiresDeliverable &&
      step.isRequired &&
      !['SUBMITTED', 'APPROVED'].includes(step.deliverableStatus ?? ''),
  )
}

function getRevisionDeliverableSteps(subtask: SubtaskItem) {
  return subtask.steps.filter(
    (step) =>
      step.requiresDeliverable &&
      ['REVISION_REQUIRED', 'MISSING_INFORMATION'].includes(step.deliverableStatus ?? ''),
  )
}

function getBlockedSection(subtask: SubtaskItem): DetailSection {
  if (getMissingDeliverableSteps(subtask).length || getRevisionDeliverableSteps(subtask).length) return 'files'
  if ((subtask.needsFile || requiresEvidence(subtask.status)) && !hasEvidence(subtask)) return 'files'
  return 'workflow'
}

function getCompactBlockerText(subtask: SubtaskItem) {
  if (getRevisionDeliverableSteps(subtask).length) return 'file/báo cáo đang bị yêu cầu sửa.'
  if (getMissingDeliverableSteps(subtask).length || ((subtask.needsFile || requiresEvidence(subtask.status)) && !hasEvidence(subtask))) {
    return 'thiếu file/báo cáo.'
  }
  if (subtask.steps.some((step) => step.isRequired && step.status !== 'COMPLETED')) return 'còn bước bắt buộc chưa hoàn thành.'
  return getCompletionBlockers(subtask).join('; ') || 'còn điều kiện chưa đạt.'
}

function getCompletionBlockers(subtask: SubtaskItem) {
  const blockers: string[] = []
  const requiredSteps = subtask.steps.filter((step) => step.isRequired)
  const incompleteRequired = requiredSteps.filter((step) => step.status !== 'COMPLETED')
  if (incompleteRequired.length) {
    blockers.push(`${incompleteRequired.length} bước bắt buộc chưa hoàn thành`)
  }

  const missingDeliverables = subtask.steps.filter(
    (step) =>
      step.requiresDeliverable &&
      step.isRequired &&
      !['SUBMITTED', 'APPROVED'].includes(step.deliverableStatus ?? ''),
  )
  if (missingDeliverables.length) {
    blockers.push(missingDeliverables.map((step) => step.title).join(', '))
  }

  const revisionDeliverables = subtask.steps.filter(
    (step) =>
      step.requiresDeliverable &&
      ['REVISION_REQUIRED', 'MISSING_INFORMATION'].includes(step.deliverableStatus ?? ''),
  )
  if (revisionDeliverables.length) {
    blockers.push(`file cần sửa ở ${revisionDeliverables.map((step) => step.title).join(', ')}`)
  }

  if (!subtask.steps.length && subtask.needsFile && !hasEvidence(subtask)) {
    blockers.push('nộp kết quả / file / báo cáo')
  }

  return blockers
}

function getWorkstreamProgress(workstream: WorkstreamItem) {
  if (!workstream.subtasks.length) return 0
  return Math.round(workstream.subtasks.reduce((sum, subtask) => sum + getSubtaskProgress(subtask), 0) / workstream.subtasks.length)
}

function getProjectProgress(project: ProjectWorkspace) {
  if (!project.workstreams.length) return 0
  return Math.round(project.workstreams.reduce((sum, workstream) => sum + getWorkstreamProgress(workstream), 0) / project.workstreams.length)
}

function projectHealth(project: ProjectWorkspace) {
  const overdue = project.workstreams.flatMap((item) => item.subtasks).filter((subtask) => isOverdue(subtask.dueDate, subtask.status)).length
  if (overdue >= 3) return { label: 'Có rủi ro', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' }
  if (overdue > 0) return { label: 'Cần chú ý', bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' }
  if (getProjectProgress(project) === 0) return { label: 'Chưa khởi tạo', bg: 'var(--surface-3)', color: 'var(--txt-2)' }
  return { label: 'Đúng tiến độ', bg: 'var(--color-success-bg)', color: 'var(--color-success)' }
}

function hasEvidence(subtask: SubtaskItem) {
  return Boolean(
    subtask.reportText.trim()
    || subtask.attachments.length
    || subtask.steps.some((step) => ['SUBMITTED', 'APPROVED'].includes(step.deliverableStatus ?? '')),
  )
}

function requiresEvidence(status: TaskStatus) {
  return status === 'PENDING_APPROVAL' || status === 'COMPLETED'
}

function isOverdue(dueDate: string, status: TaskStatus) {
  return dueDate < getVietnamDateKey() && !['COMPLETED', 'CANCELLED'].includes(status)
}

function dayDiff(from: string, to: string) {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS)
}

function shiftDate(date: string, delta: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + delta)
  return next.toISOString().slice(0, 10)
}

function toShortDate(value: string) {
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function statusChipStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  }
}

function projectCardStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    width: '100%',
    padding: 14,
    borderRadius: 14,
    border: `1px solid ${active ? 'rgba(218,223,33,.45)' : 'var(--line)'}`,
    background: active ? 'rgba(218,223,33,.06)' : 'var(--surface)',
    textAlign: 'left',
  }
}

function subtaskRowStyle(active: boolean): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 12,
    border: `1px solid ${active ? 'rgba(218,223,33,.45)' : 'var(--line)'}`,
    background: active ? 'rgba(218,223,33,.06)' : 'var(--surface-2)',
    textAlign: 'left',
  }
}

function kanbanCard(active: boolean): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    border: `1px solid ${active ? 'rgba(218,223,33,.45)' : 'var(--line)'}`,
    background: active ? 'rgba(218,223,33,.06)' : 'var(--surface-2)',
    textAlign: 'left',
  }
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: 999,
    border: `1px solid ${active ? 'rgba(218,223,33,.45)' : 'var(--line)'}`,
    background: active ? 'rgba(218,223,33,.08)' : 'transparent',
    color: active ? 'var(--txt)' : 'var(--txt-3)',
    fontSize: 13,
    fontWeight: 700,
  }
}

function legendDot(color: string): React.CSSProperties {
  return {
    width: 10,
    height: 10,
    display: 'inline-block',
    borderRadius: 999,
    background: color,
    marginRight: 6,
  }
}

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}

const metricGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 12,
}

const metricCard: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 16px',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
}

const metricIcon: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
}

const metricValue: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 22,
  lineHeight: 1,
  fontWeight: 700,
  color: 'var(--txt)',
}

const metricLabel: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: 'var(--txt-3)',
}

const sectionCard: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 16,
  overflow: 'hidden',
}

const loadingState: React.CSSProperties = {
  padding: 28,
  textAlign: 'center',
  color: 'var(--txt-3)',
}

const workspaceLayout: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '320px minmax(0, 1fr)',
  gap: 16,
  alignItems: 'start',
}

const projectRail: React.CSSProperties = {
  position: 'sticky',
  top: 88,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const workspaceMainLayout: React.CSSProperties = {
  minWidth: 0,
}

const railHeader: React.CSSProperties = {
  padding: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 16,
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--txt-3)',
}

const sectionTitle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 17,
  fontWeight: 700,
  color: 'var(--txt)',
}

const projectNameStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--txt)',
}

const mutedMetaStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--txt-3)',
  lineHeight: 1.45,
}

const progressBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 42,
  height: 28,
  borderRadius: 999,
  padding: '0 10px',
  background: 'rgba(218,223,33,.13)',
  color: 'var(--txt)',
  fontSize: 12,
  fontWeight: 700,
}

const progressTrack: React.CSSProperties = {
  width: '100%',
  height: 8,
  borderRadius: 999,
  background: 'var(--surface-3)',
  overflow: 'hidden',
}

const progressFill: React.CSSProperties = {
  display: 'block',
  height: '100%',
  background: 'linear-gradient(90deg, #d7df21 0%, #7fa357 100%)',
  borderRadius: 999,
}

const inlineMetaStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  fontSize: 11.5,
  color: 'var(--txt-3)',
}

const detailShell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const detailHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'flex-start',
  padding: 18,
  borderRadius: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
}

const detailTitleRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 10,
}

const projectHeadline: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  color: 'var(--txt)',
}

const detailMeta: React.CSSProperties = {
  marginTop: 8,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 14,
  fontSize: 12.5,
  color: 'var(--txt-3)',
}

const tabRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const workstreamCard: React.CSSProperties = {
  padding: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 16,
}

const workstreamHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  marginBottom: 14,
}

const miniProgressWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 180,
}

const emptyInline: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px dashed var(--line)',
  color: 'var(--txt-3)',
  fontSize: 12.5,
}

const subtaskTable: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const subtaskInlineItem: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const subtaskTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--txt)',
}

const rowRightMeta: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
}

const kanbanGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 14,
}

const kanbanColumn: React.CSSProperties = {
  padding: 14,
  borderRadius: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
}

const kanbanHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  alignItems: 'center',
  marginBottom: 12,
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--txt)',
}

const kanbanTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--txt)',
}

const ganttShell: React.CSSProperties = {
  padding: 16,
  borderRadius: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
}

const ganttLegend: React.CSSProperties = {
  display: 'flex',
  gap: 18,
  alignItems: 'center',
  fontSize: 12,
  color: 'var(--txt-3)',
  marginBottom: 16,
}

const ganttTable: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const ganttRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '220px minmax(0, 1fr)',
  gap: 12,
  alignItems: 'center',
}

const ganttLabel: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--txt)',
  fontWeight: 600,
}

const ganttTrack: React.CSSProperties = {
  position: 'relative',
  height: 34,
  borderRadius: 999,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 34px)',
  border: '1px solid var(--line)',
  overflow: 'hidden',
}

const ganttBar: React.CSSProperties = {
  marginTop: 4,
  height: 24,
  borderRadius: 999,
  cursor: 'grab',
  transition: 'transform 120ms ease',
}

const ganttToolbar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
  marginBottom: 14,
}

const ganttScroll: React.CSSProperties = {
  overflowX: 'auto',
  borderRadius: 14,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
}

const ganttGrid: React.CSSProperties = {
  display: 'grid',
  minWidth: '100%',
}

const ganttCornerCell: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 4,
  padding: '12px 14px',
  minHeight: 48,
  background: 'var(--surface)',
  borderRight: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 800,
  textTransform: 'uppercase',
}

const ganttHeaderCell: React.CSSProperties = {
  position: 'relative',
  minHeight: 48,
  borderBottom: '1px solid var(--line)',
  background: 'var(--surface)',
}

const ganttTick: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderLeft: '1px solid var(--line)',
  color: 'var(--txt-3)',
  fontSize: 11,
  whiteSpace: 'nowrap',
}

const ganttTodayLine: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 2,
  background: 'var(--color-lime)',
  zIndex: 3,
  boxShadow: '0 0 0 1px rgba(218,223,33,.18)',
}

const ganttLabelCell = (indent: number): React.CSSProperties => ({
  position: 'sticky',
  left: 0,
  zIndex: 2,
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  minHeight: 52,
  padding: `9px 12px 9px ${12 + indent * 18}px`,
  border: 'none',
  borderRight: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--txt)',
  textAlign: 'left',
})

const ganttLevelBadge = (level: GanttLevel): React.CSSProperties => ({
  flex: '0 0 auto',
  padding: '4px 7px',
  borderRadius: 999,
  background: level === 'project' ? 'rgba(218,223,33,.12)' : level === 'workstream' ? 'rgba(157,184,199,.14)' : 'var(--surface-3)',
  color: level === 'project' ? 'var(--color-lime)' : 'var(--txt-3)',
  fontSize: 10,
  fontWeight: 800,
})

const ganttItemTitle: React.CSSProperties = {
  display: 'block',
  color: 'var(--txt)',
  fontSize: 13,
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const ganttBarButton: React.CSSProperties = {
  position: 'absolute',
  top: 11,
  height: 28,
  borderRadius: 999,
  border: '1px solid transparent',
  cursor: 'grab',
  overflow: 'hidden',
  transition: 'transform 120ms ease, filter 120ms ease',
  textAlign: 'left',
}

const ganttBarFill: React.CSSProperties = {
  position: 'absolute',
  inset: '0 auto 0 0',
  borderRadius: 999,
}

const ganttBarText: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'block',
  padding: '6px 10px',
  fontSize: 11.5,
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const drawerInfoGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 8,
  padding: 12,
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt-2)',
  fontSize: 13,
}

const meetingCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 14,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
}

const meetingInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  fontSize: 12.5,
  color: 'var(--txt-2)',
  lineHeight: 1.5,
}

const reminderBox: React.CSSProperties = {
  marginTop: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 14,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  fontSize: 12.5,
  color: 'var(--txt-2)',
}

const subtaskPanel: React.CSSProperties = {
  marginTop: -2,
  padding: 14,
  borderRadius: 14,
  background: 'var(--surface)',
  border: '1px solid rgba(218,223,33,.28)',
  boxShadow: '0 16px 34px rgba(0,0,0,.16)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  borderLeft: '3px solid var(--color-lime)',
}

const subtaskPanelHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 14,
  alignItems: 'flex-start',
}

const warningBanner: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  background: 'var(--color-warning-bg)',
  color: 'var(--color-warning)',
  fontSize: 12.5,
  fontWeight: 600,
}

const compactDetailStack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const subtaskMetaGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 10,
}

const compactMetaCard: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
  padding: 12,
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  fontSize: 13,
}

const compactWarningBanner: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  padding: '10px 12px',
  borderRadius: 12,
  background: 'var(--color-warning-bg)',
  color: 'var(--color-warning)',
  fontSize: 12.5,
}

const warningActionButton: React.CSSProperties = {
  flexShrink: 0,
  border: '1px solid rgba(196,123,43,.35)',
  background: 'var(--surface)',
  color: 'var(--color-warning)',
  borderRadius: 999,
  padding: '7px 10px',
  fontSize: 12,
  fontWeight: 800,
}

const summaryCardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
}

const toneColor = (tone: 'neutral' | 'good' | 'warning' | 'danger') =>
  tone === 'good'
    ? 'var(--color-success)'
    : tone === 'warning'
      ? 'var(--color-warning)'
      : tone === 'danger'
        ? 'var(--color-danger)'
        : 'var(--txt-3)'

const toneBg = (tone: 'neutral' | 'good' | 'warning' | 'danger') =>
  tone === 'good'
    ? 'var(--color-success-bg)'
    : tone === 'warning'
      ? 'var(--color-warning-bg)'
      : tone === 'danger'
        ? 'var(--color-danger-bg)'
        : 'var(--surface-3)'

const summaryCardStyle = (active: boolean, tone: 'neutral' | 'good' | 'warning' | 'danger'): React.CSSProperties => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 92,
  padding: 12,
  borderRadius: 13,
  border: `1px solid ${active ? 'rgba(218,223,33,.45)' : tone === 'neutral' ? 'var(--line)' : toneColor(tone)}`,
  background: active ? 'rgba(218,223,33,.06)' : 'var(--surface-2)',
  textAlign: 'left',
  color: 'var(--txt)',
  cursor: 'pointer',
  boxShadow: active ? '0 0 0 1px rgba(218,223,33,.08)' : 'none',
})

const summaryIconStyle = (tone: 'neutral' | 'good' | 'warning' | 'danger'): React.CSSProperties => ({
  width: 34,
  height: 34,
  flexShrink: 0,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: toneColor(tone),
  background: toneBg(tone),
  fontSize: 16,
})

const summaryTitleStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 800,
  textTransform: 'uppercase',
  color: 'var(--txt-3)',
  marginBottom: 3,
}

const summaryValueStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  color: 'var(--txt)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const summaryHintStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 3,
  fontSize: 11.5,
  color: 'var(--txt-3)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const summaryBadgeStyle = (tone: 'neutral' | 'good' | 'warning' | 'danger'): React.CSSProperties => ({
  flexShrink: 0,
  padding: '4px 8px',
  borderRadius: 999,
  background: toneBg(tone),
  color: toneColor(tone),
  fontSize: 10.5,
  fontWeight: 800,
})

const accordionStack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const accordionSectionStyle: React.CSSProperties = {
  borderRadius: 13,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  overflow: 'hidden',
}

const accordionHeaderStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 13px',
  border: 'none',
  background: 'transparent',
  color: 'var(--txt)',
  textAlign: 'left',
  cursor: 'pointer',
}

const accordionChevronStyle = (open: boolean): React.CSSProperties => ({
  width: 24,
  height: 24,
  flexShrink: 0,
  borderRadius: 999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--txt-3)',
  transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
  transition: 'transform 140ms ease',
})

const accordionTitleStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13.5,
  color: 'var(--txt)',
}

const accordionSummaryStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 2,
  fontSize: 12,
  color: 'var(--txt-3)',
}

const accordionBadgeStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '4px 8px',
  borderRadius: 999,
  background: 'var(--color-warning-bg)',
  color: 'var(--color-warning)',
  fontSize: 10.5,
  fontWeight: 800,
}

const accordionBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '0 13px 13px',
}

const accordionActionRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
}

const smallPrimaryButton: React.CSSProperties = {
  border: '1px solid rgba(218,223,33,.35)',
  background: 'var(--color-lime)',
  color: 'var(--color-lime-ink)',
  borderRadius: 999,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 800,
}

const fieldLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--txt-3)',
}

const progressBigRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const textareaStyle: React.CSSProperties = {
  minHeight: 110,
  width: '100%',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  padding: '12px 14px',
  resize: 'vertical',
}

const stepWorkflowShell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 14,
  borderRadius: 14,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
}

const stepWorkflowHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
}

const stepTemplateNote: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  background: 'rgba(218,223,33,.07)',
  border: '1px solid rgba(218,223,33,.2)',
  color: 'var(--txt-2)',
  fontSize: 12,
  lineHeight: 1.45,
}

const stepProgressText: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--txt)',
}

const stepperList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const stepperItem: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '34px minmax(0, 1fr)',
  gap: 10,
  alignItems: 'start',
}

const stepConnector: React.CSSProperties = {
  position: 'absolute',
  left: 16,
  top: 36,
  bottom: -12,
  width: 2,
  background: 'var(--line)',
  opacity: 0.7,
}

const stepMarkerStyle = (status: TaskStatus): React.CSSProperties => ({
  position: 'relative',
  zIndex: 1,
  width: 34,
  height: 34,
  borderRadius: 999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid ${STATUS_META[status].color}`,
  background: status === 'COMPLETED' ? 'var(--color-success-bg)' : 'var(--surface)',
  color: STATUS_META[status].color,
  fontSize: 12,
  fontWeight: 800,
})

const stepCardStyle = (status: TaskStatus): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 13,
  borderRadius: 13,
  border: `1px solid ${status === 'BLOCKED' || status === 'REVISION_REQUIRED' ? 'rgba(184,64,64,.28)' : 'var(--line)'}`,
  background: status === 'COMPLETED' ? 'rgba(96,145,92,.08)' : 'var(--surface)',
})

const stepCardHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
}

const stepTitleStyle: React.CSSProperties = {
  color: 'var(--txt)',
  fontSize: 14,
  fontWeight: 800,
}

const stepDescriptionStyle: React.CSSProperties = {
  marginTop: 4,
  color: 'var(--txt-3)',
  fontSize: 12.5,
  lineHeight: 1.45,
}

const stepMetaGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
  color: 'var(--txt-3)',
  fontSize: 12,
}

const stepActionRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
}

const stepDraftForm: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  borderRadius: 12,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
}

const stepEditGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.1fr 0.9fr 0.9fr',
  gap: 10,
}

const stepToggleRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
}

const fileRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  color: 'var(--txt)',
  textDecoration: 'none',
}

const historyRowStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
}

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  zIndex: 200,
}

const modalCard: React.CSSProperties = {
  width: 'min(760px, 100%)',
  maxHeight: '88vh',
  overflowY: 'auto',
  padding: 18,
  borderRadius: 18,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const modalHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const iconGhostBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt-2)',
}

const modalFoot: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}

const formGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  padding: '10px 12px',
}

const toggleWrap: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  width: 'fit-content',
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 12px',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--txt-2)',
  fontSize: 12.5,
  fontWeight: 700,
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 13px',
  borderRadius: 12,
  border: '1px solid rgba(218,223,33,.4)',
  background: 'linear-gradient(180deg, #eef25c 0%, #d7df21 58%, #c5cb1b 100%)',
  color: 'var(--color-lime-ink)',
  fontSize: 12.5,
  fontWeight: 700,
}

const dangerBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 12px',
  borderRadius: 12,
  border: '1px solid rgba(184,64,64,.28)',
  background: 'var(--color-danger-bg)',
  color: 'var(--color-danger)',
  fontSize: 12.5,
  fontWeight: 700,
}

const iconButtonStyle = (tone: 'default' | 'danger'): React.CSSProperties => ({
  width: 30,
  height: 30,
  flex: '0 0 30px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 9,
  border: tone === 'danger' ? '1px solid rgba(184,64,64,.28)' : '1px solid var(--line)',
  background: tone === 'danger' ? 'var(--color-danger-bg)' : 'var(--surface)',
  color: tone === 'danger' ? 'var(--color-danger)' : 'var(--txt-2)',
  fontSize: 14,
})

const selectStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  padding: '9px 11px',
}
