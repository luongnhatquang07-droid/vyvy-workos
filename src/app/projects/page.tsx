'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { Drawer } from '@/components/feedback/Drawer'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { FileList } from '@/components/ui/FileList'
import { FileUpload } from '@/components/ui/FileUpload'
import { PageHead } from '@/components/ui/PageHead'
import { getVietnamDateKey } from '@/features/command-center/utils'
import { useCommandData } from '@/hooks/useCommandData'
import {
  isVersionInvalid,
  isVersionPending,
  isVersionRevision,
  isVersionValidForCompletion,
  normalizeVersionReviewStatus,
  type VersionReviewStatus,
} from '@/lib/deliverableVersionStatus'
import type {
  CommandCenterDeliverableRow,
  CommandCenterDeliverableVersionRow,
  CommandCenterMeetingRow,
  CommandCenterPersonRow,
  CommandCenterProjectRow,
  CommandCenterTaskStepRow,
  CommandCenterTaskRow,
  CommandCenterWorkstreamRow,
} from '@/lib/database.types'

type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'BLOCKED' | 'PENDING_APPROVAL' | 'REVISION_REQUIRED' | 'COMPLETED' | 'CANCELLED'
type ComposerMode = 'project' | 'workstream' | 'subtask' | 'meeting' | null
type ViewTab = 'overview' | 'kanban' | 'gantt' | 'meetings' | 'flowchart'
type ProjectWorkFilter = 'all' | 'unassigned'
type FlowchartFilter = 'all' | 'active' | 'completed' | 'delayed' | 'overdue' | 'unassigned'
type FlowchartNodeKind = 'project' | 'workstream' | 'subtask' | 'step'
type DeadlineSignalKind = 'overdue' | 'today' | 'upcoming' | 'normal' | 'none'
type BadgeTone = 'neutral' | 'warning' | 'danger' | 'success'
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
  deliverableReviewStatus: VersionReviewStatus | null
  deliverableIsValid: boolean
  deliverableBlocker: DeliverableBlocker
  deliverableRequiresApproval: boolean
  deliverableReviewerId: string | null
}

type DeliverableBlocker = 'MISTAKE' | 'REVISION' | 'MISSING' | 'PENDING_APPROVAL' | null

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
  taskDeliverableValid: boolean
  fileBlocker: DeliverableBlocker
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

interface DeleteDraft {
  kind: 'project' | 'workstream' | 'subtask' | 'step'
  title: string
  description: string
  projectId?: string
  workstreamId?: string
  subtaskId?: string
  stepId?: string
  sourceId?: string
}

interface FlowchartNode {
  kind: FlowchartNodeKind
  project: ProjectWorkspace
  workstream?: WorkstreamItem
  subtask?: SubtaskItem
  step?: StepItem
}

interface FlowchartPan {
  x: number
  y: number
}

interface ProjectsRouteTarget {
  projectId?: string
  taskId?: string
  tab?: ViewTab
}

interface ProjectOpsStats {
  today: number
  overdue: number
  upcoming: number
  unassigned: number
  missingEvidence: number
  pendingApproval: number
  blocked: number
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
const TASK_STATUS_ORDER: TaskStatus[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'WAITING',
  'PENDING_APPROVAL',
  'REVISION_REQUIRED',
  'COMPLETED',
  'BLOCKED',
  'CANCELLED',
]
const TASK_STATUS_OPTIONS = TASK_STATUS_ORDER.map((value) => ({ value, ...STATUS_META[value] }))
const FLOWCHART_FILTER_OPTIONS: Array<{ value: FlowchartFilter; label: string; shortLabel?: string; tone?: BadgeTone }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Đang thực hiện', shortLabel: 'Đang làm' },
  { value: 'completed', label: 'Đã hoàn thành', shortLabel: 'Xong', tone: 'success' },
  { value: 'delayed', label: 'Bị trì hoãn / Tạm dừng', shortLabel: 'Tạm dừng', tone: 'warning' },
  { value: 'overdue', label: 'Quá hạn', tone: 'danger' },
  { value: 'unassigned', label: 'Chưa gắn người', shortLabel: 'Chưa gắn' },
]
const KANBAN_COLUMNS = TASK_STATUS_ORDER
const CORE_KANBAN_COLUMNS: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']
const STEP_STATUSES: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PENDING_APPROVAL', 'REVISION_REQUIRED', 'COMPLETED']
const DAY_MS = 24 * 60 * 60 * 1000
const FLOWCHART_MIN_ZOOM = 0.5
const FLOWCHART_MAX_ZOOM = 1.6
const FLOWCHART_ZOOM_STEP = 0.1

export default function ProjectsPage() {
  return <ProjectsPageContent />
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
  const [projectWorkFilter, setProjectWorkFilter] = React.useState<ProjectWorkFilter>('all')
  const [composerMode, setComposerMode] = React.useState<ComposerMode>(null)
  const [composerParentId, setComposerParentId] = React.useState<string | null>(null)
  const [composerDraft, setComposerDraft] = React.useState<ComposerDraft>(createDraft())
  const [deadlineDraft, setDeadlineDraft] = React.useState<DragDraft | null>(null)
  const [deadlineReason, setDeadlineReason] = React.useState('')
  const [deleteDraft, setDeleteDraft] = React.useState<DeleteDraft | null>(null)
  const [deleteLoading, setDeleteLoading] = React.useState(false)
  const [activeUploadStepId, setActiveUploadStepId] = React.useState<string | null>(null)
  const [openDetailSections, setOpenDetailSections] = React.useState<DetailSection[]>([])
  const [fileRefreshKey, setFileRefreshKey] = React.useState(0)
  const [toast, setToast] = React.useState<{ message: string; tone: 'success' | 'danger' } | null>(null)
  const selectedProjectIdRef = React.useRef<string | null>(null)
  const selectedSubtaskIdRef = React.useRef<string | null>(null)
  const routeSelectionAppliedRef = React.useRef(false)
  const pendingScrollSubtaskIdRef = React.useRef<string | null>(null)
  const toastTimerRef = React.useRef<number | null>(null)
  const backgroundRefreshTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId
  }, [selectedProjectId])

  React.useEffect(() => {
    selectedSubtaskIdRef.current = selectedSubtaskId
  }, [selectedSubtaskId])

  React.useEffect(() => {
    if (loading) return

    const seeded = seedWorkspace(
      data?.projects ?? [],
      data?.tasks ?? [],
      data?.people ?? [],
      data?.workstreams ?? [],
      data?.taskSteps ?? [],
      data?.deliverables ?? [],
      data?.deliverableVersions ?? [],
      data?.meetings ?? [],
    )
    queueMicrotask(() => {
      const routeTarget = routeSelectionAppliedRef.current ? null : readProjectsRouteTarget()
      const currentProjectId = selectedProjectIdRef.current
      const currentSubtaskId = selectedSubtaskIdRef.current
      const nextProject = routeTarget
        ? findProjectForRouteTarget(seeded, routeTarget) ?? seeded.find((project) => project.id === currentProjectId) ?? seeded[0] ?? null
        : seeded.find((project) => project.id === currentProjectId) ?? seeded[0] ?? null
      const targetSubtaskId = routeTarget?.taskId ?? currentSubtaskId
      const nextSubtask = nextProject && targetSubtaskId ? findSubtask(nextProject, targetSubtaskId) : null

      if (routeTarget) {
        routeSelectionAppliedRef.current = true
        if (routeTarget.tab) setActiveTab(routeTarget.tab)
        if (routeTarget.taskId && nextSubtask) {
          setActiveTab('overview')
          pendingScrollSubtaskIdRef.current = nextSubtask.id
        }
      }

      const nextProjectId = nextProject?.id ?? null
      const nextSubtaskId = nextSubtask?.id ?? null
      selectedProjectIdRef.current = nextProjectId
      selectedSubtaskIdRef.current = nextSubtaskId

      setWorkspace(seeded)
      setSelectedProjectId(nextProjectId)
      setSelectedSubtaskId(nextSubtaskId)
      setReady(true)
    })
  }, [data?.deliverableVersions, data?.deliverables, data?.meetings, data?.people, data?.projects, data?.taskSteps, data?.tasks, data?.workstreams, loading])

  React.useEffect(() => {
    queueMicrotask(() => {
      setOpenDetailSections([])
      setActiveUploadStepId(null)
    })
  }, [selectedSubtaskId])

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      if (backgroundRefreshTimerRef.current) window.clearTimeout(backgroundRefreshTimerRef.current)
    }
  }, [])

  React.useEffect(() => {
    if (!selectedSubtaskId || pendingScrollSubtaskIdRef.current !== selectedSubtaskId) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`project-subtask-${selectedSubtaskId}`)?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
      pendingScrollSubtaskIdRef.current = null
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeTab, selectedSubtaskId, workspace])

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
  const selectedProjectOps = selectedProject ? getProjectOpsStats(selectedProject) : null

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

  function showToast(message: string, tone: 'success' | 'danger' = 'success') {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ message, tone })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200)
  }

  function updateSubtaskStatusLocal(subtaskId: string, status: TaskStatus) {
    updateWorkspace((current) =>
      current.map((project) => ({
        ...project,
        workstreams: project.workstreams.map((workstream) => ({
          ...workstream,
          subtasks: workstream.subtasks.map((subtask) =>
            subtask.id === subtaskId ? { ...subtask, status } : subtask,
          ),
        })),
      })),
    )
  }

  function scheduleBackgroundRefresh(delay = 700) {
    if (backgroundRefreshTimerRef.current) window.clearTimeout(backgroundRefreshTimerRef.current)
    backgroundRefreshTimerRef.current = window.setTimeout(() => {
      void refresh({ silent: true })
      backgroundRefreshTimerRef.current = null
    }, delay)
  }

  async function commitWorkspaceMutation(
    method: 'POST' | 'PATCH' | 'DELETE',
    body: Record<string, unknown>,
    options: { alertOnError?: boolean; refreshMode?: 'none' | 'background' | 'await' } = {},
  ): Promise<{ id?: string; ok?: boolean } | null> {
    try {
      const response = await fetch('/api/workspace-items', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as { id?: string; ok?: boolean; error?: string }
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không cập nhật được database.')
      if (options.refreshMode === 'await') await refresh({ silent: true })
      if (options.refreshMode === 'background') scheduleBackgroundRefresh()
      return payload
    } catch (err) {
      if (options.alertOnError !== false) {
        showToast(err instanceof Error ? err.message : 'Không cập nhật được database.', 'danger')
      }
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
      }, { refreshMode: 'await' })
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
      }, { refreshMode: 'await' })
    }

    if (composerMode === 'subtask' && selectedProject && composerParentId) {
      const result = await commitWorkspaceMutation('POST', {
        type: 'task',
        payload: {
          ...composerDraft,
          projectId: selectedProject.sourceProjectId ?? selectedProject.id,
          workstreamId: composerParentId,
        },
      }, { refreshMode: 'await' })
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
      }, { refreshMode: 'await' })
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

  async function saveSubtaskReport(subtask: SubtaskItem, value: string) {
    const previousValue = subtask.reportText
    updateSubtaskField('reportText', value)
    const result = await commitWorkspaceMutation('PATCH', {
      type: 'task',
      id: subtask.sourceTaskId ?? subtask.id,
      patch: { expectedResult: value },
    }, { alertOnError: false, refreshMode: 'background' })
    if (!result) {
      updateSubtaskField('reportText', previousValue)
      showToast('KhÃ´ng thá»ƒ lÆ°u bÃ¡o cÃ¡o. Vui lÃ²ng thá»­ láº¡i.', 'danger')
      return
    }
    showToast('ÄÃ£ lÆ°u bÃ¡o cÃ¡o.')
  }

  async function saveFlowchartSubtaskReport(subtask: SubtaskItem, value: string) {
    const previousValue = subtask.reportText
    updateWorkspace((current) =>
      current.map((project) => ({
        ...project,
        workstreams: project.workstreams.map((workstream) => ({
          ...workstream,
          subtasks: workstream.subtasks.map((item) => (item.id === subtask.id ? { ...item, reportText: value } : item)),
        })),
      })),
    )
    const result = await commitWorkspaceMutation('PATCH', {
      type: 'task',
      id: subtask.sourceTaskId ?? subtask.id,
      patch: { expectedResult: value },
    }, { alertOnError: false, refreshMode: 'background' })
    if (!result) {
      updateWorkspace((current) =>
        current.map((project) => ({
          ...project,
          workstreams: project.workstreams.map((workstream) => ({
            ...workstream,
            subtasks: workstream.subtasks.map((item) => (item.id === subtask.id ? { ...item, reportText: previousValue } : item)),
          })),
        })),
      )
      showToast('Không thể lưu báo cáo. Vui lòng thử lại.', 'danger')
      return false
    }
    showToast('Đã lưu báo cáo.')
    return true
  }

  async function saveSubtaskOwner(subtask: SubtaskItem, ownerId: string | null) {
    const previousOwnerId = subtask.ownerId
    updateSubtaskField('ownerId', ownerId)
    const result = await commitWorkspaceMutation('PATCH', {
      type: 'task',
      id: subtask.sourceTaskId ?? subtask.id,
      patch: { ownerId },
    }, { alertOnError: false, refreshMode: 'background' })
    if (!result) {
      updateSubtaskField('ownerId', previousOwnerId)
      showToast('KhÃ´ng thá»ƒ lÆ°u ngÆ°á»i phá»¥ trÃ¡ch. Vui lÃ²ng thá»­ láº¡i.', 'danger')
      return
    }
    showToast('ÄÃ£ lÆ°u ngÆ°á»i phá»¥ trÃ¡ch.')
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
    }, { alertOnError: false, refreshMode: 'background' })
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
      }, { refreshMode: 'await' })
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
    if (!project) return
    setDeleteDraft({
      kind: 'project',
      projectId,
      sourceId: project.sourceProjectId ?? project.id,
      title: `Xóa dự án "${project.name}"`,
      description: 'Dự án, đầu việc lớn, đầu việc con, bước và bàn giao liên quan sẽ được ẩn khỏi các view vận hành. Hành động này không hard-delete dữ liệu.',
    })
  }

  async function performDeleteProject(draft: DeleteDraft) {
    if (!draft.projectId || !draft.sourceId) return false
    const result = await commitWorkspaceMutation('DELETE', { type: 'project', id: draft.sourceId }, { alertOnError: false, refreshMode: 'background' })
    if (!result) return false
    updateWorkspace((current) => current.filter((item) => item.id !== draft.projectId))
    return true
  }

  async function deleteWorkstream(projectId: string, workstreamId: string) {
    const project = workspace.find((item) => item.id === projectId)
    const workstream = project?.workstreams.find((item) => item.id === workstreamId)
    if (!workstream) return
    if (workstream.id.startsWith('ungrouped-')) {
      showToast('Nhóm này được tạo tự động. Hãy xóa hoặc chuyển từng đầu việc con.', 'danger')
      return
    }
    setDeleteDraft({
      kind: 'workstream',
      projectId,
      workstreamId,
      sourceId: workstreamId,
      title: `Xóa đầu việc lớn "${workstream.title}"`,
      description: 'Các đầu việc con bên trong đầu việc lớn này sẽ không còn hiển thị trong workspace và các view vận hành.',
    })
  }

  async function performDeleteWorkstream(draft: DeleteDraft) {
    if (!draft.projectId || !draft.workstreamId || !draft.sourceId) return false
    const result = await commitWorkspaceMutation('DELETE', { type: 'workstream', id: draft.sourceId }, { alertOnError: false, refreshMode: 'background' })
    if (!result) return false
    updateWorkspace((current) =>
      current.map((item) =>
        item.id !== draft.projectId
          ? item
          : {
              ...item,
              workstreams: item.workstreams.filter((stream) => stream.id !== draft.workstreamId),
            },
      ),
    )
    return true
  }

  async function deleteSubtask(projectId: string, subtaskId: string) {
    const project = workspace.find((item) => item.id === projectId)
    const subtask = project?.workstreams.flatMap((stream) => stream.subtasks).find((item) => item.id === subtaskId)
    if (!subtask) return
    setDeleteDraft({
      kind: 'subtask',
      projectId,
      subtaskId,
      sourceId: subtask.sourceTaskId ?? subtask.id,
      title: `Xóa đầu việc con "${subtask.title}"`,
      description: 'Đầu việc con này, các bước và bàn giao liên quan sẽ được ẩn khỏi workspace vận hành.',
    })
  }

  async function performDeleteSubtask(draft: DeleteDraft) {
    if (!draft.projectId || !draft.subtaskId || !draft.sourceId) return false
    const result = await commitWorkspaceMutation('DELETE', { type: 'task', id: draft.sourceId }, { alertOnError: false, refreshMode: 'background' })
    if (!result) return false
    updateWorkspace((current) =>
      current.map((item) =>
        item.id !== draft.projectId
          ? item
          : {
              ...item,
              workstreams: item.workstreams.map((stream) => ({
                ...stream,
                subtasks: stream.subtasks.filter((task) => task.id !== draft.subtaskId),
              })),
            },
      ),
    )
    return true
  }

  async function deleteStep(subtaskId: string, stepId: string) {
    if (!selectedProject) return
    const step = selectedSubtask?.steps.find((item) => item.id === stepId)
    if (!step) return
    setDeleteDraft({
      kind: 'step',
      projectId: selectedProject.id,
      subtaskId,
      stepId,
      sourceId: stepId,
      title: `Xóa bước "${step.title}"`,
      description: 'Bước này sẽ không còn được tính trong quy trình thực hiện và tiến độ đầu việc con.',
    })
  }

  async function performDeleteStep(draft: DeleteDraft) {
    if (!draft.projectId || !draft.subtaskId || !draft.stepId || !draft.sourceId) return false
    const result = await commitWorkspaceMutation('DELETE', { type: 'step', id: draft.sourceId }, { alertOnError: false, refreshMode: 'background' })
    if (!result) return false
    updateWorkspace((current) =>
      current.map((project) =>
        project.id !== draft.projectId
          ? project
          : {
              ...project,
              workstreams: project.workstreams.map((workstream) => ({
                ...workstream,
                subtasks: workstream.subtasks.map((subtask) =>
                  subtask.id !== draft.subtaskId
                    ? subtask
                    : {
                        ...subtask,
                        steps: subtask.steps.filter((item) => item.id !== draft.stepId),
                      },
                ),
              })),
            },
      ),
    )
    return true
  }

  async function confirmDeleteDraft() {
    if (!deleteDraft || deleteLoading) return
    setDeleteLoading(true)
    const success =
      deleteDraft.kind === 'project'
        ? await performDeleteProject(deleteDraft)
        : deleteDraft.kind === 'workstream'
          ? await performDeleteWorkstream(deleteDraft)
          : deleteDraft.kind === 'subtask'
            ? await performDeleteSubtask(deleteDraft)
            : await performDeleteStep(deleteDraft)
    setDeleteLoading(false)
    if (!success) {
      showToast('Không thể xóa. Vui lòng thử lại.', 'danger')
      return
    }
    showToast('Đã xóa và cập nhật workspace.')
    setDeleteDraft(null)
  }

  async function updateKanbanSubtaskStatus(subtask: SubtaskItem, nextStatus: TaskStatus) {
    if (subtask.status === nextStatus) return true

    if (nextStatus === 'COMPLETED') {
      const blockers = getCompletionBlockers(subtask)
      if (blockers.length) {
        setSelectedSubtaskId(subtask.id)
        openBlockedSection(subtask)
        showToast(`Chưa thể hoàn thành: ${getCompactBlockerText(subtask)}`, 'danger')
        return false
      }
    }

    if (requiresEvidence(nextStatus) && !hasEvidence(subtask)) {
      setSelectedSubtaskId(subtask.id)
      openSubtaskSection('files')
    }

    const previousStatus = subtask.status
    updateSubtaskStatusLocal(subtask.id, nextStatus)
    const result = await commitWorkspaceMutation(
      'PATCH',
      {
        type: 'task',
        id: subtask.sourceTaskId ?? subtask.id,
        patch: { status: nextStatus },
      },
      { alertOnError: false, refreshMode: 'background' },
    )

    if (!result) {
      updateSubtaskStatusLocal(subtask.id, previousStatus)
      showToast('Không thể chuyển trạng thái. Vui lòng thử lại.', 'danger')
      return false
    }

    showToast(`Đã chuyển trạng thái sang ${STATUS_META[nextStatus].label}`)
    return true
  }

  function requestStatusChange(nextStatus: TaskStatus) {
    const targetSubtask = selectedSubtask as SubtaskItem
    if (!targetSubtask) return
    void updateKanbanSubtaskStatus(targetSubtask, nextStatus)
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
    }, { alertOnError: false, refreshMode: 'background' })
    setDeadlineDraft(null)
    setDeadlineReason('')
  }

  function renderInlineSubtaskDetail(subtask: SubtaskItem) {
    if (!selectedProject || selectedSubtaskId !== subtask.id) return null

    return (
      <section data-vyvy-inline-subtask-detail="true" style={subtaskPanel}>
        <div style={subtaskPanelHead}>
          <div>
            <div style={eyebrow}>Chi tiết đầu việc con</div>
            <div style={sectionTitle}>{subtask.title}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <DangerButton icon="ti-trash" onClick={() => deleteSubtask(selectedProject.id, subtask.id)}>Xóa đầu việc con</DangerButton>
            <select value={subtask.status} onChange={(e) => requestStatusChange(e.target.value as TaskStatus)} style={selectStyle}>
              {TASK_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={subtask.ownerId ?? ''}
              onChange={(e) => void saveSubtaskOwner(subtask, e.target.value || null)}
              style={selectStyle}
            >
              <option value="">Chưa gắn người</option>
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
          onSaveReport={(value) => void saveSubtaskReport(subtask, value)}
          onUpdateAttachments={(attachments) => updateSubtaskField('attachments', attachments)}
          onFilesChanged={() => {
            setFileRefreshKey((value) => value + 1)
            void refresh({ silent: true })
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
          <PrimaryButton icon="ti-plus" onClick={() => openComposer('project')}>Tạo dự án</PrimaryButton>
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
                      <ProgressBadge value={progress} label={projectHealth(project).label} />
                    </div>
                    <div style={progressTrack}><span data-vyvy-bar="true" style={{ ...progressFill, width: `${progress}%` }} /></div>
                    <div style={inlineMetaStyle}>
                      <span>{project.workstreams.flatMap((item) => item.subtasks).length} đầu việc con</span>
                      <span title={toFullDate(project.dueDate)}>{formatDeadlineLabel(project.dueDate, projectHealth(project).label === 'Hoàn thành' ? 'COMPLETED' : 'NOT_STARTED')}</span>
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
                    <ProgressBadge value={getProjectProgress(selectedProject)} label={projectHealth(selectedProject).label} />
                  </div>
                  <div style={detailMeta}>
                    <span>{people[selectedProject.ownerId ?? '']?.full_name ?? 'Chưa gắn chủ dự án'}</span>
                    <span title={toFullDate(selectedProject.dueDate)}>Deadline {formatDeadlineLabel(selectedProject.dueDate, projectHealth(selectedProject).label === 'Hoàn thành' ? 'COMPLETED' : 'NOT_STARTED')}</span>
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

              {selectedProjectOps ? (
                <ProjectOpsStrip
                  stats={selectedProjectOps}
                  activeFilter={projectWorkFilter}
                  onChangeFilter={setProjectWorkFilter}
                />
              ) : null}

              <div style={tabRow}>
                {[
                  { key: 'overview', label: 'Tổng quan' },
                  { key: 'kanban', label: 'Kanban' },
                  { key: 'gantt', label: 'Timeline / Gantt' },
                  { key: 'flowchart', label: 'Flowchart' },
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
                  activeFilter={projectWorkFilter}
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
                  activeFilter={projectWorkFilter}
                  onSelectSubtask={selectSubtask}
                  onChangeStatus={updateKanbanSubtaskStatus}
                  selectedSubtaskId={selectedSubtaskId}
                  renderSubtaskDetail={renderInlineSubtaskDetail}
                />
              ) : null}

              {activeTab === 'gantt' ? (
                <GanttTab project={selectedProject} onShift={handleBarShift} />
              ) : null}

              {activeTab === 'flowchart' ? (
                <FlowchartTab
                  project={selectedProject}
                  people={people}
                  onSaveSubtaskReport={saveFlowchartSubtaskReport}
                  onOpenSubtask={(subtaskId) => {
                    setSelectedSubtaskId(subtaskId)
                    setActiveTab('overview')
                  }}
                />
              ) : null}

              {activeTab === 'meetings' ? (
                <MeetingsTab project={selectedProject} />
              ) : null}


              </section>
            </div>
          ) : null}
        </div>
      )}

      {toast ? (
        <div style={toastStyle(toast.tone)} role="status">
          {toast.message}
        </div>
      ) : null}

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

      {deleteDraft ? (
        <ModalShell
          title={deleteDraft.title}
          onClose={() => {
            if (!deleteLoading) setDeleteDraft(null)
          }}
          onSubmit={confirmDeleteDraft}
          submitLabel={deleteLoading ? 'Đang xóa...' : 'Xác nhận xóa'}
          submitDisabled={deleteLoading}
          cancelLabel="Hủy"
        >
          <div style={mutedMetaStyle}>{deleteDraft.description}</div>
          <div style={deleteWarningStyle}>
            Dữ liệu được xử lý theo cơ chế an toàn, không hard-delete. Sau khi xác nhận, các view vận hành sẽ được cập nhật lại.
          </div>
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
  onSaveReport,
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
  onSaveReport: (value: string) => void
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
  const peopleOptions = React.useMemo(() => Object.values(people), [people])

  return (
    <div style={compactDetailStack}>
      <div style={subtaskMetaGrid}>
        <div style={compactMetaCard}>
          <span style={fieldLabel}>Owner</span>
          <strong>{people[subtask.ownerId ?? '']?.full_name ?? 'Chưa gắn người'}</strong>
        </div>
        <div style={compactMetaCard}>
          <span style={fieldLabel}>Deadline</span>
          <strong title={subtask.dueDate ? toFullDate(subtask.dueDate) : undefined}>{subtask.dueDate ? formatDeadlineLabel(subtask.dueDate, subtask.status) : 'Chưa có'}</strong>
        </div>
        <div style={compactMetaCard}>
          <span style={fieldLabel}>Progress</span>
          <div style={progressBigRow}>
            <div style={progressTrack}>
              <span data-vyvy-bar="true" style={{ ...progressFill, width: `${getSubtaskProgress(subtask)}%` }} />
            </div>
            <ProgressBadge value={getSubtaskProgress(subtask)} label={STATUS_META[subtask.status].label} />
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
            <button type="button" onClick={() => onSaveReport(subtask.reportText)} style={smallPrimaryButton}>
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
            peopleOptions={peopleOptions}
            defaultApproverId={activeUploadStep?.deliverableReviewerId ?? project.ownerId}
            requiresApproval={Boolean(activeUploadStep?.deliverableId)}
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
              reviewerId={activeUploadStep.deliverableReviewerId}
              requiresApproval={activeUploadStep.deliverableRequiresApproval || Boolean(activeUploadStep.deliverableId)}
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
        <ProgressBadge value={getSubtaskProgress(subtask)} label={STATUS_META[subtask.status].label} />
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
        <span title={step.dueDate ? toFullDate(step.dueDate) : undefined}>Deadline: <strong>{step.dueDate ? formatDeadlineLabel(step.dueDate, step.status) : 'Chưa có'}</strong></span>
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

function ProjectOpsStrip({
  stats,
  activeFilter,
  onChangeFilter,
}: {
  stats: ProjectOpsStats
  activeFilter: ProjectWorkFilter
  onChangeFilter: (filter: ProjectWorkFilter) => void
}) {
  return (
    <section style={opsStripStyle} aria-label="Cảnh báo vận hành dự án">
      <div style={opsStatGrid}>
        <OpsStat label="Đến hạn hôm nay" value={stats.today} tone={stats.today ? 'warning' : 'neutral'} />
        <OpsStat label="Quá hạn" value={stats.overdue} tone={stats.overdue ? 'danger' : 'neutral'} />
        <OpsStat label="Chưa gắn người" value={stats.unassigned} tone={stats.unassigned ? 'warning' : 'neutral'} />
        <OpsStat label="Thiếu file/báo cáo" value={stats.missingEvidence} tone={stats.missingEvidence ? 'danger' : 'neutral'} />
        <OpsStat label="Cần duyệt" value={stats.pendingApproval} tone={stats.pendingApproval ? 'warning' : 'neutral'} />
        <OpsStat label="Bị chặn" value={stats.blocked} tone={stats.blocked ? 'danger' : 'neutral'} />
      </div>
      <div style={projectFilterRow}>
        <button type="button" onClick={() => onChangeFilter('all')} style={filterChipStyle(activeFilter === 'all')}>
          Tất cả
        </button>
        <button type="button" onClick={() => onChangeFilter('unassigned')} style={filterChipStyle(activeFilter === 'unassigned', stats.unassigned > 0 ? 'warning' : 'neutral')}>
          Chưa gắn người · {stats.unassigned}
        </button>
      </div>
    </section>
  )
}

function OpsStat({ label, value, tone }: { label: string; value: number; tone: BadgeTone }) {
  return (
    <div style={opsStatCardStyle(tone)}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function ProgressBadge({ value, label }: { value: number; label?: string }) {
  const zero = value === 0
  const text = zero && label ? `0% · ${label}` : `${value}%`
  return <span style={progressBadgeStyle} title={label ? `Tiến độ ${value}% · ${label}` : `Tiến độ ${value}%`}>{text}</span>
}

function SubtaskSignalBadges({ subtask, compact = false }: { subtask: SubtaskItem; compact?: boolean }) {
  const deadline = getDeadlineSignal(subtask)
  const showDeadline = deadline.kind !== 'normal'
  const unassigned = isUnassignedSubtask(subtask)
  const urgentUnassigned = unassigned && (deadline.kind === 'overdue' || deadline.kind === 'today')

  if (!showDeadline && !unassigned) return null

  return (
    <div style={signalBadgeRowStyle(compact)}>
      {showDeadline ? (
        <span title={deadline.hint} style={alertBadgeStyle(deadline.tone)}>
          {deadline.label}
        </span>
      ) : null}
      {unassigned ? (
        <span style={alertBadgeStyle(urgentUnassigned ? 'danger' : 'warning')}>
          Chưa gắn người
        </span>
      ) : null}
    </div>
  )
}

function OverviewTab({
  project,
  people,
  activeFilter,
  selectedSubtaskId,
  onSelectSubtask,
  renderSubtaskDetail,
  onOpenSubtaskComposer,
  onDeleteWorkstream,
}: {
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  activeFilter: ProjectWorkFilter
  selectedSubtaskId: string | null
  onSelectSubtask: (id: string) => void
  renderSubtaskDetail: (subtask: SubtaskItem) => React.ReactNode
  onOpenSubtaskComposer: (workstreamId: string) => void
  onDeleteWorkstream: (workstreamId: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {project.workstreams.map((workstream) => {
        const visibleSubtasks = sortSubtasksForOperations(workstream.subtasks).filter((subtask) => matchesProjectWorkFilter(subtask, activeFilter))
        return (
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

          {visibleSubtasks.length === 0 ? (
            <div style={emptyInline}>Đầu việc lớn này chưa có đầu việc con.</div>
          ) : (
            <div style={subtaskTable}>
              {visibleSubtasks.map((subtask) => (
                <div key={subtask.id} style={subtaskInlineItem}>
                <button
                  key={subtask.id}
                  id={`project-subtask-${subtask.id}`}
                  data-vyvy-row="true"
                  onClick={() => onSelectSubtask(subtask.id)}
                  style={subtaskRowStyle(selectedSubtaskId === subtask.id, subtask)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={subtaskTitleStyle}>{subtask.title}</div>
                    <div style={mutedMetaStyle} title={subtask.dueDate ? toFullDate(subtask.dueDate) : undefined}>
                      {people[subtask.ownerId ?? '']?.full_name ?? 'Chưa gắn người'} · deadline {formatDeadlineLabel(subtask.dueDate, subtask.status)}
                    </div>
                    <SubtaskSignalBadges subtask={subtask} />
                  </div>
                  <div style={rowRightMeta}>
                    <span style={statusChipStyle(STATUS_META[subtask.status].bg, STATUS_META[subtask.status].color)}>
                      {STATUS_META[subtask.status].label}
                    </span>
                    <ProgressBadge value={getSubtaskProgress(subtask)} label={STATUS_META[subtask.status].label} />
                  </div>
                </button>
                  {renderSubtaskDetail(subtask)}
                </div>
              ))}
            </div>
          )}
        </section>
        )
      })}
    </div>
  )
}

function KanbanTab({
  project,
  people,
  activeFilter,
  selectedSubtaskId,
  onSelectSubtask,
  onChangeStatus,
  renderSubtaskDetail,
}: {
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  activeFilter: ProjectWorkFilter
  selectedSubtaskId: string | null
  onSelectSubtask: (id: string) => void
  onChangeStatus: (subtask: SubtaskItem, nextStatus: TaskStatus) => Promise<boolean>
  renderSubtaskDetail: (subtask: SubtaskItem) => React.ReactNode
}) {
  const [draggingSubtaskId, setDraggingSubtaskId] = React.useState<string | null>(null)
  const [mouseDragSubtaskId, setMouseDragSubtaskId] = React.useState<string | null>(null)
  const [mouseDragSourceStatus, setMouseDragSourceStatus] = React.useState<TaskStatus | null>(null)
  const [dragOverStatus, setDragOverStatus] = React.useState<TaskStatus | null>(null)
  const [showAllColumns, setShowAllColumns] = React.useState(false)
  const subtasks = project.workstreams.flatMap((workstream) =>
    workstream.subtasks.map((subtask) => ({ ...subtask, workstreamTitle: workstream.title })),
  ).filter((subtask) => matchesProjectWorkFilter(subtask, activeFilter))
  const activeDragSubtaskId = draggingSubtaskId ?? mouseDragSubtaskId
  const columnItems = KANBAN_COLUMNS.reduce((map, status) => {
    map[status] = sortSubtasksForOperations(subtasks.filter((subtask) => subtask.status === status))
    return map
  }, {} as Record<TaskStatus, Array<SubtaskItem & { workstreamTitle: string }>>)
  const visibleColumns = KANBAN_COLUMNS.filter((status) =>
    showAllColumns || CORE_KANBAN_COLUMNS.includes(status) || columnItems[status].length > 0,
  )
  const hiddenEmptyCount = KANBAN_COLUMNS.length - visibleColumns.length

  async function handleDrop(event: React.DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault()
    const subtaskId = event.dataTransfer.getData('text/plain') || draggingSubtaskId
    setDraggingSubtaskId(null)
    setMouseDragSubtaskId(null)
    setMouseDragSourceStatus(null)
    setDragOverStatus(null)
    const subtask = subtasks.find((item) => item.id === subtaskId)
    if (!subtask || subtask.status === status) return
    await onChangeStatus(subtask, status)
  }

  function beginMouseDrag(event: React.MouseEvent<HTMLElement>, subtask: SubtaskItem) {
    if (event.button !== 0) return
    setMouseDragSubtaskId(subtask.id)
    setMouseDragSourceStatus(subtask.status)
  }

  async function handleMouseDrop(status: TaskStatus) {
    if (!mouseDragSubtaskId) return
    const subtask = subtasks.find((item) => item.id === mouseDragSubtaskId)
    const sourceStatus = mouseDragSourceStatus
    setMouseDragSubtaskId(null)
    setMouseDragSourceStatus(null)
    setDragOverStatus(null)
    if (!subtask || sourceStatus === status || subtask.status === status) return
    await onChangeStatus(subtask, status)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={kanbanControlBar}>
        <div style={kanbanHintStyle}>
          Kéo thả card để đổi trạng thái, hoặc bấm Chuyển trạng thái.
          {!showAllColumns && hiddenEmptyCount > 0 ? <span> Đang ẩn {hiddenEmptyCount} cột trống.</span> : null}
        </div>
        <div style={kanbanToggleGroup}>
          <button type="button" onClick={() => setShowAllColumns(false)} style={kanbanToggleButtonStyle(!showAllColumns)}>
            Ẩn cột trống
          </button>
          <button type="button" onClick={() => setShowAllColumns(true)} style={kanbanToggleButtonStyle(showAllColumns)}>
            Hiện tất cả trạng thái
          </button>
        </div>
      </div>
      <div style={kanbanGridStyle(visibleColumns.length, showAllColumns)}>
      {visibleColumns.map((status) => {
        const items = columnItems[status]
        return (
          <section
            key={status}
            style={{ ...kanbanColumn, ...(dragOverStatus === status ? kanbanColumnDropActive : {}) }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDragOverStatus(status)
            }}
            onMouseEnter={() => {
              if (mouseDragSubtaskId) setDragOverStatus(status)
            }}
            onDragLeave={() => setDragOverStatus((current) => (current === status ? null : current))}
            onDrop={(event) => void handleDrop(event, status)}
            onMouseUp={() => void handleMouseDrop(status)}
          >
            <div style={kanbanHead}>
              <span>{STATUS_META[status].label}</span>
              <span style={progressBadgeStyle}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 80 }}>
              {!items.length ? <div style={kanbanEmptyState}>Chưa có việc</div> : null}
              {items.map((subtask) => (
                <div key={subtask.id} style={subtaskInlineItem}>
                <div
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-label={`Mở ${subtask.title}`}
                  onClick={() => onSelectSubtask(subtask.id)}
                  onMouseDown={(event) => beginMouseDrag(event, subtask)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelectSubtask(subtask.id)
                  }}
                  onDragStart={(event) => {
                    setDraggingSubtaskId(subtask.id)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', subtask.id)
                  }}
                  onDragEnd={() => {
                    setDraggingSubtaskId(null)
                    setMouseDragSubtaskId(null)
                    setMouseDragSourceStatus(null)
                    setDragOverStatus(null)
                  }}
                  style={kanbanCard(selectedSubtaskId === subtask.id, activeDragSubtaskId === subtask.id, subtask)}
                >
                  <div style={mutedMetaStyle}>{subtask.workstreamTitle}</div>
                  <div style={kanbanTitle}>{subtask.title}</div>
                  <SubtaskSignalBadges subtask={subtask} compact />
                  <div style={progressTrack}><span data-vyvy-bar="true" style={{ ...progressFill, width: `${getSubtaskProgress(subtask)}%` }} /></div>
                  <div style={inlineMetaStyle}>
                    <span>{people[subtask.ownerId ?? '']?.full_name ?? 'Chưa gắn người'}</span>
                    <span title={subtask.dueDate ? toFullDate(subtask.dueDate) : undefined}>{formatDeadlineLabel(subtask.dueDate, subtask.status)}</span>
                  </div>
                  <select
                    aria-label="Chuyển trạng thái"
                    value={subtask.status}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      event.stopPropagation()
                      void onChangeStatus(subtask, event.target.value as TaskStatus)
                    }}
                    style={kanbanStatusSelect}
                  >
                    {TASK_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                  {renderSubtaskDetail(subtask)}
                </div>
              ))}
            </div>
          </section>
        )
      })}
      </div>
    </div>
  )
}

function getDefaultFlowchartCollapsedIds(project: ProjectWorkspace) {
  return new Set(project.workstreams.map((workstream) => flowchartNodeId('workstream', workstream.id)))
}

function FlowchartTab({
  project,
  people,
  onSaveSubtaskReport,
  onOpenSubtask,
}: {
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  onSaveSubtaskReport: (subtask: SubtaskItem, value: string) => Promise<boolean>
  onOpenSubtask: (subtaskId: string) => void
}) {
  const [filter, setFilter] = React.useState<FlowchartFilter>('all')
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(() => getDefaultFlowchartCollapsedIds(project))
  const [selectedNode, setSelectedNode] = React.useState<FlowchartNode>(() => ({ kind: 'project', project }))
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState<FlowchartPan>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = React.useState(false)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [detailVisible, setDetailVisible] = React.useState(true)
  const flowchartScrollRef = React.useRef<HTMLDivElement | null>(null)
  const flowchartBoardRef = React.useRef<HTMLDivElement | null>(null)
  const panSessionRef = React.useRef<{ pointerId: number; startX: number; startY: number; pan: FlowchartPan } | null>(null)
  const previousProjectIdRef = React.useRef(project.id)

  React.useEffect(() => {
    if (previousProjectIdRef.current === project.id) return
    previousProjectIdRef.current = project.id
    queueMicrotask(() => {
      setSelectedNode({ kind: 'project', project })
      setCollapsedIds(getDefaultFlowchartCollapsedIds(project))
      setFilter('all')
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setDetailVisible(true)
    })
  }, [project])

  React.useEffect(() => {
    if (!isPanning) return

    function handlePointerMove(event: PointerEvent) {
      const session = panSessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      event.preventDefault()
      setPan({
        x: session.pan.x + event.clientX - session.startX,
        y: session.pan.y + event.clientY - session.startY,
      })
    }

    function handlePointerUp(event: PointerEvent) {
      const session = panSessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      panSessionRef.current = null
      setIsPanning(false)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [isPanning])

  React.useEffect(() => {
    if (!isFullscreen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsFullscreen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen])
  const collapseIds = React.useMemo(
    () => [
      ...project.workstreams.map((workstream) => flowchartNodeId('workstream', workstream.id)),
      ...project.workstreams.flatMap((workstream) => workstream.subtasks.map((subtask) => flowchartNodeId('subtask', subtask.id))),
    ],
    [project],
  )
  const visibleWorkstreams = React.useMemo(() => {
    if (filter === 'all') return project.workstreams
    return project.workstreams
      .map((workstream) => {
        const workstreamMatches = matchesWorkstreamFlowchartFilter(workstream, filter)
        return {
          ...workstream,
          subtasks: workstreamMatches
            ? workstream.subtasks
            : workstream.subtasks.filter((subtask) => matchesFlowchartFilter(subtask, filter)),
        }
      })
      .filter((workstream) => matchesWorkstreamFlowchartFilter(workstream, filter) || workstream.subtasks.length > 0)
  }, [filter, project])
  const selectedNodeKey = getFlowchartNodeKey(selectedNode)
  const allSubtasks = project.workstreams.flatMap((workstream) => workstream.subtasks)
  const allSteps = allSubtasks.flatMap((subtask) => subtask.steps)
  const visibleSubtaskCount = visibleWorkstreams.reduce((count, workstream) => (
    collapsedIds.has(flowchartNodeId('workstream', workstream.id)) ? count : count + workstream.subtasks.length
  ), 0)
  const visibleStepCount = visibleWorkstreams.reduce((count, workstream) => {
    if (collapsedIds.has(flowchartNodeId('workstream', workstream.id))) return count
    return count + workstream.subtasks.reduce((stepCount, subtask) => (
      collapsedIds.has(flowchartNodeId('subtask', subtask.id))
        ? stepCount
        : stepCount + getVisibleFlowchartSteps(subtask, filter).length
    ), 0)
  }, 0)
  const projectStatus = getFlowchartNodeStatus({ kind: 'project', project })
  const projectDeadline = project.dueDate ? `${formatDeadlineLabel(project.dueDate, projectStatus)} · ${toFullDate(project.dueDate)}` : 'Không deadline'
  const workspaceStyle: React.CSSProperties = isFullscreen
    ? {
        ...flowchartWorkspace,
        gridTemplateColumns: detailVisible ? 'minmax(0, 1fr) minmax(320px, 380px)' : 'minmax(0, 1fr)',
        flex: 1,
        minHeight: 0,
      }
    : flowchartWorkspace
  const canvasScrollStyle: React.CSSProperties = {
    ...flowchartScroll,
    maxHeight: isFullscreen ? 'calc(100vh - 150px)' : flowchartScroll.maxHeight,
    minHeight: isFullscreen ? 'calc(100vh - 150px)' : undefined,
    cursor: isPanning ? 'grabbing' : 'grab',
    userSelect: isPanning ? 'none' : undefined,
  }
  const zoomLayerStyle: React.CSSProperties = {
    ...flowchartZoomLayer,
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transition: isPanning ? 'none' : flowchartZoomLayer.transition,
  }

  function toggleCollapse(id: string) {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectFlowchartNode(node: FlowchartNode) {
    setSelectedNode(node)
    if (isFullscreen && !detailVisible) setDetailVisible(true)
  }

  function setFlowchartZoom(nextZoom: number, origin?: { x: number; y: number }) {
    const clampedZoom = clampZoom(nextZoom)
    if (zoom === clampedZoom) return
    const viewport = flowchartScrollRef.current
    const defaultOrigin = viewport
      ? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
      : { x: 0, y: 0 }
    const pivot = origin ?? defaultOrigin
    const ratio = clampedZoom / zoom
    setPan((currentPan) => ({
      x: pivot.x - (pivot.x - currentPan.x) * ratio,
      y: pivot.y - (pivot.y - currentPan.y) * ratio,
    }))
    setZoom(clampedZoom)
  }

  function fitFlowchartView() {
    const viewport = flowchartScrollRef.current
    const board = flowchartBoardRef.current
    if (!viewport || !board) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
      return
    }

    const safeWidth = Math.max(320, viewport.clientWidth - 64)
    const safeHeight = Math.max(260, viewport.clientHeight - 64)
    const boardWidth = Math.max(1, board.offsetWidth)
    const boardHeight = Math.max(1, board.offsetHeight)
    const nextZoom = clampZoom(Math.min(1.15, safeWidth / boardWidth, safeHeight / boardHeight))
    setZoom(nextZoom)
    setPan({
      x: Math.max(24, (viewport.clientWidth - boardWidth * nextZoom) / 2),
      y: Math.max(24, (viewport.clientHeight - boardHeight * nextZoom) / 2),
    })
  }

  function beginCanvasPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    if (isFlowchartPanBlocked(event.target)) return
    panSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pan,
    }
    setIsPanning(true)
  }

  function handleCanvasWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey) return
    event.preventDefault()
    const viewport = flowchartScrollRef.current
    const rect = viewport?.getBoundingClientRect()
    const origin = rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : undefined
    setFlowchartZoom(zoom + (event.deltaY > 0 ? -FLOWCHART_ZOOM_STEP : FLOWCHART_ZOOM_STEP), origin)
  }

  function selectFlowchartNodeByKey(nodeKey: string) {
    const projectKey = getFlowchartNodeKey({ kind: 'project', project })
    if (nodeKey === projectKey) {
      selectFlowchartNode({ kind: 'project', project })
      return
    }

    for (const workstream of project.workstreams) {
      const workstreamNode: FlowchartNode = { kind: 'workstream', project, workstream }
      if (nodeKey === getFlowchartNodeKey(workstreamNode)) {
        selectFlowchartNode(workstreamNode)
        return
      }

      for (const subtask of workstream.subtasks) {
        const subtaskNode: FlowchartNode = { kind: 'subtask', project, workstream, subtask }
        if (nodeKey === getFlowchartNodeKey(subtaskNode)) {
          selectFlowchartNode(subtaskNode)
          return
        }

        for (const step of subtask.steps) {
          const stepNode: FlowchartNode = { kind: 'step', project, workstream, subtask, step }
          if (nodeKey === getFlowchartNodeKey(stepNode)) {
            selectFlowchartNode(stepNode)
            return
          }
        }
      }
    }
  }

  function handleFlowchartBoardSelect(event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement)) return
    const nodeElement = event.target.closest('[data-flowchart-node-key]') as HTMLElement | null
    const nodeKey = nodeElement?.dataset.flowchartNodeKey
    if (!nodeKey) return
    event.stopPropagation()
    selectFlowchartNodeByKey(nodeKey)
  }

  const flowchartContent = (
    <section style={isFullscreen ? flowchartFullscreenShell : flowchartShell}>
      {isFullscreen ? (
        <div style={flowchartFullscreenToolbar}>
          <div style={flowchartFullscreenTitleBlock}>
            <span style={flowchartModeBadge}>Flowchart</span>
            <strong style={flowchartFullscreenTitle}>{project.name}</strong>
            <span style={flowchartFullscreenMeta}>
              {project.workstreams.length} đầu việc lớn · {allSubtasks.length} đầu việc con · {allSteps.length} bước
            </span>
          </div>
          <div style={flowchartFullscreenToolGroup}>
            {FLOWCHART_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                style={filterChipStyle(filter === option.value, option.tone ?? 'neutral')}
              >
                {option.shortLabel ?? option.label}
              </button>
            ))}
            <button type="button" onClick={() => setCollapsedIds(new Set(collapseIds))} style={filterChipStyle(false)}>
              Thu gọn
            </button>
            <button type="button" onClick={() => setCollapsedIds(new Set())} style={filterChipStyle(false)}>
              Mở rộng
            </button>
            <button type="button" onClick={() => setFlowchartZoom(zoom - FLOWCHART_ZOOM_STEP)} style={flowchartIconButton}>-</button>
            <span style={flowchartZoomValue}>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setFlowchartZoom(zoom + FLOWCHART_ZOOM_STEP)} style={flowchartIconButton}>+</button>
            <button type="button" onClick={fitFlowchartView} style={filterChipStyle(false)}>Fit view</button>
            <button type="button" onClick={() => setDetailVisible((value) => !value)} style={filterChipStyle(false)}>
              {detailVisible ? 'Ẩn chi tiết' : 'Hiện chi tiết'}
            </button>
            <button type="button" onClick={() => setIsFullscreen(false)} style={flowchartFullscreenButton}>
              <i className="ti ti-minimize" />
              Thoát full màn
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={flowchartHero}>
            <div>
              <div style={flowchartEyebrow}>Luồng vận hành dự án</div>
              <h3 style={flowchartHeroTitle}>{project.name}</h3>
              <div style={flowchartHeroMeta}>
                <span>Owner: {project.ownerId ? people[project.ownerId]?.full_name ?? 'Chưa gắn người' : 'Chưa gắn người'}</span>
                <span>Deadline: {projectDeadline}</span>
                <span>{project.workstreams.length} đầu việc lớn</span>
                <span>{allSubtasks.length} đầu việc con</span>
              </div>
            </div>
            <div style={flowchartZoomControls}>
              <button type="button" onClick={() => setFlowchartZoom(zoom - FLOWCHART_ZOOM_STEP)} style={flowchartIconButton}>-</button>
              <span style={flowchartZoomValue}>{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setFlowchartZoom(zoom + FLOWCHART_ZOOM_STEP)} style={flowchartIconButton}>+</button>
              <button type="button" onClick={fitFlowchartView} style={filterChipStyle(false)}>Fit view</button>
              <button type="button" onClick={() => setIsFullscreen(true)} style={flowchartFullscreenButton}>
                <i className="ti ti-maximize" />
                Mở full màn
              </button>
            </div>
          </div>

          <div style={flowchartToolbar}>
            <div style={flowchartControls}>
              {FLOWCHART_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  style={filterChipStyle(filter === option.value, option.tone ?? 'neutral')}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div style={flowchartControls}>
              <button type="button" onClick={() => setCollapsedIds(new Set(collapseIds))} style={filterChipStyle(false)}>
                Thu gọn tất cả
              </button>
              <button type="button" onClick={() => setCollapsedIds(new Set())} style={filterChipStyle(false)}>
                Mở rộng tất cả
              </button>
            </div>
          </div>

          <div style={flowchartStatsRow}>
            <span>{filter === 'all' ? 'Tất cả dữ liệu' : 'Đang lọc dữ liệu'}</span>
            <span>1 dự án</span>
            <span>{visibleWorkstreams.length}/{project.workstreams.length} đầu việc lớn</span>
            <span>{visibleSubtaskCount}/{allSubtasks.length} đầu việc con</span>
            <span>{visibleStepCount}/{allSteps.length} bước</span>
          </div>
        </>
      )}

      <div style={workspaceStyle}>
        <div style={isFullscreen ? { ...flowchartCanvasCard, ...flowchartCanvasCardFullscreen } : flowchartCanvasCard}>
          <div style={flowchartCanvasHeader}>
            <span>Dự án</span>
            <span>Đầu việc lớn</span>
            <span>Đầu việc con</span>
            <span>Bước</span>
          </div>

          <div
            ref={flowchartScrollRef}
            style={canvasScrollStyle}
            onPointerDown={beginCanvasPan}
            onWheel={handleCanvasWheel}
          >
            <div style={zoomLayerStyle}>
              <div ref={flowchartBoardRef} style={flowchartBoard} onClickCapture={handleFlowchartBoardSelect}>
                <div style={flowchartProjectRail}>
                  <FlowchartNodeCard
                    node={{ kind: 'project', project }}
                    people={people}
                    onClick={() => selectFlowchartNode({ kind: 'project', project })}
                    variant="project"
                    active={selectedNodeKey === getFlowchartNodeKey({ kind: 'project', project })}
                    pathActive={selectedNode.kind !== 'project'}
                  />
                  <div style={flowchartProjectRailLineStyle(selectedNode.project.id === project.id)} aria-hidden="true" />
                </div>

                <div style={flowchartLaneStack}>
                  {visibleWorkstreams.length === 0 ? (
                    <div style={emptyInline}>Không có nhánh nào khớp bộ lọc hiện tại.</div>
                  ) : (
                    visibleWorkstreams.map((workstream) => {
                      const workstreamNode: FlowchartNode = { kind: 'workstream', project, workstream }
                      const workstreamId = flowchartNodeId('workstream', workstream.id)
                      const workstreamCollapsed = collapsedIds.has(workstreamId)
                      const workstreamPathActive = isFlowchartWorkstreamPathActive(workstream, selectedNode)
                      return (
                        <div key={workstream.id} style={flowchartLane}>
                          <div style={flowchartLaneConnectorStyle(workstreamPathActive)} aria-hidden="true" data-flow-connector="project-workstream">
                            <span style={flowchartArrowHeadStyle(workstreamPathActive)} />
                          </div>
                          <div style={flowchartLaneWorkstream}>
                            <button
                              type="button"
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={() => toggleCollapse(workstreamId)}
                              style={flowchartToggle}
                            >
                              {workstreamCollapsed ? '+' : '-'}
                            </button>
                            <FlowchartNodeCard
                              node={workstreamNode}
                              people={people}
                              onClick={() => selectFlowchartNode(workstreamNode)}
                              active={selectedNodeKey === getFlowchartNodeKey(workstreamNode)}
                              pathActive={workstreamPathActive && selectedNodeKey !== getFlowchartNodeKey(workstreamNode)}
                            />
                          </div>

                          <div style={flowchartLaneSubtasksStyle(workstreamPathActive)}>
                            <span style={flowchartParentBridgeStyle(workstreamPathActive, 56)} aria-hidden="true" data-flow-connector="workstream-branch" />
                            {workstreamCollapsed ? (
                              <div style={flowchartCollapsedPill}>{workstream.subtasks.length} đầu việc con đang thu gọn</div>
                            ) : workstream.subtasks.length === 0 ? (
                              <div style={flowchartEmptyStep}>Chưa có đầu việc con.</div>
                            ) : (
                              workstream.subtasks.map((subtask) => {
                                const subtaskNode: FlowchartNode = { kind: 'subtask', project, workstream, subtask }
                                const subtaskId = flowchartNodeId('subtask', subtask.id)
                                const subtaskCollapsed = collapsedIds.has(subtaskId)
                                const visibleSteps = getVisibleFlowchartSteps(subtask, filter)
                                const subtaskPathActive = isFlowchartSubtaskPathActive(subtask, selectedNode)
                                return (
                                  <div key={subtask.id} style={flowchartSubtaskLane}>
                                    <div style={flowchartSubtaskConnectorStyle(subtaskPathActive)} aria-hidden="true" data-flow-connector="workstream-subtask">
                                      <span style={flowchartArrowHeadStyle(subtaskPathActive)} />
                                    </div>
                                    <div style={flowchartSubtaskCardSlot}>
                                      <button
                                        type="button"
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onClick={() => toggleCollapse(subtaskId)}
                                        style={flowchartToggle}
                                      >
                                        {subtaskCollapsed ? '+' : '-'}
                                      </button>
                                      <FlowchartNodeCard
                                        node={subtaskNode}
                                        people={people}
                                        onClick={() => selectFlowchartNode(subtaskNode)}
                                        active={selectedNodeKey === getFlowchartNodeKey(subtaskNode)}
                                        pathActive={subtaskPathActive && selectedNodeKey !== getFlowchartNodeKey(subtaskNode)}
                                      />
                                    </div>
                                    <div style={flowchartStepColumnStyle(subtaskPathActive)}>
                                      <span style={flowchartParentBridgeStyle(subtaskPathActive, 42)} aria-hidden="true" data-flow-connector="subtask-branch" />
                                      {subtaskCollapsed ? (
                                        <div style={flowchartCollapsedPill}>{subtask.steps.length} bước đang thu gọn</div>
                                      ) : visibleSteps.length === 0 ? (
                                        <div style={flowchartEmptyStep}>Chưa có bước khớp bộ lọc.</div>
                                      ) : (
                                        visibleSteps.map((step) => {
                                          const stepNode: FlowchartNode = { kind: 'step', project, workstream, subtask, step }
                                          const stepPathActive = isFlowchartStepPathActive(step, selectedNode)
                                          return (
                                            <div key={step.id} style={flowchartStepBranch}>
                                              <span style={flowchartStepConnectorStyle(stepPathActive)} aria-hidden="true" data-flow-connector="subtask-step">
                                                <span style={flowchartArrowHeadStyle(stepPathActive)} />
                                              </span>
                                              <FlowchartNodeCard
                                                node={stepNode}
                                                people={people}
                                                onClick={() => selectFlowchartNode(stepNode)}
                                                variant="step"
                                                active={selectedNodeKey === getFlowchartNodeKey(stepNode)}
                                                pathActive={stepPathActive}
                                              />
                                            </div>
                                          )
                                        })
                                      )}
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {!isFullscreen || detailVisible ? (
          <FlowchartDetailDrawer
            node={selectedNode}
            people={people}
            fullscreen={isFullscreen}
            onClose={isFullscreen ? () => setDetailVisible(false) : () => setSelectedNode({ kind: 'project', project })}
            onSaveSubtaskReport={onSaveSubtaskReport}
            onOpenSubtask={onOpenSubtask}
          />
        ) : null}
      </div>
    </section>
  )

  return isFullscreen && typeof document !== 'undefined' ? createPortal(flowchartContent, document.body) : flowchartContent
}

function FlowchartNodeCard({
  node,
  people,
  onClick,
  active = false,
  pathActive = false,
  variant = 'default',
}: {
  node: FlowchartNode
  people: Record<string, CommandCenterPersonRow>
  onClick: () => void
  active?: boolean
  pathActive?: boolean
  variant?: 'project' | 'default' | 'step'
}) {
  const title = getFlowchartNodeTitle(node)
  const owner = getFlowchartNodeOwner(node)
  const deadline = getFlowchartNodeDeadline(node)
  const status = getFlowchartNodeStatus(node)
  const progress = getFlowchartNodeProgress(node)
  const signal = getFlowchartSignal(status, deadline)
  const warnings = getFlowchartNodeWarnings(node)
  const handleSelect = React.useCallback(() => {
    onClick()
  }, [onClick])

  return (
    <div
      role="button"
      tabIndex={0}
      data-flowchart-node-key={getFlowchartNodeKey(node)}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        handleSelect()
      }}
      onMouseDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        handleSelect()
      }}
      onClick={handleSelect}
      onFocus={handleSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        handleSelect()
      }}
      style={flowchartNodeStyle(signal.tone, variant, active, pathActive)}
      title={`${title} · ${STATUS_META[status].label} · ${deadline ? toFullDate(deadline) : 'Không deadline'}`}
    >
      <div style={flowchartNodeTop}>
        <span style={flowchartKindBadge(node.kind)}>{getFlowchartKindLabel(node.kind)}</span>
        <span style={flowchartSignalBadge(signal.tone)}>{signal.icon ?? '•'}</span>
      </div>
      <strong style={flowchartNodeTitle}>{title}</strong>
      <div style={flowchartNodeMeta}>
        <span>{owner ? people[owner]?.full_name ?? 'Chưa gắn người' : 'Chưa gắn người'}</span>
        <span title={deadline ? toFullDate(deadline) : undefined}>{deadline ? formatDeadlineLabel(deadline, status) : 'Không deadline'}</span>
      </div>
      <div style={flowchartProgressArea}>
        <div style={flowchartProgressTrack}>
          <div style={{ ...flowchartProgressFill, width: `${progress}%`, background: STATUS_META[status].color }} />
        </div>
        <span style={flowchartProgressText}>{progress}%</span>
      </div>
      <div style={flowchartNodeBottom}>
        <span style={statusChipStyle(STATUS_META[status].bg, STATUS_META[status].color)}>
          {signal.label || STATUS_META[status].label}
        </span>
        {warnings.slice(0, 2).map((warning) => (
          <span key={warning} style={flowchartWarningChip}>{warning}</span>
        ))}
      </div>
    </div>
  )
}

function FlowchartDetailDrawer({
  node,
  people,
  fullscreen,
  onClose,
  onSaveSubtaskReport,
  onOpenSubtask,
}: {
  node: FlowchartNode | null
  people: Record<string, CommandCenterPersonRow>
  fullscreen?: boolean
  onClose: () => void
  onSaveSubtaskReport: (subtask: SubtaskItem, value: string) => Promise<boolean>
  onOpenSubtask: (subtaskId: string) => void
}) {
  if (!node) return null

  const title = getFlowchartNodeTitle(node)
  const owner = getFlowchartNodeOwner(node)
  const supporterNames = node.subtask?.supporterIds.map((id) => people[id]?.full_name).filter(Boolean).join(', ')
  const deadline = getFlowchartNodeDeadline(node)
  const status = getFlowchartNodeStatus(node)
  const progress = getFlowchartNodeProgress(node)
  const description = getFlowchartNodeDescription(node)
  const subtask = node.subtask
  const fileSummary = subtask ? getFileSummary(subtask) : null
  const workflowSummary = subtask ? getWorkflowSummary(subtask) : null
  const blockers = subtask ? getCompletionBlockers(subtask) : []
  const path = getFlowchartBreadcrumb(node)

  return (
    <aside style={fullscreen ? { ...flowchartDetailPanel, ...flowchartDetailPanelFullscreen } : flowchartDetailPanel}>
      <div style={flowchartPanelHeader}>
        <div>
          <div style={flowchartEyebrow}>Chi tiết node</div>
          <h3 style={flowchartPanelTitle}>{title}</h3>
        </div>
        <button type="button" onClick={onClose} style={flowchartIconButton} aria-label="Đóng chi tiết">
          ×
        </button>
      </div>

      <div style={flowchartPanelHero}>
        <span style={flowchartKindBadge(node.kind)}>{getFlowchartKindLabel(node.kind)}</span>
        <span style={statusChipStyle(STATUS_META[status].bg, STATUS_META[status].color)}>{STATUS_META[status].label}</span>
        <ProgressBadge value={progress} label={STATUS_META[status].label} />
      </div>

      <div style={flowchartInfoGrid}>
        <div style={flowchartInfoItem}><strong>Owner</strong><span>{owner ? people[owner]?.full_name ?? 'Chưa gắn người' : 'Chưa gắn người'}</span></div>
        <div style={flowchartInfoItem}><strong>Deadline</strong><span>{deadline ? `${formatDeadlineLabel(deadline, status)} · ${toFullDate(deadline)}` : 'Không deadline'}</span></div>
        <div style={flowchartInfoItem}><strong>Người phối hợp</strong><span>{supporterNames || 'Chưa có'}</span></div>
        <div style={flowchartInfoItem}><strong>Tiến độ</strong><span>{progress}%</span></div>
      </div>

      <section style={flowchartPanelCard}>
        <div style={sectionTitle}>Vị trí trong luồng</div>
        <div style={flowchartBreadcrumb}>
          {path.map((item, index) => (
            <React.Fragment key={`${item.kind}-${item.title}`}>
              {index ? <span style={flowchartBreadcrumbArrow}>→</span> : null}
              <span style={flowchartBreadcrumbItem}>{item.title}</span>
            </React.Fragment>
          ))}
        </div>
      </section>

      <section style={flowchartPanelCard}>
        <div style={sectionTitle}>Mô tả</div>
        <div style={mutedMetaStyle}>{description || 'Chưa có mô tả chi tiết.'}</div>
      </section>

      <section style={flowchartPanelCard}>
        <div style={sectionTitle}>Báo cáo / cập nhật kết quả</div>
        {subtask ? (
          <FlowchartReportEditor key={subtask.id} subtask={subtask} onSave={onSaveSubtaskReport} />
        ) : (
          <div style={mutedMetaStyle}>Cấp này chưa có báo cáo riêng. Báo cáo được theo dõi ở đầu việc con.</div>
        )}
      </section>

      <section style={flowchartPanelCard}>
        <div style={sectionTitle}>Quy trình thực hiện</div>
        <FlowchartWorkflowSummary node={node} />
        {workflowSummary ? <div style={mutedMetaStyle}>{workflowSummary.value} · {workflowSummary.hint}</div> : null}
        {blockers.length ? <div style={warningBanner}>Chưa thể hoàn thành: {getCompactBlockerText(subtask as SubtaskItem)}</div> : null}
      </section>

      <section style={flowchartPanelCard}>
        <div style={sectionTitle}>Bàn giao / file</div>
        {fileSummary ? (
          <>
            <div style={mutedMetaStyle}>{fileSummary.value} · {fileSummary.hint}</div>
            {subtask?.attachments.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {subtask.attachments.map((file) => (
                  <a key={file.id} href={file.url ?? '#'} target="_blank" rel="noreferrer" style={fileRowStyle}>
                    <i className="ti ti-paperclip" /> {file.name}
                  </a>
                ))}
              </div>
            ) : null}
          </>
        ) : node.step ? (
          <div style={mutedMetaStyle}>
            {node.step.requiresDeliverable ? deliverableStatusLabel(node.step) : 'Bước này không yêu cầu bàn giao.'}
          </div>
        ) : (
          <div style={mutedMetaStyle}>Bàn giao được tổng hợp ở các đầu việc con và bước bên dưới.</div>
        )}
      </section>

      <section style={flowchartPanelCard}>
        <div style={sectionTitle}>Deadline</div>
        <div style={deadline && isOverdue(deadline, status) ? flowchartDeadlineDanger : mutedMetaStyle}>
          {deadline ? `${formatDeadlineLabel(deadline, status)} · ${toFullDate(deadline)}` : 'Không deadline'}
        </div>
      </section>

      <div style={flowchartPanelActions}>
        <button type="button" onClick={onClose} style={ghostBtnStyle}>Đóng</button>
        {subtask ? (
          <PrimaryButton icon="ti-external-link" onClick={() => onOpenSubtask(subtask.id)}>
            Mở trong Tổng quan
          </PrimaryButton>
        ) : null}
      </div>
    </aside>
  )
}

function FlowchartReportEditor({
  subtask,
  onSave,
}: {
  subtask: SubtaskItem
  onSave: (subtask: SubtaskItem, value: string) => Promise<boolean>
}) {
  const [reportDraft, setReportDraft] = React.useState(subtask.reportText)
  const [savingReport, setSavingReport] = React.useState(false)

  async function saveReport() {
    if (savingReport) return
    setSavingReport(true)
    const ok = await onSave(subtask, reportDraft)
    setSavingReport(false)
    if (!ok) setReportDraft(subtask.reportText)
  }

  return (
    <>
      <textarea value={reportDraft} onChange={(event) => setReportDraft(event.target.value)} style={textareaStyle} placeholder="Nhập cập nhật kết quả..." />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PrimaryButton icon="ti-device-floppy" onClick={saveReport} disabled={savingReport}>
          {savingReport ? 'Đang lưu...' : 'Lưu báo cáo'}
        </PrimaryButton>
      </div>
    </>
  )
}

function FlowchartWorkflowSummary({ node }: { node: FlowchartNode }) {
  if (node.kind === 'project') {
    return <div style={mutedMetaStyle}>{node.project.workstreams.length} đầu việc lớn · {node.project.workstreams.flatMap((workstream) => workstream.subtasks).length} đầu việc con</div>
  }
  if (node.kind === 'workstream' && node.workstream) {
    return <div style={mutedMetaStyle}>{node.workstream.subtasks.length} đầu việc con trong đầu việc lớn này.</div>
  }
  if (node.kind === 'subtask' && node.subtask) {
    return (
      <div style={flowchartStepMiniList}>
        {node.subtask.steps.length === 0 ? <div style={mutedMetaStyle}>Chưa có bước.</div> : null}
        {node.subtask.steps.map((step) => (
          <div key={step.id} style={flowchartStepMiniItem}>
            <span style={statusChipStyle(STATUS_META[step.status].bg, STATUS_META[step.status].color)}>{STATUS_META[step.status].label}</span>
            <span>{step.title}</span>
          </div>
        ))}
      </div>
    )
  }
  if (node.step) {
    return <div style={mutedMetaStyle}>{node.step.description || node.step.note || 'Chưa có mô tả cho bước này.'}</div>
  }
  return null
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
        <span><span style={legendDot('#6B7280')} /> Chưa bắt đầu</span>
        <span><span style={legendDot('#3B82F6')} /> Đang làm</span>
        <span><span style={legendDot('#F2C94C')} /> Đang chờ</span>
        <span><span style={legendDot('#A78BFA')} /> Chờ duyệt</span>
        <span><span style={legendDot('#F59E0B')} /> Cần sửa</span>
        <span><span style={legendDot('var(--color-success)')} /> Hoàn thành</span>
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
            {todayLeft >= 0 && todayLeft <= timelineWidth ? <span style={{ ...ganttTodayLabel, left: todayLeft }}>Hôm nay</span> : null}
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
                    {isOverdue(row.dueDate, row.status) ? <span style={ganttOverdueBadge}>Quá hạn</span> : null}
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
              <div title={selected.missingStartDate ? undefined : toFullDate(selected.startDate)}><strong>Bắt đầu:</strong> {selected.missingStartDate ? 'Chưa nhập' : toShortDate(selected.startDate)}</div>
              <div title={selected.missingDueDate ? undefined : toFullDate(selected.dueDate)}><strong>Deadline:</strong> {selected.missingDueDate ? 'Chưa nhập' : formatDeadlineLabel(selected.dueDate, selected.status)}</div>
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
  const tooltip = `${item.title} · ${STATUS_META[item.status].label} · Deadline ${toFullDate(item.dueDate)} · ${getGanttUrgencyLabel(item)}`

  return (
    <button
      type="button"
      title={tooltip}
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
  if (isOverdue(item.dueDate, item.status) || item.status === 'BLOCKED') {
    return { bg: 'rgba(184,64,64,.2)', fill: 'rgba(184,64,64,.62)', border: 'rgba(184,64,64,.52)', color: 'var(--txt)' }
  }
  if (item.status === 'NOT_STARTED') return { bg: 'rgba(107,114,128,.16)', fill: 'rgba(107,114,128,.58)', border: 'rgba(107,114,128,.42)', color: 'var(--txt)' }
  if (item.status === 'IN_PROGRESS') return { bg: 'rgba(59,130,246,.16)', fill: 'rgba(59,130,246,.62)', border: 'rgba(59,130,246,.42)', color: 'var(--txt)' }
  if (item.status === 'WAITING') return { bg: 'rgba(242,201,76,.16)', fill: 'rgba(242,201,76,.62)', border: 'rgba(242,201,76,.42)', color: 'var(--txt)' }
  if (item.status === 'PENDING_APPROVAL') return { bg: 'rgba(167,139,250,.16)', fill: 'rgba(167,139,250,.62)', border: 'rgba(167,139,250,.42)', color: 'var(--txt)' }
  if (item.status === 'REVISION_REQUIRED') return { bg: 'rgba(245,158,11,.16)', fill: 'rgba(245,158,11,.64)', border: 'rgba(245,158,11,.42)', color: 'var(--txt)' }
  if (item.status === 'COMPLETED') return { bg: 'rgba(96,145,92,.18)', fill: 'rgba(96,145,92,.64)', border: 'rgba(96,145,92,.38)', color: 'var(--txt)' }
  return { bg: 'rgba(47,52,63,.2)', fill: 'rgba(75,85,99,.62)', border: 'rgba(75,85,99,.42)', color: 'var(--txt)' }
}

function getGanttUrgencyLabel(item: GanttItem) {
  if (item.missingDueDate) return 'Thiếu deadline'
  if (item.status === 'COMPLETED') return 'Đã hoàn thành'
  if (item.status === 'CANCELLED') return 'Đã hủy'
  const days = dayDiff(getVietnamDateKey(), item.dueDate)
  if (days < 0) return `Trễ ${Math.abs(days)} ngày`
  if (days === 0) return 'Đến hạn hôm nay'
  return `Còn ${days} ngày`
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
  cancelLabel = 'Đóng',
}: {
  title: string
  onClose: () => void
  onSubmit: () => void
  submitLabel: string
  children: React.ReactNode
  submitDisabled?: boolean
  cancelLabel?: string
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
          <GhostButton icon="ti-x" onClick={onClose}>{cancelLabel}</GhostButton>
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
  deliverableVersions: CommandCenterDeliverableVersionRow[],
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
      const subtasks = streamTasks.map((task, taskIndex) => toSeedSubtask(task, startDate, taskIndex, taskSteps, deliverables, deliverableVersions))
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
          subtasks: ungroupedTasks.map((task, taskIndex) => toSeedSubtask(task, startDate, taskIndex, taskSteps, deliverables, deliverableVersions)),
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
  deliverableVersions: CommandCenterDeliverableVersionRow[],
): SubtaskItem {
  const dueDate = task.due_date ?? shiftDate(projectStart, 5 + index * 2)
  const startDate = task.start_date ?? shiftDate(dueDate, -3)
  const taskDeliverables = deliverables.filter((deliverable) => deliverable.task_id === task.id)
  const persistedSteps = taskSteps
    .filter((step) => step.task_id === task.id)
    .map((step) => {
      const linkedDeliverable = taskDeliverables.find((deliverable) => deliverable.step_id === step.id)
      const evidence = getDeliverableEvidenceState(linkedDeliverable, deliverableVersions)
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
        deliverableStatus: evidence.status,
        deliverableReviewStatus: evidence.reviewStatus,
        deliverableIsValid: evidence.valid,
        deliverableBlocker: evidence.blocker,
        deliverableRequiresApproval: evidence.requiresApproval,
        deliverableReviewerId: linkedDeliverable?.reviewer_id ?? null,
      }
    })
  const taskLevelDeliverable = taskDeliverables.find((deliverable) => !deliverable.step_id)
  const taskEvidence = getDeliverableEvidenceState(taskLevelDeliverable, deliverableVersions)

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
    taskDeliverableValid: taskEvidence.valid,
    fileBlocker: taskEvidence.blocker,
    attachments: [],
    deadlineHistory: [],
    steps: persistedSteps,
  }
}

function getDeliverableEvidenceState(
  deliverable: CommandCenterDeliverableRow | null | undefined,
  versions: CommandCenterDeliverableVersionRow[],
): {
  status: CommandCenterDeliverableRow['status'] | null
  reviewStatus: VersionReviewStatus | null
  valid: boolean
  blocker: DeliverableBlocker
  requiresApproval: boolean
} {
  if (!deliverable) {
    return { status: null, reviewStatus: null, valid: false, blocker: null, requiresApproval: false }
  }

  const relatedVersions = versions
    .filter((version) => version.deliverable_id === deliverable.id)
    .sort((a, b) => b.version_number - a.version_number)
  const latestRelevant = relatedVersions.find((version) => !isVersionInvalid(normalizeVersionReviewStatus(version.review_status)))

  if (relatedVersions.length && !latestRelevant) {
    return {
      status: 'NOT_SUBMITTED',
      reviewStatus: normalizeVersionReviewStatus(relatedVersions[0].review_status),
      valid: false,
      blocker: 'MISTAKE',
      requiresApproval: true,
    }
  }

  if (latestRelevant) {
    const reviewStatus = normalizeVersionReviewStatus(latestRelevant.review_status)
    const requiresApproval = true
    const valid = isVersionValidForCompletion(reviewStatus, requiresApproval)
    const status: CommandCenterDeliverableRow['status'] =
      reviewStatus === 'APPROVED'
        ? 'APPROVED'
        : isVersionRevision(reviewStatus)
          ? 'REVISION_REQUIRED'
          : 'SUBMITTED'
    return {
      status,
      reviewStatus,
      valid,
      blocker: valid
          ? null
          : isVersionRevision(reviewStatus)
            ? 'REVISION'
            : isVersionPending(reviewStatus)
              ? 'PENDING_APPROVAL'
              : 'MISSING',
      requiresApproval,
    }
  }

  if (deliverable.status === 'APPROVED') {
    return { status: deliverable.status, reviewStatus: 'APPROVED', valid: true, blocker: null, requiresApproval: true }
  }

  if (deliverable.status === 'SUBMITTED') {
    return {
      status: deliverable.status,
      reviewStatus: 'PENDING',
      valid: false,
      blocker: 'PENDING_APPROVAL',
      requiresApproval: true,
    }
  }

  if (deliverable.status === 'REVISION_REQUIRED' || deliverable.status === 'MISSING_INFORMATION') {
    return { status: deliverable.status, reviewStatus: 'REVISION_REQUESTED', valid: false, blocker: 'REVISION', requiresApproval: true }
  }

  return { status: deliverable.status, reviewStatus: null, valid: false, blocker: 'MISSING', requiresApproval: true }
}

function normalizeStatus(value: string): TaskStatus {
  if (value === 'COMPLETED' || value === 'DONE') return 'COMPLETED'
  if (value === 'PENDING_APPROVAL' || value === 'WAITING_APPROVAL') return 'PENDING_APPROVAL'
  if (value === 'BLOCKED') return 'BLOCKED'
  if (value === 'WAITING') return 'WAITING'
  if (value === 'REVISION_REQUIRED') return 'REVISION_REQUIRED'
  if (value === 'CANCELLED') return 'CANCELLED'
  if (value === 'IN_PROGRESS') return 'IN_PROGRESS'
  if (value === 'TODO') return 'NOT_STARTED'
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
    deliverableReviewStatus: null,
    deliverableIsValid: false,
    deliverableBlocker: null,
    deliverableRequiresApproval: false,
    deliverableReviewerId: null,
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
  if (step.deliverableBlocker === 'MISTAKE') return 'File up nhầm - cần nộp lại'
  if (step.deliverableRequiresApproval && !step.deliverableIsValid && step.deliverableReviewStatus && !isVersionRevision(step.deliverableReviewStatus)) return 'Đang chờ duyệt'
  if (step.deliverableIsValid && step.deliverableReviewStatus === 'APPROVED') return 'File đã duyệt'
  if (step.deliverableIsValid) return 'Đã nộp 1 file'
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

function readProjectsRouteTarget(): ProjectsRouteTarget | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const projectId = params.get('projectId') ?? undefined
  const taskId = params.get('taskId') ?? params.get('subtaskId') ?? undefined
  const tab = coerceViewTab(params.get('tab'))

  if (!projectId && !taskId && !tab) return null
  return { projectId, taskId, tab }
}

function coerceViewTab(value: string | null): ViewTab | undefined {
  if (
    value === 'overview'
    || value === 'kanban'
    || value === 'gantt'
    || value === 'meetings'
    || value === 'flowchart'
  ) {
    return value
  }
  return undefined
}

function findProjectForRouteTarget(projects: ProjectWorkspace[], target: ProjectsRouteTarget) {
  if (target.projectId) {
    const byProjectId = projects.find((project) =>
      project.id === target.projectId || project.sourceProjectId === target.projectId,
    )
    if (byProjectId) return byProjectId
  }

  if (target.taskId) {
    return projects.find((project) => Boolean(findSubtask(project, target.taskId ?? null))) ?? null
  }

  return null
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

  if (subtask.status === 'NOT_STARTED') {
    if (completedCount === progressSteps.length && completedCount > 0) nextStatus = 'PENDING_APPROVAL'
    else if (completedCount > 0) nextStatus = 'IN_PROGRESS'
  } else if (subtask.status === 'IN_PROGRESS' && completedCount === progressSteps.length && completedCount > 0) {
    nextStatus = 'PENDING_APPROVAL'
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
  if (subtask.status === 'COMPLETED') return 100
  if (!subtask.steps.length) return 0
  const requiredSteps = subtask.steps.filter((step) => step.isRequired)
  const progressSteps = requiredSteps.length ? requiredSteps : subtask.steps
  return Math.round((progressSteps.filter((step) => step.status === 'COMPLETED').length / progressSteps.length) * 100)
}

function getRequiredStepStats(subtask: SubtaskItem) {
  const requiredSteps = subtask.steps.filter((step) => step.isRequired)
  const progressSteps = requiredSteps.length ? requiredSteps : subtask.steps
  if (subtask.status === 'COMPLETED') {
    return {
      completed: progressSteps.length,
      total: progressSteps.length,
      requiredCompleted: requiredSteps.length,
      requiredTotal: requiredSteps.length,
    }
  }
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
  const mistakenSteps = getMistakenDeliverableSteps(subtask)
  if (subtask.fileBlocker === 'MISTAKE' || mistakenSteps.length) {
    return {
      value: 'File up nhầm',
      hint: mistakenSteps.length ? `${mistakenSteps.length} bước cần nộp lại file đúng` : 'File đã nộp bị đánh dấu up nhầm.',
      tone: 'danger',
      badge: 'Up nhầm',
    }
  }

  const revisionSteps = getRevisionDeliverableSteps(subtask)
  if (subtask.fileBlocker === 'REVISION' || revisionSteps.length) {
    return {
      value: 'File cần sửa',
      hint: revisionSteps.length ? revisionSteps.map((step) => step.title).join(', ') : 'File/báo cáo đang bị yêu cầu sửa.',
      tone: 'danger',
      badge: 'Cần xử lý',
    }
  }

  const pendingApprovalSteps = getPendingApprovalDeliverableSteps(subtask)
  if (subtask.fileBlocker === 'PENDING_APPROVAL' || pendingApprovalSteps.length) {
    return {
      value: 'Chờ duyệt file',
      hint: pendingApprovalSteps.length ? `${pendingApprovalSteps.length} bước đã nộp và đang chờ duyệt` : 'File đã nộp nhưng cần được duyệt trước khi hoàn thành.',
      tone: 'warning',
      badge: 'Chờ duyệt',
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

  const submittedCount = subtask.attachments.length + (subtask.taskDeliverableValid ? 1 : 0) + subtask.steps.filter((step) => step.deliverableIsValid).length
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
      !step.deliverableIsValid &&
      step.deliverableBlocker !== 'REVISION' &&
      step.deliverableBlocker !== 'MISTAKE' &&
      step.deliverableBlocker !== 'PENDING_APPROVAL',
  )
}

function getRevisionDeliverableSteps(subtask: SubtaskItem) {
  return subtask.steps.filter(
    (step) =>
      step.requiresDeliverable &&
      step.deliverableBlocker === 'REVISION',
  )
}

function getMistakenDeliverableSteps(subtask: SubtaskItem) {
  return subtask.steps.filter(
    (step) =>
      step.requiresDeliverable &&
      step.isRequired &&
      step.deliverableBlocker === 'MISTAKE',
  )
}

function getPendingApprovalDeliverableSteps(subtask: SubtaskItem) {
  return subtask.steps.filter(
    (step) =>
      step.requiresDeliverable &&
      step.isRequired &&
      step.deliverableBlocker === 'PENDING_APPROVAL',
  )
}

function getBlockedSection(subtask: SubtaskItem): DetailSection {
  if (
    getMissingDeliverableSteps(subtask).length ||
    getRevisionDeliverableSteps(subtask).length ||
    getMistakenDeliverableSteps(subtask).length ||
    getPendingApprovalDeliverableSteps(subtask).length
  ) return 'files'
  if ((subtask.needsFile || requiresEvidence(subtask.status)) && !hasEvidence(subtask)) return 'files'
  if (!subtask.reportText.trim()) return 'report'
  return 'workflow'
}

function getCompactBlockerText(subtask: SubtaskItem) {
  if (subtask.fileBlocker === 'MISTAKE' || getMistakenDeliverableSteps(subtask).length) {
    return 'file đã nộp bị đánh dấu up nhầm. Vui lòng nộp lại file đúng.'
  }
  if (subtask.fileBlocker === 'PENDING_APPROVAL' || getPendingApprovalDeliverableSteps(subtask).length) return 'file/báo cáo đang chờ duyệt.'
  if (getRevisionDeliverableSteps(subtask).length) return 'file/báo cáo đang bị yêu cầu sửa.'
  if (getMissingDeliverableSteps(subtask).length || ((subtask.needsFile || requiresEvidence(subtask.status)) && !hasEvidence(subtask))) {
    return 'thiếu file/báo cáo.'
  }
  if (subtask.steps.some((step) => step.isRequired && step.status !== 'COMPLETED')) return 'còn bước bắt buộc chưa hoàn thành.'
  if (!subtask.reportText.trim()) return 'thiếu báo cáo/kết quả đầu việc.'
  return getCompletionBlockers(subtask).join('; ') || 'còn điều kiện chưa đạt.'
}

function getCompletionBlockers(subtask: SubtaskItem) {
  if (subtask.status === 'COMPLETED') return []
  const blockers: string[] = []
  if (!subtask.reportText.trim()) {
    blockers.push('nhập báo cáo/kết quả đầu việc')
  }

  const requiredSteps = subtask.steps.filter((step) => step.isRequired)
  const incompleteRequired = requiredSteps.filter((step) => step.status !== 'COMPLETED')
  if (incompleteRequired.length) {
    blockers.push(`${incompleteRequired.length} bước bắt buộc chưa hoàn thành`)
  }

  const mistakenDeliverables = getMistakenDeliverableSteps(subtask)
  if (subtask.fileBlocker === 'MISTAKE' || mistakenDeliverables.length) {
    blockers.push('file đã nộp bị đánh dấu up nhầm. Vui lòng nộp lại file đúng')
  }

  const pendingApprovalDeliverables = getPendingApprovalDeliverableSteps(subtask)
  if (subtask.fileBlocker === 'PENDING_APPROVAL' || pendingApprovalDeliverables.length) {
    blockers.push(`file đang chờ duyệt${pendingApprovalDeliverables.length ? ` ở ${pendingApprovalDeliverables.map((step) => step.title).join(', ')}` : ''}`)
  }

  const missingDeliverables = subtask.steps.filter(
    (step) =>
      step.requiresDeliverable &&
      step.isRequired &&
      !step.deliverableIsValid &&
      step.deliverableBlocker !== 'REVISION' &&
      step.deliverableBlocker !== 'MISTAKE' &&
      step.deliverableBlocker !== 'PENDING_APPROVAL',
  )
  if (missingDeliverables.length) {
    blockers.push(missingDeliverables.map((step) => step.title).join(', '))
  }

  const revisionDeliverables = subtask.steps.filter(
    (step) =>
      step.requiresDeliverable &&
      step.deliverableBlocker === 'REVISION',
  )
  if (subtask.fileBlocker === 'REVISION' || revisionDeliverables.length) {
    blockers.push(revisionDeliverables.length ? `file cần sửa ở ${revisionDeliverables.map((step) => step.title).join(', ')}` : 'file/báo cáo đang bị yêu cầu sửa')
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
  const subtasks = project.workstreams.flatMap((item) => item.subtasks)
  const progress = getProjectProgress(project)
  const overdue = subtasks.filter((subtask) => isOverdue(subtask.dueDate, subtask.status)).length
  const blocked = subtasks.filter((subtask) => subtask.status === 'BLOCKED').length
  const pending = subtasks.filter((subtask) => subtask.status === 'PENDING_APPROVAL').length
  const active = subtasks.filter((subtask) =>
    !['NOT_STARTED', 'CANCELLED'].includes(subtask.status),
  ).length

  if (!project.workstreams.length && !subtasks.length) {
    return { label: 'Chưa khởi tạo', bg: 'var(--surface-3)', color: 'var(--txt-2)' }
  }
  if (progress === 100 && subtasks.length > 0) {
    return { label: 'Hoàn thành', bg: 'var(--color-success-bg)', color: 'var(--color-success)' }
  }
  if (overdue > 0 || blocked > 0) {
    return { label: 'Có rủi ro', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' }
  }
  if (pending >= Math.max(2, Math.ceil(subtasks.length * 0.25))) {
    return { label: 'Chờ duyệt', bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' }
  }
  if (active > 0 || progress > 0) {
    return { label: 'Đang triển khai', bg: 'var(--color-waiting-bg)', color: 'var(--color-waiting)' }
  }
  return { label: 'Đã lên kế hoạch', bg: 'rgba(107,138,153,0.16)', color: '#8AA4B2' }
}

function getProjectOpsStats(project: ProjectWorkspace): ProjectOpsStats {
  const subtasks = project.workstreams.flatMap((workstream) => workstream.subtasks)
  return {
    today: subtasks.filter((subtask) => getDeadlineSignal(subtask).kind === 'today').length,
    overdue: subtasks.filter((subtask) => getDeadlineSignal(subtask).kind === 'overdue').length,
    upcoming: subtasks.filter((subtask) => getDeadlineSignal(subtask).kind === 'upcoming').length,
    unassigned: subtasks.filter(isUnassignedSubtask).length,
    missingEvidence: subtasks.filter(subtaskNeedsEvidence).length,
    pendingApproval: subtasks.filter(subtaskNeedsApproval).length,
    blocked: subtasks.filter((subtask) => subtask.status === 'BLOCKED').length,
  }
}

function getDeadlineSignal(subtask: SubtaskItem): { kind: DeadlineSignalKind; label: string; hint: string; tone: BadgeTone; days: number | null } {
  if (!subtask.dueDate || subtask.missingDueDate) {
    return { kind: 'none', label: 'Không deadline', hint: 'Đầu việc con chưa có deadline.', tone: 'neutral', days: null }
  }

  if (subtask.status === 'COMPLETED' || subtask.status === 'CANCELLED') {
    return { kind: 'normal', label: toShortDate(subtask.dueDate), hint: `Deadline: ${toShortDate(subtask.dueDate)}`, tone: 'neutral', days: null }
  }

  const days = dayDiff(getVietnamDateKey(), subtask.dueDate)
  if (days < 0) return { kind: 'overdue', label: `Quá hạn ${Math.abs(days)} ngày`, hint: `Deadline đã trễ ${Math.abs(days)} ngày.`, tone: 'danger', days }
  if (days === 0) return { kind: 'today', label: 'Hôm nay', hint: 'Deadline đến hạn hôm nay.', tone: 'warning', days }
  if (days <= 3) return { kind: 'upcoming', label: `Còn ${days} ngày`, hint: `Deadline còn ${days} ngày.`, tone: 'warning', days }
  return { kind: 'normal', label: toShortDate(subtask.dueDate), hint: `Deadline: ${toShortDate(subtask.dueDate)}`, tone: 'neutral', days }
}

function isUnassignedSubtask(subtask: SubtaskItem) {
  return !subtask.ownerId
}

function matchesProjectWorkFilter(subtask: SubtaskItem, filter: ProjectWorkFilter) {
  if (filter === 'unassigned') return isUnassignedSubtask(subtask)
  return true
}

function subtaskNeedsEvidence(subtask: SubtaskItem) {
  if (
    subtask.fileBlocker === 'MISSING' ||
    subtask.fileBlocker === 'MISTAKE' ||
    subtask.fileBlocker === 'REVISION'
  ) return true
  if ((subtask.needsFile || requiresEvidence(subtask.status)) && !hasEvidence(subtask)) return true
  return getMissingDeliverableSteps(subtask).length > 0
}

function subtaskNeedsApproval(subtask: SubtaskItem) {
  return (
    subtask.status === 'PENDING_APPROVAL' ||
    subtask.fileBlocker === 'PENDING_APPROVAL' ||
    getPendingApprovalDeliverableSteps(subtask).length > 0
  )
}

function sortSubtasksForOperations<T extends SubtaskItem>(subtasks: T[]): T[] {
  return [...subtasks].sort(compareSubtasksForOperations)
}

function compareSubtasksForOperations(a: SubtaskItem, b: SubtaskItem) {
  const scoreDiff = getSubtaskOperationScore(a) - getSubtaskOperationScore(b)
  if (scoreDiff) return scoreDiff
  const dueDiff = (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')
  if (dueDiff) return dueDiff
  return a.title.localeCompare(b.title, 'vi')
}

function getSubtaskOperationScore(subtask: SubtaskItem) {
  const deadline = getDeadlineSignal(subtask).kind
  if (deadline === 'overdue') return 0
  if (deadline === 'today') return 1
  if (isUnassignedSubtask(subtask)) return 2
  if (subtask.status === 'BLOCKED') return 3
  if (subtask.status === 'REVISION_REQUIRED') return 4
  if (subtask.status === 'PENDING_APPROVAL') return 5
  if (deadline === 'upcoming') return 6
  if (subtask.dueDate && !subtask.missingDueDate) return 7
  return 8
}

function flowchartNodeId(kind: FlowchartNodeKind, id: string) {
  return `${kind}-${id}`
}

function clampZoom(value: number) {
  return Math.min(FLOWCHART_MAX_ZOOM, Math.max(FLOWCHART_MIN_ZOOM, Number(value.toFixed(2))))
}

function isFlowchartPanBlocked(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true
  return Boolean(target.closest('[data-flowchart-node-key], button, a, input, select, textarea, [role="button"]'))
}

function matchesFlowchartFilter(subtask: SubtaskItem, filter: FlowchartFilter) {
  return matchesSubtaskFlowchartFilter(subtask, filter) || subtask.steps.some((step) => matchesStepFlowchartFilter(step, filter))
}

function matchesWorkstreamFlowchartFilter(workstream: WorkstreamItem, filter: FlowchartFilter) {
  if (filter === 'all') return true
  if (filter === 'active') return workstream.status === 'IN_PROGRESS'
  if (filter === 'completed') return workstream.status === 'COMPLETED'
  if (filter === 'delayed') return ['WAITING', 'BLOCKED', 'REVISION_REQUIRED', 'PENDING_APPROVAL'].includes(workstream.status)
  if (filter === 'overdue') return isOverdue(workstream.dueDate, workstream.status)
  if (filter === 'unassigned') return !workstream.ownerId
  return true
}

function matchesSubtaskFlowchartFilter(subtask: SubtaskItem, filter: FlowchartFilter) {
  if (filter === 'all') return true
  if (filter === 'active') return subtask.status === 'IN_PROGRESS'
  if (filter === 'completed') return subtask.status === 'COMPLETED'
  if (filter === 'delayed') return ['WAITING', 'BLOCKED', 'REVISION_REQUIRED', 'PENDING_APPROVAL'].includes(subtask.status)
  if (filter === 'overdue') return getDeadlineSignal(subtask).kind === 'overdue'
  if (filter === 'unassigned') return isUnassignedSubtask(subtask)
  return true
}

function matchesStepFlowchartFilter(step: StepItem, filter: FlowchartFilter) {
  if (filter === 'all') return true
  if (filter === 'active') return step.status === 'IN_PROGRESS'
  if (filter === 'completed') return step.status === 'COMPLETED'
  if (filter === 'delayed') return ['WAITING', 'BLOCKED', 'REVISION_REQUIRED', 'PENDING_APPROVAL'].includes(step.status)
  if (filter === 'overdue') return isOverdue(step.dueDate, step.status)
  if (filter === 'unassigned') return !step.ownerId
  return true
}

function getVisibleFlowchartSteps(subtask: SubtaskItem, filter: FlowchartFilter) {
  if (filter === 'all') return subtask.steps
  const matchedSteps = subtask.steps.filter((step) => matchesStepFlowchartFilter(step, filter))
  return matchesSubtaskFlowchartFilter(subtask, filter) ? subtask.steps : matchedSteps
}

function getFlowchartNodeKey(node: FlowchartNode) {
  if (node.kind === 'project') return flowchartNodeId('project', node.project.id)
  if (node.kind === 'workstream') return flowchartNodeId('workstream', node.workstream?.id ?? node.project.id)
  if (node.kind === 'subtask') return flowchartNodeId('subtask', node.subtask?.id ?? node.project.id)
  return flowchartNodeId('step', node.step?.id ?? node.project.id)
}

function isFlowchartWorkstreamPathActive(workstream: WorkstreamItem, selectedNode: FlowchartNode) {
  return selectedNode.workstream?.id === workstream.id
}

function isFlowchartSubtaskPathActive(subtask: SubtaskItem, selectedNode: FlowchartNode) {
  return selectedNode.subtask?.id === subtask.id
}

function isFlowchartStepPathActive(step: StepItem, selectedNode: FlowchartNode) {
  return selectedNode.step?.id === step.id
}

function getFlowchartNodeWarnings(node: FlowchartNode) {
  const warnings: string[] = []
  const deadline = getFlowchartNodeDeadline(node)
  const status = getFlowchartNodeStatus(node)
  if (!getFlowchartNodeOwner(node)) warnings.push('Chưa gắn')
  if (deadline && isOverdue(deadline, status)) warnings.push('Quá hạn')
  if (node.subtask) {
    if (node.subtask.needsFile && !hasEvidence(node.subtask)) warnings.push('Thiếu file')
    if (node.subtask.status === 'PENDING_APPROVAL') warnings.push('Chờ duyệt')
    if (['BLOCKED', 'REVISION_REQUIRED', 'WAITING'].includes(node.subtask.status)) warnings.push('Cần xử lý')
  }
  if (node.step?.requiresDeliverable && !node.step.deliverableIsValid) warnings.push('Thiếu bàn giao')
  return warnings
}

function getFlowchartBreadcrumb(node: FlowchartNode) {
  return [
    { kind: 'project', title: node.project.name },
    node.workstream ? { kind: 'workstream', title: node.workstream.title } : null,
    node.subtask ? { kind: 'subtask', title: node.subtask.title } : null,
    node.step ? { kind: 'step', title: node.step.title } : null,
  ].filter(Boolean) as Array<{ kind: FlowchartNodeKind; title: string }>
}

function getFlowchartNodeTitle(node: FlowchartNode) {
  if (node.kind === 'project') return node.project.name
  if (node.kind === 'workstream') return node.workstream?.title ?? 'Đầu việc lớn'
  if (node.kind === 'subtask') return node.subtask?.title ?? 'Đầu việc con'
  return node.step?.title ?? 'Bước'
}

function getFlowchartNodeOwner(node: FlowchartNode) {
  if (node.kind === 'project') return node.project.ownerId
  if (node.kind === 'workstream') return node.workstream?.ownerId ?? null
  if (node.kind === 'subtask') return node.subtask?.ownerId ?? null
  return node.step?.ownerId ?? node.subtask?.ownerId ?? null
}

function getFlowchartNodeDeadline(node: FlowchartNode) {
  if (node.kind === 'project') return node.project.dueDate
  if (node.kind === 'workstream') return node.workstream?.dueDate ?? ''
  if (node.kind === 'subtask') return node.subtask?.dueDate ?? ''
  return node.step?.dueDate ?? ''
}

function getFlowchartNodeStatus(node: FlowchartNode): TaskStatus {
  if (node.kind === 'project') return progressStatus(getProjectProgress(node.project), node.project.dueDate)
  if (node.kind === 'workstream' && node.workstream) return progressStatus(getWorkstreamProgress(node.workstream), node.workstream.dueDate, node.workstream.status)
  if (node.kind === 'subtask') return node.subtask?.status ?? 'NOT_STARTED'
  return node.step?.status ?? 'NOT_STARTED'
}

function getFlowchartNodeProgress(node: FlowchartNode) {
  if (node.kind === 'project') return getProjectProgress(node.project)
  if (node.kind === 'workstream' && node.workstream) return getWorkstreamProgress(node.workstream)
  if (node.kind === 'subtask' && node.subtask) return getSubtaskProgress(node.subtask)
  return node.step?.status === 'COMPLETED' ? 100 : 0
}

function getFlowchartNodeDescription(node: FlowchartNode) {
  if (node.kind === 'project') return node.project.description
  if (node.kind === 'workstream') return `Đầu việc lớn gồm ${node.workstream?.subtasks.length ?? 0} đầu việc con trong dự án ${node.project.name}.`
  if (node.kind === 'subtask') return node.subtask?.reportText || 'Chưa có mô tả hoặc cập nhật kết quả cho đầu việc con này.'
  return node.step?.description || node.step?.note || ''
}

function getFlowchartKindLabel(kind: FlowchartNodeKind) {
  if (kind === 'project') return 'Dự án'
  if (kind === 'workstream') return 'Đầu việc lớn'
  if (kind === 'subtask') return 'Đầu việc con'
  return 'Bước'
}

function getFlowchartSignal(status: TaskStatus, deadline: string): { icon: string | null; label: string | null; tone: BadgeTone } {
  if (deadline && isOverdue(deadline, status)) return { icon: '!', label: 'Trễ hạn', tone: 'danger' }
  if (status === 'COMPLETED') return { icon: '✓', label: 'Hoàn thành', tone: 'success' }
  if (['WAITING', 'BLOCKED', 'REVISION_REQUIRED', 'PENDING_APPROVAL'].includes(status)) {
    return { icon: '!', label: STATUS_META[status].label, tone: 'warning' }
  }
  return { icon: null, label: null, tone: 'neutral' }
}

function hasEvidence(subtask: SubtaskItem) {
  return Boolean(
    subtask.reportText.trim()
    || subtask.attachments.length
    || subtask.taskDeliverableValid
    || subtask.steps.some((step) => step.deliverableIsValid),
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

function toFullDate(value: string) {
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDeadlineLabel(value: string, status: TaskStatus) {
  if (!value) return 'Chưa có deadline'
  if (status === 'COMPLETED') return `Đã xong · ${toShortDate(value)}`
  if (status === 'CANCELLED') return `Đã hủy · ${toShortDate(value)}`
  const days = dayDiff(getVietnamDateKey(), value)
  if (days < 0) return `Trễ ${Math.abs(days)} ngày`
  if (days === 0) return 'Hôm nay'
  if (days <= 14) return `Còn ${days} ngày`
  return toShortDate(value)
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

function subtaskRowStyle(active: boolean, subtask?: SubtaskItem): React.CSSProperties {
  const deadline = subtask ? getDeadlineSignal(subtask).kind : 'normal'
  const urgent = deadline === 'overdue' || deadline === 'today'
  const unassigned = subtask ? isUnassignedSubtask(subtask) : false
  const alert = urgent && unassigned
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 12,
    border: `1px solid ${active ? 'rgba(218,223,33,.45)' : alert ? 'rgba(184,64,64,.42)' : urgent ? 'rgba(184,139,62,.42)' : 'var(--line)'}`,
    background: active ? 'rgba(218,223,33,.06)' : alert ? 'rgba(184,64,64,.12)' : urgent ? 'rgba(184,139,62,.10)' : 'var(--surface-2)',
    textAlign: 'left',
  }
}

function kanbanCard(active: boolean, dragging = false, subtask?: SubtaskItem): React.CSSProperties {
  const deadline = subtask ? getDeadlineSignal(subtask).kind : 'normal'
  const urgent = deadline === 'overdue' || deadline === 'today'
  const unassigned = subtask ? isUnassignedSubtask(subtask) : false
  const alert = urgent && unassigned
  return {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    border: `1px solid ${active ? 'rgba(218,223,33,.45)' : alert ? 'rgba(184,64,64,.42)' : urgent ? 'rgba(184,139,62,.42)' : 'var(--line)'}`,
    background: active ? 'rgba(218,223,33,.06)' : alert ? 'rgba(184,64,64,.12)' : urgent ? 'rgba(184,139,62,.10)' : 'var(--surface-2)',
    textAlign: 'left',
    cursor: dragging ? 'grabbing' : 'grab',
    opacity: dragging ? 0.62 : 1,
    boxShadow: dragging ? '0 18px 36px rgba(0,0,0,.28)' : 'none',
    transition: 'border-color .16s ease, background .16s ease, opacity .16s ease, box-shadow .16s ease',
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

const opsStripStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
}

const opsStatGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
  gap: 8,
}

function opsStatCardStyle(tone: BadgeTone): React.CSSProperties {
  const danger = tone === 'danger'
  const warning = tone === 'warning'
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minHeight: 58,
    padding: '10px 12px',
    borderRadius: 12,
    border: `1px solid ${danger ? 'rgba(184,64,64,.38)' : warning ? 'rgba(184,139,62,.38)' : 'var(--line)'}`,
    background: danger ? 'rgba(184,64,64,.12)' : warning ? 'rgba(184,139,62,.10)' : 'var(--surface-2)',
    color: danger ? 'var(--color-danger)' : warning ? 'var(--color-warning)' : 'var(--txt)',
    fontSize: 12,
    fontWeight: 700,
  }
}

const projectFilterRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

function filterChipStyle(active: boolean, tone: BadgeTone = 'neutral'): React.CSSProperties {
  const warning = tone === 'warning'
  const danger = tone === 'danger'
  const success = tone === 'success'
  const toneBorder = danger ? 'rgba(184,64,64,.42)' : warning ? 'rgba(184,139,62,.38)' : success ? 'rgba(96,145,92,.38)' : 'var(--line)'
  const toneBackground = danger ? 'rgba(184,64,64,.11)' : warning ? 'rgba(184,139,62,.10)' : success ? 'rgba(96,145,92,.10)' : 'var(--surface-2)'
  const toneColor = danger ? 'var(--color-danger)' : warning ? 'var(--color-warning)' : success ? 'var(--color-success)' : 'var(--txt-3)'
  return {
    minHeight: 30,
    padding: '0 12px',
    borderRadius: 999,
    border: `1px solid ${active ? 'rgba(218,223,33,.5)' : toneBorder}`,
    background: active ? 'rgba(218,223,33,.10)' : toneBackground,
    color: active ? 'var(--txt)' : toneColor,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flex: '0 0 auto',
  }
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

function signalBadgeRowStyle(compact: boolean): React.CSSProperties {
  return {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: compact ? 0 : 8,
  }
}

function alertBadgeStyle(tone: BadgeTone): React.CSSProperties {
  const danger = tone === 'danger'
  const warning = tone === 'warning'
  const success = tone === 'success'
  return {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 22,
    padding: '0 8px',
    borderRadius: 999,
    border: `1px solid ${danger ? 'rgba(184,64,64,.42)' : warning ? 'rgba(184,139,62,.42)' : success ? 'rgba(96,145,92,.36)' : 'var(--line)'}`,
    background: danger ? 'rgba(184,64,64,.16)' : warning ? 'rgba(184,139,62,.14)' : success ? 'rgba(96,145,92,.14)' : 'var(--surface-3)',
    color: danger ? 'var(--color-danger)' : warning ? 'var(--color-warning)' : success ? 'var(--color-success)' : 'var(--txt-3)',
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  }
}

function kanbanGridStyle(columnCount: number, showAllColumns: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: showAllColumns
      ? 'repeat(8, minmax(180px, 1fr))'
      : `repeat(${Math.max(columnCount, 1)}, minmax(220px, 1fr))`,
    gap: 14,
    overflowX: 'auto',
    maxWidth: '100%',
    paddingBottom: 8,
  }
}

const kanbanControlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const kanbanToggleGroup: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

function kanbanToggleButtonStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: 34,
    padding: '0 12px',
    borderRadius: 999,
    border: `1px solid ${active ? 'rgba(218,223,33,.5)' : 'var(--line)'}`,
    background: active ? 'rgba(218,223,33,.12)' : 'var(--surface-2)',
    color: active ? 'var(--txt)' : 'var(--txt-3)',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  }
}

const kanbanColumn: React.CSSProperties = {
  padding: 14,
  borderRadius: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
}

const kanbanColumnDropActive: React.CSSProperties = {
  borderColor: 'rgba(218,223,33,.5)',
  background: 'rgba(218,223,33,.06)',
  boxShadow: 'inset 0 0 0 1px rgba(218,223,33,.18)',
}

const kanbanHintStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 600,
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

const kanbanStatusSelect: React.CSSProperties = {
  width: '100%',
  minHeight: 34,
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--txt)',
  padding: '0 10px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const kanbanEmptyState: React.CSSProperties = {
  minHeight: 54,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 12,
  border: '1px dashed var(--line)',
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 700,
  background: 'rgba(255,255,255,.02)',
}

const flowchartShell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 18,
  borderRadius: 22,
  background: 'linear-gradient(145deg, rgba(11,13,18,.98), rgba(18,22,29,.96))',
  border: '1px solid rgba(255,255,255,.10)',
  boxShadow: '0 24px 80px rgba(0,0,0,.30)',
}

const flowchartFullscreenShell: React.CSSProperties = {
  ...flowchartShell,
  position: 'fixed',
  inset: 0,
  zIndex: 120,
  width: '100vw',
  height: '100vh',
  borderRadius: 0,
  border: 'none',
  padding: 10,
  gap: 10,
  background: 'radial-gradient(circle at 18% 12%, rgba(218,223,33,.07), transparent 32%), linear-gradient(145deg, #07090d, #11151c 58%, #090b0f)',
  overflow: 'hidden',
}

const flowchartFullscreenToolbar: React.CSSProperties = {
  minHeight: 56,
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 360px) minmax(0, 1fr)',
  gap: 10,
  alignItems: 'start',
  padding: '6px 10px',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(8,10,13,.76)',
  boxShadow: '0 18px 54px rgba(0,0,0,.28)',
}

const flowchartFullscreenTitleBlock: React.CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: '4px 8px',
  alignItems: 'center',
}

const flowchartModeBadge: React.CSSProperties = {
  gridRow: '1 / span 2',
  display: 'inline-flex',
  width: 'fit-content',
  padding: '5px 8px',
  borderRadius: 999,
  border: '1px solid rgba(218,223,33,.42)',
  background: 'rgba(218,223,33,.11)',
  color: 'var(--color-lime)',
  fontSize: 10,
  fontWeight: 900,
  textTransform: 'uppercase',
}

const flowchartFullscreenTitle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--txt)',
  fontSize: 15,
  lineHeight: 1.2,
}

const flowchartFullscreenMeta: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--txt-3)',
  fontSize: 11,
  fontWeight: 800,
}

const flowchartFullscreenToolGroup: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 7,
  flexWrap: 'wrap',
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'visible',
  paddingBottom: 1,
}

const flowchartHero: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 18,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}

const flowchartEyebrow: React.CSSProperties = {
  color: 'var(--color-lime)',
  fontSize: 10,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 0,
}

const flowchartHeroTitle: React.CSSProperties = {
  margin: '4px 0 8px',
  color: 'var(--txt)',
  fontSize: 22,
  lineHeight: 1.2,
}

const flowchartHeroMeta: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 800,
}

const flowchartZoomControls: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
}

const flowchartIconButton: React.CSSProperties = {
  width: 34,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--txt)',
  fontWeight: 900,
  cursor: 'pointer',
  flex: '0 0 auto',
}

const flowchartFullscreenButton: React.CSSProperties = {
  minHeight: 34,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '0 12px',
  borderRadius: 12,
  border: '1px solid rgba(218,223,33,.38)',
  background: 'rgba(218,223,33,.10)',
  color: 'var(--txt)',
  fontSize: 12,
  fontWeight: 900,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flex: '0 0 auto',
}

const flowchartZoomValue: React.CSSProperties = {
  minWidth: 48,
  textAlign: 'center',
  color: 'var(--txt-2)',
  fontSize: 12,
  fontWeight: 900,
  flex: '0 0 auto',
}

const flowchartToolbar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 14,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}

const flowchartControls: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const flowchartStatsRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 800,
}

const flowchartWorkspace: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 360px)',
  gap: 16,
  alignItems: 'start',
}

const flowchartCanvasCard: React.CSSProperties = {
  minWidth: 0,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.018))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)',
  overflow: 'hidden',
}

const flowchartCanvasCardFullscreen: React.CSSProperties = {
  minHeight: 0,
  height: '100%',
}

const flowchartTierGap = 116
const flowchartBranchIndent = 96

const flowchartCanvasHeader: React.CSSProperties = {
  minWidth: 1540,
  display: 'grid',
  gridTemplateColumns: '280px 260px 300px 280px',
  gap: flowchartTierGap,
  padding: '14px 18px 12px',
  borderBottom: '1px solid rgba(255,255,255,.09)',
  color: 'var(--txt-3)',
  fontSize: 11,
  fontWeight: 900,
  textTransform: 'uppercase',
}

const flowchartScroll: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  maxWidth: '100%',
  maxHeight: '72vh',
  minHeight: 560,
  padding: 24,
  touchAction: 'none',
  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.065) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  backgroundPosition: '0 0',
}

const flowchartToggle: React.CSSProperties = {
  position: 'absolute',
  left: -46,
  top: 12,
  zIndex: 8,
  width: 28,
  height: 28,
  borderRadius: 999,
  border: '1px solid rgba(218,223,33,.34)',
  background: 'linear-gradient(180deg, rgba(218,223,33,.18), rgba(218,223,33,.08))',
  color: 'var(--txt)',
  fontWeight: 900,
  cursor: 'pointer',
  flex: '0 0 auto',
  fontSize: 13,
  lineHeight: '24px',
  opacity: 0.98,
  boxShadow: '0 10px 24px rgba(0,0,0,.26)',
}

const flowchartZoomLayer: React.CSSProperties = {
  minWidth: 1540,
  transformOrigin: 'top left',
  transition: 'transform .18s ease',
  willChange: 'transform',
}

const flowchartBoard: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '280px minmax(1140px, 1fr)',
  gap: flowchartTierGap,
  alignItems: 'stretch',
  width: 'max-content',
}

const flowchartProjectRail: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 16,
  zIndex: 1,
}

const flowchartProjectRailLine: React.CSSProperties = {
  flex: 1,
  minHeight: 220,
  width: 2,
  marginLeft: 'calc(100% - 2px)',
  background: 'linear-gradient(180deg, rgba(157,184,199,.46), rgba(157,184,199,.05))',
  borderRadius: 999,
}

function flowchartProjectRailLineStyle(active: boolean): React.CSSProperties {
  return {
    ...flowchartProjectRailLine,
    width: active ? 3 : 2,
    background: active
      ? 'linear-gradient(180deg, rgba(218,223,33,.72), rgba(218,223,33,.08))'
      : flowchartProjectRailLine.background,
    boxShadow: active ? '0 0 18px rgba(218,223,33,.16)' : undefined,
  }
}

const flowchartLaneStack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 28,
}

const flowchartLane: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '260px minmax(764px, 1fr)',
  gap: flowchartTierGap,
  alignItems: 'start',
}

const flowchartLaneConnector: React.CSSProperties = {
  position: 'absolute',
  left: -flowchartTierGap,
  top: 56,
  width: flowchartTierGap,
  height: 3,
  background: 'linear-gradient(90deg, rgba(157,184,199,.44), rgba(157,184,199,.72))',
  borderRadius: 999,
  pointerEvents: 'none',
  zIndex: 2,
}

function flowchartLaneConnectorStyle(active: boolean): React.CSSProperties {
  return {
    ...flowchartLaneConnector,
    height: active ? 4 : flowchartLaneConnector.height,
    background: active
      ? 'linear-gradient(90deg, rgba(218,223,33,.95), rgba(218,223,33,.5))'
      : flowchartLaneConnector.background,
    boxShadow: active ? '0 0 18px rgba(218,223,33,.22)' : undefined,
  }
}

const flowchartLaneWorkstream: React.CSSProperties = {
  position: 'relative',
  display: 'block',
  minWidth: 0,
}

const flowchartLaneSubtasks: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 26,
  minWidth: 0,
  paddingLeft: flowchartBranchIndent,
  borderLeft: '2px solid rgba(157,184,199,.30)',
}

function flowchartLaneSubtasksStyle(active: boolean): React.CSSProperties {
  return {
    ...flowchartLaneSubtasks,
    borderLeftColor: active ? 'rgba(218,223,33,.66)' : 'rgba(157,184,199,.30)',
    boxShadow: active ? 'inset 2px 0 0 rgba(218,223,33,.10)' : undefined,
  }
}

const flowchartSubtaskLane: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '300px minmax(368px, 1fr)',
  gap: flowchartTierGap,
  alignItems: 'start',
}

const flowchartSubtaskConnector: React.CSSProperties = {
  position: 'absolute',
  left: -flowchartBranchIndent,
  top: 48,
  width: flowchartBranchIndent,
  height: 3,
  background: 'linear-gradient(90deg, rgba(157,184,199,.44), rgba(157,184,199,.72))',
  borderRadius: 999,
  pointerEvents: 'none',
  zIndex: 2,
}

function flowchartSubtaskConnectorStyle(active: boolean): React.CSSProperties {
  return {
    ...flowchartSubtaskConnector,
    height: active ? 4 : flowchartSubtaskConnector.height,
    background: active
      ? 'linear-gradient(90deg, rgba(218,223,33,.95), rgba(218,223,33,.5))'
      : flowchartSubtaskConnector.background,
    boxShadow: active ? '0 0 18px rgba(218,223,33,.20)' : undefined,
  }
}

const flowchartSubtaskCardSlot: React.CSSProperties = {
  position: 'relative',
  display: 'block',
  minWidth: 0,
}

const flowchartStepColumn: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  paddingLeft: flowchartBranchIndent,
  borderLeft: '2px solid rgba(157,184,199,.30)',
}

function flowchartStepColumnStyle(active: boolean): React.CSSProperties {
  return {
    ...flowchartStepColumn,
    borderLeftColor: active ? 'rgba(218,223,33,.62)' : 'rgba(157,184,199,.30)',
    boxShadow: active ? 'inset 2px 0 0 rgba(218,223,33,.08)' : undefined,
  }
}

const flowchartStepBranch: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '1fr',
}

const flowchartStepConnector: React.CSSProperties = {
  position: 'absolute',
  left: -flowchartBranchIndent,
  top: 42,
  width: flowchartBranchIndent,
  height: 3,
  borderRadius: 999,
  background: 'linear-gradient(90deg, rgba(157,184,199,.38), rgba(157,184,199,.66))',
  pointerEvents: 'none',
  zIndex: 2,
}

function flowchartStepConnectorStyle(active: boolean): React.CSSProperties {
  return {
    ...flowchartStepConnector,
    height: active ? 4 : flowchartStepConnector.height,
    background: active
      ? 'linear-gradient(90deg, rgba(218,223,33,.95), rgba(218,223,33,.55))'
      : flowchartStepConnector.background,
    boxShadow: active ? '0 0 16px rgba(218,223,33,.18)' : undefined,
  }
}

function flowchartParentBridgeStyle(active: boolean, top: number): React.CSSProperties {
  return {
    position: 'absolute',
    left: -flowchartTierGap,
    top,
    width: flowchartTierGap,
    height: active ? 4 : 3,
    borderRadius: 999,
    background: active
      ? 'linear-gradient(90deg, rgba(218,223,33,.95), rgba(218,223,33,.55))'
      : 'linear-gradient(90deg, rgba(157,184,199,.48), rgba(157,184,199,.68))',
    boxShadow: active ? '0 0 16px rgba(218,223,33,.18)' : undefined,
    pointerEvents: 'none',
    zIndex: 1,
  }
}

function flowchartArrowHeadStyle(active: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    right: -6,
    top: '50%',
    width: 0,
    height: 0,
    borderTop: active ? '6px solid transparent' : '5px solid transparent',
    borderBottom: active ? '6px solid transparent' : '5px solid transparent',
    borderLeft: active ? '8px solid rgba(218,223,33,.92)' : '7px solid rgba(157,184,199,.70)',
    transform: 'translateY(-50%)',
  }
}

const flowchartCollapsedPill: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 14,
  border: '1px dashed rgba(255,255,255,.14)',
  color: 'var(--txt-3)',
  background: 'rgba(255,255,255,.025)',
  fontSize: 12,
  fontWeight: 800,
}

const flowchartEmptyStep: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px dashed var(--line)',
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 700,
}

function flowchartNodeStyle(tone: BadgeTone, variant: 'project' | 'default' | 'step', active: boolean, pathActive: boolean): React.CSSProperties {
  const danger = tone === 'danger'
  const warning = tone === 'warning'
  const success = tone === 'success'
  const borderColor = active
    ? 'rgba(218,223,33,.78)'
    : pathActive
      ? 'rgba(218,223,33,.42)'
      : danger
        ? 'rgba(184,64,64,.48)'
        : warning
          ? 'rgba(184,139,62,.44)'
          : success
            ? 'rgba(96,145,92,.42)'
            : 'rgba(255,255,255,.10)'
  return {
    width: '100%',
    minHeight: variant === 'project' ? 156 : variant === 'step' ? 116 : 134,
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
    padding: variant === 'project' ? 16 : 13,
    borderRadius: 16,
    border: `1px solid ${borderColor}`,
    background: danger ? 'linear-gradient(180deg, rgba(184,64,64,.15), rgba(184,64,64,.07))' : warning ? 'linear-gradient(180deg, rgba(184,139,62,.14), rgba(184,139,62,.06))' : success ? 'linear-gradient(180deg, rgba(96,145,92,.14), rgba(96,145,92,.06))' : 'linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.025))',
    color: 'var(--txt)',
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: active
      ? '0 0 0 3px rgba(218,223,33,.12), 0 20px 54px rgba(0,0,0,.34)'
      : pathActive
        ? '0 0 0 2px rgba(218,223,33,.07), 0 16px 40px rgba(0,0,0,.24)'
        : variant === 'project'
          ? '0 18px 50px rgba(0,0,0,.24)'
          : '0 14px 32px rgba(0,0,0,.18)',
    transition: 'border-color .16s ease, box-shadow .16s ease, transform .16s ease',
  }
}

const flowchartNodeTop: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  alignItems: 'center',
}

function flowchartKindBadge(kind: FlowchartNodeKind): React.CSSProperties {
  return {
    display: 'inline-flex',
    width: 'fit-content',
    padding: '3px 8px',
    borderRadius: 999,
    background: kind === 'project' ? 'rgba(218,223,33,.12)' : kind === 'workstream' ? 'rgba(157,184,199,.12)' : 'var(--surface-3)',
    color: kind === 'project' ? 'var(--color-lime)' : 'var(--txt-3)',
    fontSize: 10,
    fontWeight: 900,
    textTransform: 'uppercase',
  }
}

function flowchartSignalBadge(tone: BadgeTone): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 999,
    background: tone === 'danger' ? 'rgba(184,64,64,.22)' : tone === 'success' ? 'rgba(96,145,92,.22)' : tone === 'warning' ? 'rgba(184,139,62,.18)' : 'rgba(255,255,255,.05)',
    color: tone === 'danger' ? 'var(--color-danger)' : tone === 'success' ? 'var(--color-success)' : tone === 'warning' ? 'var(--color-warning)' : 'var(--txt-3)',
    border: `1px solid ${tone === 'danger' ? 'rgba(184,64,64,.45)' : tone === 'success' ? 'rgba(96,145,92,.42)' : tone === 'warning' ? 'rgba(184,139,62,.42)' : 'rgba(255,255,255,.12)'}`,
    fontSize: 13,
    fontWeight: 900,
  }
}

const flowchartNodeTitle: React.CSSProperties = {
  display: 'block',
  color: 'var(--txt)',
  fontSize: 14,
  lineHeight: 1.35,
}

const flowchartNodeMeta: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 700,
}

const flowchartNodeBottom: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

const flowchartProgressArea: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 8,
  alignItems: 'center',
}

const flowchartProgressTrack: React.CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: 'rgba(255,255,255,.09)',
  overflow: 'hidden',
}

const flowchartProgressFill: React.CSSProperties = {
  height: '100%',
  borderRadius: 999,
  transition: 'width .18s ease',
}

const flowchartProgressText: React.CSSProperties = {
  color: 'var(--txt-3)',
  fontSize: 11,
  fontWeight: 900,
}

const flowchartWarningChip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 22,
  padding: '3px 7px',
  borderRadius: 999,
  border: '1px solid rgba(184,139,62,.34)',
  background: 'rgba(184,139,62,.12)',
  color: 'var(--color-warning)',
  fontSize: 10,
  fontWeight: 900,
}

const flowchartDetailPanel: React.CSSProperties = {
  position: 'sticky',
  top: 86,
  maxHeight: 'calc(100vh - 112px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.11)',
  background: 'linear-gradient(180deg, rgba(18,22,29,.98), rgba(10,12,17,.98))',
  boxShadow: '0 24px 70px rgba(0,0,0,.34)',
  overflowY: 'auto',
}

const flowchartDetailPanelFullscreen: React.CSSProperties = {
  top: 0,
  maxHeight: 'calc(100vh - 142px)',
  height: '100%',
}

const flowchartPanelHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
}

const flowchartPanelTitle: React.CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--txt)',
  fontSize: 18,
  lineHeight: 1.25,
}

const flowchartPanelHero: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const flowchartInfoGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
}

const flowchartInfoItem: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  color: 'var(--txt-2)',
  fontSize: 12,
  lineHeight: 1.35,
}

const flowchartPanelCard: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 14,
  background: 'rgba(255,255,255,.035)',
  border: '1px solid rgba(255,255,255,.09)',
}

const flowchartBreadcrumb: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const flowchartBreadcrumbItem: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.10)',
  color: 'var(--txt-2)',
  background: 'rgba(255,255,255,.04)',
  fontSize: 11,
  fontWeight: 800,
}

const flowchartBreadcrumbArrow: React.CSSProperties = {
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 900,
}

const flowchartDeadlineDanger: React.CSSProperties = {
  color: 'var(--color-danger)',
  fontSize: 12,
  fontWeight: 900,
}

const flowchartPanelActions: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  flexWrap: 'wrap',
  paddingTop: 4,
}

const flowchartStepMiniList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const flowchartStepMiniItem: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  padding: '8px 10px',
  borderRadius: 10,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  color: 'var(--txt)',
  fontSize: 12,
  fontWeight: 700,
}

function toastStyle(tone: 'success' | 'danger'): React.CSSProperties {
  return {
    position: 'fixed',
    right: 24,
    bottom: 24,
    zIndex: 80,
    maxWidth: 380,
    padding: '12px 14px',
    borderRadius: 14,
    border: tone === 'danger' ? '1px solid rgba(184,64,64,.45)' : '1px solid rgba(218,223,33,.42)',
    background: tone === 'danger' ? 'rgba(60,20,20,.96)' : 'rgba(18,22,29,.96)',
    color: 'var(--txt)',
    fontSize: 13,
    fontWeight: 700,
    boxShadow: '0 22px 60px rgba(0,0,0,.38)',
  }
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

const ganttTodayLabel: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  transform: 'translateX(-50%)',
  zIndex: 4,
  padding: '2px 7px',
  borderRadius: 999,
  background: 'rgba(218,223,33,.16)',
  border: '1px solid rgba(218,223,33,.45)',
  color: 'var(--txt)',
  fontSize: 10,
  fontWeight: 800,
  whiteSpace: 'nowrap',
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

const ganttOverdueBadge: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  marginTop: 5,
  padding: '2px 7px',
  borderRadius: 999,
  background: 'rgba(184,64,64,.15)',
  border: '1px solid rgba(184,64,64,.38)',
  color: 'var(--color-danger)',
  fontSize: 10,
  fontWeight: 800,
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

const deleteWarningStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(184,64,64,.38)',
  background: 'rgba(184,64,64,.12)',
  color: 'var(--color-danger)',
  fontSize: 13,
  fontWeight: 700,
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
