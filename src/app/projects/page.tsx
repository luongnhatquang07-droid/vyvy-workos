'use client'

import React from 'react'
import { PlanDocumentsPanel } from '@/components/documents/PlanDocumentsPanel'
import { ProjectPlanProvider } from '@/components/documents/ProjectPlanProvider'
import { Drawer } from '@/components/feedback/Drawer'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { FileList } from '@/components/ui/FileList'
import { FileUpload, type UploadedFile } from '@/components/ui/FileUpload'
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
import { externalLinkDisplayName } from '@/lib/files/externalLinks'
import type {
  CommandCenterAttachmentRow,
  CommandCenterDeliverableRow,
  CommandCenterDeliverableVersionRow,
  CommandCenterMeetingRow,
  CommandCenterPersonRow,
  CommandCenterProjectRow,
  CommandCenterTaskStepRow,
  CommandCenterTaskRow,
  CommandCenterWorkstreamRow,
} from '@/lib/database.types'
import { FlowchartTab } from './flowchart-tab'
import { GanttTab } from './gantt-tab'
import { KanbanTab } from './kanban-tab'
import {
  STATUS_META,
  TASK_STATUS_OPTIONS,
  TASK_STATUS_ORDER,
  createDefaultProjectFilters,
  formatDeadlineLabel,
  getCompactBlockerText,
  getCompletionBlockers,
  getDeadlineSignal,
  getMissingDeliverableSteps,
  getMistakenDeliverableSteps,
  getPendingApprovalDeliverableSteps,
  getProjectProgress,
  getRequiredStepStats,
  getRevisionDeliverableSteps,
  getSubtaskProgress,
  getSubtaskProgressText,
  getSubtaskFileGroups,
  getWorkstreamProgress,
  hasEvidence,
  isOverdue,
  isUnassignedSubtask,
  matchesProjectWorkFilter,
  normalizeDateKey,
  projectHealth,
  requiresEvidence,
  sortSubtasksForOperations,
  shiftDate,
  toFullDate,
  toShortDate,
} from './helpers'
import {
  emptyInline,
  filterChipStyle,
  inlineMetaStyle,
  mutedMetaStyle,
  progressFill,
  progressTrack,
  sectionTitle,
  statusChipStyle,
  subtaskInlineItem,
  textareaStyle,
  toneColor,
  warningBanner,
} from './styles'
import {
  EvidenceFileList,
  GhostButton,
  PrimaryButton,
  ProgressBadge,
  StepEvidenceFiles,
  SubtaskSignalBadges,
} from './ui-primitives'
import type {
  AttachmentItem,
  BadgeTone,
  EditableKind,
  EditTarget,
  DeliverableBlocker,
  DragDraft,
  ProjectDeadlineFilter,
  ProjectFilters,
  ProjectStatusFilter,
  ProjectWorkspace,
  StepItem,
  SubtaskItem,
  TaskStatus,
  VersionDeleteResult,
  WorkstreamItem,
} from './types'

type ComposerMode = 'project' | 'workstream' | 'subtask' | 'meeting' | null
type ViewTab = 'overview' | 'kanban' | 'gantt' | 'meetings' | 'flowchart'
type StepTemplate = 'none' | 'basic' | 'approval'
type DetailSection = 'report' | 'files' | 'workflow' | 'deadline'

interface StepDraft {
  title: string
  description: string
  ownerId: string
  reviewerId: string
  dueDate: string
  status: TaskStatus
  isRequired: boolean
  requiresDeliverable: boolean
}

interface EditContext {
  target: EditTarget
  project: ProjectWorkspace
  workstream?: WorkstreamItem
  subtask?: SubtaskItem
  step?: StepItem
}

interface ComposerDraft {
  name: string
  code: string
  description: string
  ownerId: string
  reviewerId: string
  startDate: string
  dueDate: string
  cadence: string
  recap: string
  filesNeeded: string
  links: string
  needsFile: boolean
  stepTemplate: StepTemplate
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

interface EditDraft {
  title: string
  description: string
  ownerId: string
  reviewerId: string
  startDate: string
  dueDate: string
  status: TaskStatus
  expectedResult: string
  isRequired: boolean
  requiresDeliverable: boolean
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

interface ProjectFilterSummary {
  totalSubtasks: number
  visibleSubtasks: number
  totalSteps: number
  visibleSteps: number
}

interface WorkspaceSeedIndex {
  tasksByProjectId: Map<string, CommandCenterTaskRow[]>
  tasksByProjectWorkstream: Map<string, CommandCenterTaskRow[]>
  workstreamsByProjectId: Map<string, CommandCenterWorkstreamRow[]>
  taskStepsByTaskId: Map<string, CommandCenterTaskStepRow[]>
  deliverablesByTaskId: Map<string, CommandCenterDeliverableRow[]>
  firstDeliverableByStepId: Map<string, CommandCenterDeliverableRow>
  versionsByDeliverableId: Map<string, CommandCenterDeliverableVersionRow[]>
  versionsByTaskId: Map<string, CommandCenterDeliverableVersionRow[]>
  attachmentsById: Map<string, CommandCenterAttachmentRow>
  meetingsByProjectId: Map<string, CommandCenterMeetingRow[]>
}

const STEP_EXPECTED_RESULT_MARKER = '\n\n[step-expected-result]\n'
const STEP_STATUSES: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PENDING_APPROVAL', 'REVISION_REQUIRED', 'COMPLETED']

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
  const workspaceSeedIndex = React.useMemo(
    () => buildWorkspaceSeedIndex(
      data?.tasks ?? [],
      data?.workstreams ?? [],
      data?.taskSteps ?? [],
      data?.deliverables ?? [],
      data?.deliverableVersions ?? [],
      data?.attachments ?? [],
      data?.meetings ?? [],
    ),
    [
      data?.attachments,
      data?.deliverableVersions,
      data?.deliverables,
      data?.meetings,
      data?.taskSteps,
      data?.tasks,
      data?.workstreams,
    ],
  )

  const [ready, setReady] = React.useState(false)
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null)
  const [selectedSubtaskId, setSelectedSubtaskId] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState<ViewTab>('overview')
  const [projectFilters, setProjectFilters] = React.useState<ProjectFilters>(() => createDefaultProjectFilters())
  const deferredProjectFilters = React.useDeferredValue(projectFilters)
  const [composerMode, setComposerMode] = React.useState<ComposerMode>(null)
  const [composerParentId, setComposerParentId] = React.useState<string | null>(null)
  const [composerDraft, setComposerDraft] = React.useState<ComposerDraft>(createDraft())
  const [editTarget, setEditTarget] = React.useState<EditTarget | null>(null)
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
      data?.people ?? [],
      workspaceSeedIndex,
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
  }, [data?.people, data?.projects, loading, workspaceSeedIndex])

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
  const workspaceLoading = loading && !ready && !error
  const metricValue = (value: number) => (workspaceLoading || error ? '—' : value)
  const selectedUploadStep = selectedSubtask?.steps.find((step) => step.id === activeUploadStepId) ?? null
  const activeUploadStep = selectedUploadStep
  const editContext = editTarget ? resolveEditContext(workspace, editTarget) : null
  const currentPersonId = data?.currentUser?.personId ?? null
  const currentRole = data?.currentUser?.role ?? null
  const assignablePeople = React.useMemo(
    () => getAssignablePeopleForOwner(Object.values(people), currentRole, currentPersonId),
    [currentPersonId, currentRole, people],
  )

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
  const selectedProjectAssigneeOptions = React.useMemo(
    () => selectedProject ? getProjectAssigneeOptions(selectedProject, people, currentPersonId) : [],
    [currentPersonId, people, selectedProject],
  )
  const selectedProjectFilterSummary = React.useMemo(
    () => selectedProject ? getProjectFilterSummary(selectedProject, deferredProjectFilters) : null,
    [deferredProjectFilters, selectedProject],
  )

  function ensureSelection(nextWorkspace: ProjectWorkspace[]) {
    const nextProject = nextWorkspace.find((project) => project.id === selectedProjectId) ?? nextWorkspace[0] ?? null
    setSelectedProjectId(nextProject?.id ?? null)
    const nextSubtask = nextProject ? findSubtask(nextProject, selectedSubtaskId) : null
    setSelectedSubtaskId(nextSubtask?.id ?? null)
  }

  function updateWorkspace(mutator: (current: ProjectWorkspace[]) => ProjectWorkspace[]) {
    setWorkspace((current) => {
      const next = normalizeWorkspaceTree(mutator(current), current)
      if (next === current) return current
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

  function applyStepVersionDeletedLocal(file: AttachmentItem, result: VersionDeleteResult) {
    const deliverableStatus = result.deliverableStatus ?? 'NOT_SUBMITTED'
    const nextStepStatus: TaskStatus = deliverableStatus === 'APPROVED'
      ? 'COMPLETED'
      : deliverableStatus === 'SUBMITTED'
        ? 'PENDING_APPROVAL'
        : 'REVISION_REQUIRED'
    const nextReviewStatus: VersionReviewStatus = deliverableStatus === 'APPROVED'
      ? 'APPROVED'
      : deliverableStatus === 'SUBMITTED'
        ? 'PENDING_REVIEW'
        : 'UPLOADED_BY_MISTAKE'
    const nextBlocker: DeliverableBlocker = deliverableStatus === 'APPROVED'
      ? null
      : deliverableStatus === 'SUBMITTED'
        ? 'PENDING_APPROVAL'
        : deliverableStatus === 'MISSING_INFORMATION'
          ? 'MISSING'
          : deliverableStatus === 'REVISION_REQUIRED'
            ? 'REVISION'
            : 'MISTAKE'
    const autoCompletedStepIds = new Set(result.taskSync?.autoCompletedStepIds ?? [])

    updateWorkspace((current) => current.map((project) => ({
      ...project,
      workstreams: project.workstreams.map((workstream) => ({
        ...workstream,
        subtasks: workstream.subtasks.map((subtask) => {
          const matchesTask = Boolean(result.taskSync?.taskId && subtask.sourceTaskId === result.taskSync.taskId)
          return {
            ...subtask,
            status: matchesTask && result.taskSync?.status ? result.taskSync.status : subtask.status,
            attachments: subtask.attachments.filter((attachment) => attachment.versionId !== file.versionId),
            steps: subtask.steps.map((step) => {
              const matchesStep = Boolean(
                (file.stepId && step.id === file.stepId) ||
                (file.deliverableId && step.deliverableId === file.deliverableId),
              )
              if (!matchesStep && !autoCompletedStepIds.has(step.id)) return step
              if (!matchesStep) return { ...step, status: 'COMPLETED' }
              return {
                ...step,
                status: nextStepStatus,
                deliverableStatus,
                deliverableReviewStatus: nextReviewStatus,
                deliverableIsValid: deliverableStatus === 'APPROVED' || deliverableStatus === 'SUBMITTED',
                deliverableBlocker: nextBlocker,
              }
            }),
          }
        }),
      })),
    })))
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

  async function saveEditTarget(draft: EditDraft) {
    if (!editContext) return false
    const validationError = validateEditDraft(draft)
    if (validationError) {
      showToast(validationError, 'danger')
      return false
    }

    const apiTarget = getEditApiTarget(editContext)
    if (!apiTarget) {
      showToast('Không tìm thấy dữ liệu cần sửa.', 'danger')
      return false
    }

    const previousWorkspace = workspace
    updateWorkspace((current) => applyEditDraftToWorkspace(current, editContext.target, draft))

    const result = await commitWorkspaceMutation('PATCH', {
      type: apiTarget.type,
      id: apiTarget.id,
      patch: buildEditPatch(editContext.target.kind, draft),
    }, { alertOnError: false, refreshMode: editContext.target.kind === 'step' && draft.requiresDeliverable ? 'await' : 'background' })

    if (!result) {
      setWorkspace(previousWorkspace)
      showToast('Không thể lưu thay đổi. Vui lòng thử lại.', 'danger')
      return false
    }

    showToast('Đã lưu thay đổi.')
    setEditTarget(null)
    return true
  }

  async function openStepUpload(subtaskId: string, stepId: string) {
    if (activeUploadStepId === stepId) {
      setActiveUploadStepId(null)
      return
    }

    if (!selectedProject) return
    const subtask = findSubtask(selectedProject, subtaskId)
    const step = subtask?.steps.find((item) => item.id === stepId)
    if (!step) return

    if (!step.deliverableId) {
      updateWorkspace((current) =>
        current.map((project) =>
          project.id !== selectedProject.id
            ? project
            : {
                ...project,
                workstreams: project.workstreams.map((workstream) => ({
                  ...workstream,
                  subtasks: workstream.subtasks.map((item) =>
                    item.id !== subtaskId
                      ? item
                      : {
                          ...item,
                          steps: item.steps.map((currentStep) =>
                            currentStep.id === stepId ? { ...currentStep, requiresDeliverable: true } : currentStep,
                          ),
                        },
                  ),
                })),
              },
        ),
      )
      const result = await commitWorkspaceMutation('PATCH', {
        type: 'step',
        id: stepId,
        patch: {
          title: step.title,
          description: step.description || step.note,
          ownerId: step.ownerId,
          dueDate: step.dueDate,
          status: step.status,
          isRequired: step.isRequired,
          requiresDeliverable: true,
        },
      }, { alertOnError: false, refreshMode: 'await' })

      if (!result) {
        showToast('Không thể tạo mục bàn giao cho bước. Vui lòng thử lại.', 'danger')
        return
      }
    }

    setActiveUploadStepId(stepId)
    openSubtaskSection('workflow')
    showToast('Đã mở khu nộp File/Link ngay tại bước.')
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
    setComposerDraft(createDraft(selectedProject?.ownerId ?? null, selectedProject?.dueDate, selectedProject?.reviewerId ?? null))
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
        reviewerId: patch.reviewerId,
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
          reviewerId: draft.reviewerId || null,
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
                            ...makeStep(draft.title, draft.ownerId || null, draft.dueDate, draft.reviewerId || null),
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
            <GhostButton
              icon="ti-pencil"
              onClick={() => setEditTarget({
                kind: 'subtask',
                projectId: selectedProject.id,
                workstreamId: findWorkstreamForSubtask(selectedProject, subtask.id)?.id,
                subtaskId: subtask.id,
              })}
            >
              Sửa
            </GhostButton>
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
              {assignablePeople.map((person) => (
                <option key={person.id} value={person.id}>{person.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        <SubtaskCompactDetail
          subtask={subtask}
          project={selectedProject}
          people={people}
          assignablePeople={assignablePeople}
          workspaceId={workspaceId}
          currentPersonId={currentPersonId}
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
          onRefreshFileList={() => setFileRefreshKey((value) => value + 1)}
          onStepVersionDeleted={applyStepVersionDeletedLocal}
          onUpdateStep={(stepId, patch) => updateStep(subtask.id, stepId, patch)}
          onDeleteStep={(stepId) => deleteStep(subtask.id, stepId)}
          onAddStep={(draft) => addStep(subtask.id, draft)}
          onUploadForStep={(stepId) => void openStepUpload(subtask.id, stepId)}
          onEditStep={(stepId) => setEditTarget({ kind: 'step', projectId: selectedProject.id, workstreamId: findWorkstreamForSubtask(selectedProject, subtask.id)?.id, subtaskId: subtask.id, stepId })}
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
        <Metric icon="ti-folders" label="Dự án" value={metricValue(metrics.projects)} />
        <Metric icon="ti-stack-2" label="Đầu việc lớn" value={metricValue(metrics.workstreams)} />
        <Metric icon="ti-list-check" label="Đầu việc con" value={metricValue(metrics.subtasks)} />
        <Metric icon="ti-alert-triangle" label="Trễ hạn" value={metricValue(metrics.overdue)} danger />
      </div>

      {error ? null : !ready || loading ? (
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                      <div style={projectCardTitleBlock}>
                        <div style={projectNameStyle} title={project.name}>{project.name}</div>
                        <div style={projectCardMetaStyle} title={`${project.code} · ${project.workstreams.length} đầu việc lớn`}>
                          {project.code} · {project.workstreams.length} đầu việc lớn
                        </div>
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
            <ProjectPlanProvider key={selectedProject.id} projectId={selectedProject.sourceProjectId ?? selectedProject.id}>
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
                  <GhostButton icon="ti-pencil" onClick={() => setEditTarget({ kind: 'project', projectId: selectedProject.id })}>Sửa dự án</GhostButton>
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

              <PlanDocumentsPanel
                key={`project-plan-${selectedProject.id}`}
                targetType="PROJECT"
                targetId={selectedProject.sourceProjectId ?? selectedProject.id}
                title="Kế hoạch tổng dự án"
                defaultExpanded={false}
              />

              {selectedProjectOps ? (
                <ProjectOpsStrip
                  stats={selectedProjectOps}
                  filters={projectFilters}
                  assigneeOptions={selectedProjectAssigneeOptions}
                  currentPersonId={currentPersonId}
                  filterSummary={selectedProjectFilterSummary}
                  onChangeFilters={(patch) => setProjectFilters((current) => ({ ...current, ...patch }))}
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
                  filters={deferredProjectFilters}
                  selectedSubtaskId={selectedSubtaskId}
                  onSelectSubtask={selectSubtask}
                  renderSubtaskDetail={renderInlineSubtaskDetail}
                  onOpenSubtaskComposer={(workstreamId) => openComposer('subtask', workstreamId)}
                  onDeleteWorkstream={(workstreamId) => deleteWorkstream(selectedProject.id, workstreamId)}
                  onEditWorkstream={(workstreamId) => setEditTarget({ kind: 'workstream', projectId: selectedProject.id, workstreamId })}
                />
              ) : null}

              {activeTab === 'kanban' ? (
                <KanbanTab
                  project={selectedProject}
                  people={people}
                  filters={deferredProjectFilters}
                  onSelectSubtask={selectSubtask}
                  onChangeStatus={updateKanbanSubtaskStatus}
                  selectedSubtaskId={selectedSubtaskId}
                  renderSubtaskDetail={renderInlineSubtaskDetail}
                />
              ) : null}

              {activeTab === 'gantt' ? (
                <GanttTab
                  key={selectedProject.id}
                  project={selectedProject}
                  filters={deferredProjectFilters}
                  onOpenSubtask={(subtaskId) => {
                    setSelectedSubtaskId(subtaskId)
                    setActiveTab('overview')
                  }}
                  onShift={handleBarShift}
                />
              ) : null}

              {activeTab === 'flowchart' ? (
                <FlowchartTab
                  project={selectedProject}
                  people={people}
                  workspaceId={workspaceId}
                  projectFilters={deferredProjectFilters}
                  visibilitySummary={data?.visibilitySummary}
                  currentUser={data?.currentUser}
                  onSaveSubtaskReport={saveFlowchartSubtaskReport}
                  onOpenSubtask={(subtaskId) => {
                    setSelectedSubtaskId(subtaskId)
                    setActiveTab('overview')
                  }}
                  onEditNode={(target) => setEditTarget(target)}
                />
              ) : null}

              {activeTab === 'meetings' ? (
                <MeetingsTab project={selectedProject} />
              ) : null}


              </section>
            </div>
            </ProjectPlanProvider>
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
                {assignablePeople.map((person) => (
                  <option key={person.id} value={person.id}>{formatPeopleOption(person)}</option>
                ))}
              </select>
            </Field>

            <Field label="Người duyệt">
              <select value={composerDraft.reviewerId} onChange={(e) => setComposerDraft((current) => ({ ...current, reviewerId: e.target.value }))} style={inputStyle}>
                <option value="">Chưa gắn người duyệt</option>
                {Object.values(people).map((person) => (
                  <option key={person.id} value={person.id}>{formatPeopleOption(person)}</option>
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

      <EditWorkItemDrawer
        context={editContext}
        people={people}
        assignablePeople={assignablePeople}
        onClose={() => setEditTarget(null)}
        onSave={saveEditTarget}
      />
    </div>
  )
}

function SubtaskCompactDetail({
  subtask,
  project,
  people,
  assignablePeople,
  workspaceId,
  currentPersonId,
  activeUploadStep,
  openSections,
  fileRefreshKey,
  onToggleSection,
  onOpenBlockedSection,
  onUpdateReport,
  onSaveReport,
  onUpdateAttachments,
  onFilesChanged,
  onRefreshFileList,
  onStepVersionDeleted,
  onUpdateStep,
  onDeleteStep,
  onAddStep,
  onUploadForStep,
  onEditStep,
}: {
  subtask: SubtaskItem
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  assignablePeople: CommandCenterPersonRow[]
  workspaceId?: string
  currentPersonId: string | null
  activeUploadStep: StepItem | null
  openSections: DetailSection[]
  fileRefreshKey: number
  onToggleSection: (section: DetailSection) => void
  onOpenBlockedSection: () => void
  onUpdateReport: (value: string) => void
  onSaveReport: (value: string) => void
  onUpdateAttachments: (attachments: AttachmentItem[]) => void
  onFilesChanged: () => void
  onRefreshFileList: () => void
  onStepVersionDeleted: (file: AttachmentItem, result: VersionDeleteResult) => void
  onUpdateStep: (stepId: string, patch: Partial<StepItem>) => void
  onDeleteStep: (stepId: string) => void
  onAddStep: (draft: StepDraft) => void
  onUploadForStep: (stepId: string) => void
  onEditStep: (stepId: string) => void
}) {
  const blockers = getCompletionBlockers(subtask)
  const workflowSummary = getWorkflowSummary(subtask)
  const fileSummary = getFileSummary(subtask)
  const fileGroups = getSubtaskFileGroups(subtask)
  const parentWorkstream = findWorkstreamForSubtask(project, subtask.id)
  const deadlineSummary = getDeadlineSummary(subtask)

  const peopleOptions = React.useMemo(() => Object.values(people), [people])

  function handleUploadedFile(file: UploadedFile, step: StepItem | null) {
    onUpdateAttachments([
      {
        id: file.attachmentId ?? file.versionId ?? file.url ?? `${Date.now()}`,
        name: file.fileName,
        url: file.url,
        deliverableId: file.deliverableId ?? step?.deliverableId ?? null,
        versionId: file.versionId ?? null,
        attachmentId: file.attachmentId ?? null,
        stepId: step?.id ?? null,
        mimeType: file.mimeType,
        sizeBytes: file.fileSize,
        status: file.versionId ? 'PENDING_REVIEW' : undefined,
        submittedBy: currentPersonId,
        submittedAt: new Date().toISOString(),
        versionNumber: file.versionNumber ?? null,
      },
      ...subtask.attachments,
    ])
    onFilesChanged()
  }

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

      {parentWorkstream ? (
        <PlanDocumentsPanel
          key={`subtask-plan-${subtask.id}`}
          targetType="WORKSTREAM"
          targetId={parentWorkstream.id}
          title="Plan từ đầu việc lớn"
          readOnly
        />
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
          title="File / Link bàn giao"
          summary={fileSummary.value}
          badge={fileSummary.badge}
          open={openSections.includes('files')}
          onToggle={() => onToggleSection('files')}
          allowOverflow
        >
          <div style={fieldLabel}>Nộp file hoặc link bàn giao chung cho đầu việc con</div>
          <FileUpload
            key={`subtask-${subtask.id}`}
            workspaceId={workspaceId}
            projectId={project.sourceProjectId ?? undefined}
            taskId={subtask.sourceTaskId ?? undefined}
            peopleOptions={peopleOptions}
            defaultApproverId={project.reviewerId ?? project.ownerId}
            requiresApproval={false}
            allowLink
            compact
            label="Tải file hoàn thành, báo cáo, ảnh chụp, tài liệu"
            onUploaded={(file) => handleUploadedFile(file, null)}
          />

          <div style={fieldLabel}>Kết quả bàn giao theo thứ tự bước</div>
          <SubtaskStepEvidenceSummary
            subtask={subtask}
            filesByStepId={fileGroups.byStepId}
            people={people}
            workspaceId={workspaceId}
            allowVersionDelete
            onVersionDeleted={(deletedFile, result) => {
              onStepVersionDeleted(deletedFile, result)
              onRefreshFileList()
            }}
          />

          {fileGroups.shared.length ? (
            <div style={sharedEvidenceGroupStyle}>
              <div style={stepEvidenceSummaryHeaderStyle}>
                <span style={stepEvidenceSummaryTitleStyle}>Chưa gắn bước</span>
                <span style={mutedMetaStyle}>{fileGroups.shared.length} tài liệu</span>
              </div>
              <div style={mutedMetaStyle}>Bàn giao cũ hoặc bàn giao chung ở cấp đầu việc con. Không tự gán vào bước để tránh sai dữ liệu.</div>
              <EvidenceFileList
                files={fileGroups.shared}
                people={people}
                workspaceId={workspaceId}
                emptyText="Chưa có bàn giao chung."
                allowVersionDelete
                onVersionDeleted={(deletedFile, result) => {
                  onStepVersionDeleted(deletedFile, result)
                  onRefreshFileList()
                }}
              />
            </div>
          ) : null}
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
            project={project}
            people={people}
            assignablePeople={assignablePeople}
            filesByStepId={fileGroups.byStepId}
            workspaceId={workspaceId}
            activeUploadStepId={activeUploadStep?.id ?? null}
            currentPersonId={currentPersonId}
            fileRefreshKey={fileRefreshKey}
            onUploadedFile={handleUploadedFile}
            onFilesChanged={onFilesChanged}
            onVersionDeleted={(deletedFile, result) => {
              onStepVersionDeleted(deletedFile, result)
              onRefreshFileList()
            }}
            onUpdateStep={onUpdateStep}
            onDeleteStep={onDeleteStep}
            onAddStep={onAddStep}
            onUploadForStep={onUploadForStep}
            onEditStep={onEditStep}
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
  allowOverflow = false,
  children,
}: {
  id: DetailSection
  title: string
  summary: string
  badge?: string
  open: boolean
  onToggle: () => void
  allowOverflow?: boolean
  children: React.ReactNode
}) {
  return (
    <section style={allowOverflow ? { ...accordionSectionStyle, overflow: 'visible' } : accordionSectionStyle}>
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
  project,
  people,
  assignablePeople,
  filesByStepId,
  workspaceId,
  activeUploadStepId,
  currentPersonId,
  fileRefreshKey,
  onUploadedFile,
  onFilesChanged,
  onVersionDeleted,
  onUpdateStep,
  onDeleteStep,
  onAddStep,
  onUploadForStep,
  onEditStep,
}: {
  subtask: SubtaskItem
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  assignablePeople: CommandCenterPersonRow[]
  filesByStepId: Record<string, AttachmentItem[]>
  workspaceId?: string
  activeUploadStepId: string | null
  currentPersonId: string | null
  fileRefreshKey: number
  onUploadedFile: (file: UploadedFile, step: StepItem | null) => void
  onFilesChanged: () => void
  onVersionDeleted: (file: AttachmentItem, result: VersionDeleteResult) => void
  onUpdateStep: (stepId: string, patch: Partial<StepItem>) => void
  onDeleteStep: (stepId: string) => void
  onAddStep: (draft: StepDraft) => void
  onUploadForStep: (stepId: string) => void
  onEditStep: (stepId: string) => void
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
              files={filesByStepId[step.id] ?? []}
              people={people}
              assignablePeople={assignablePeople}
              workspaceId={workspaceId}
              uploadOpen={activeUploadStepId === step.id}
              uploadPanel={activeUploadStepId === step.id ? (
                <StepInlineUploadPanel
                  step={step}
                  subtask={subtask}
                  project={project}
                  people={people}
                  workspaceId={workspaceId}
                  currentPersonId={currentPersonId}
                  fileRefreshKey={fileRefreshKey}
                  onUploaded={(file) => onUploadedFile(file, step)}
                  onFilesChanged={onFilesChanged}
                />
              ) : null}
              onVersionDeleted={onVersionDeleted}
              onUpdate={(patch) => onUpdateStep(step.id, patch)}
              onDelete={() => onDeleteStep(step.id)}
              onUpload={() => onUploadForStep(step.id)}
              onEdit={() => onEditStep(step.id)}
            />
          ))}
        </div>
      )}

      {adding ? (
        <StepDraftForm
          draft={draft}
          people={people}
          assignablePeople={assignablePeople}
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
  files,
  people,
  assignablePeople,
  workspaceId,
  uploadOpen,
  uploadPanel,
  onVersionDeleted,
  onUpdate,
  onDelete,
  onUpload,
  onEdit,
}: {
  index: number
  step: StepItem
  files: AttachmentItem[]
  people: Record<string, CommandCenterPersonRow>
  assignablePeople: CommandCenterPersonRow[]
  workspaceId?: string
  uploadOpen: boolean
  uploadPanel: React.ReactNode
  onVersionDeleted: (file: AttachmentItem, result: VersionDeleteResult) => void
  onUpdate: (patch: Partial<StepItem>) => void
  onDelete: () => void
  onUpload: () => void
  onEdit: () => void
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
      reviewerId: draft.reviewerId || null,
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
          <span>Người duyệt: <strong>{people[step.reviewerId ?? '']?.full_name ?? 'Chưa gắn'}</strong></span>
        <span title={step.dueDate ? toFullDate(step.dueDate) : undefined}>Deadline: <strong>{step.dueDate ? formatDeadlineLabel(step.dueDate, step.status) : 'Chưa có'}</strong></span>
          <span>Bắt buộc: <strong>{step.isRequired ? 'Có' : 'Không'}</strong></span>
          <span>File/Link kết quả: <strong>{deliverableStatusLabel(step)}</strong></span>
        </div>

        {uploadOpen ? null : (
          <StepEvidenceFiles
            files={files}
            people={people}
            workspaceId={workspaceId}
            emptyText="Chưa có kết quả bàn giao cho bước này."
            allowVersionDelete
            onVersionDeleted={onVersionDeleted}
          />
        )}

        {editing ? (
          <StepDraftForm
            draft={draft}
            people={people}
            assignablePeople={assignablePeople}
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
            <GhostButton icon={uploadOpen ? 'ti-x' : 'ti-upload'} onClick={onUpload}>
              {uploadOpen ? 'Đóng khu nộp' : step.deliverableId ? 'Nộp file/link cho bước này' : 'Tạo bàn giao & nộp file/link'}
            </GhostButton>
            <GhostButton icon="ti-pencil" onClick={onEdit}>Sửa</GhostButton>
            <IconButton label="Xóa bước" icon="ti-trash" tone="danger" onClick={onDelete} />
          </div>
        )}

        {uploadOpen ? uploadPanel : null}
      </div>
    </div>
  )
}

function StepInlineUploadPanel({
  step,
  subtask,
  project,
  people,
  workspaceId,
  currentPersonId,
  fileRefreshKey,
  onUploaded,
  onFilesChanged,
}: {
  step: StepItem
  subtask: SubtaskItem
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  workspaceId?: string
  currentPersonId: string | null
  fileRefreshKey: number
  onUploaded: (file: UploadedFile) => void
  onFilesChanged: () => void
}) {
  const peopleOptions = React.useMemo(() => Object.values(people), [people])
  const peopleById = React.useMemo(
    () => Object.fromEntries(Object.values(people).map((person) => [person.id, { full_name: person.full_name }])),
    [people],
  )

  if (!step.deliverableId) {
    return (
      <div style={stepUploadPreparingStyle} role="status">
        <i className="ti ti-loader-2" />
        <div style={stepUploadPreparingCopyStyle}>
          <strong>Đang chuẩn bị mục bàn giao cho bước...</strong>
          <span>Form File/Link sẽ mở ngay tại đây sau khi xác định đúng Step.</span>
        </div>
      </div>
    )
  }

  return (
    <div style={stepInlineUploadPanelStyle}>
      <div style={stepInlineUploadHeaderStyle}>
        <div style={stepInlineUploadCopyStyle}>
          <strong>Nộp kết quả cho bước này</strong>
          <span>Chọn File hoặc Link. Tài liệu sẽ được gắn riêng với “{step.title}”.</span>
        </div>
        <span style={stepEvidenceOrderBadgeStyle}>Đúng Step</span>
      </div>
      <FileUpload
        key={step.deliverableId}
        workspaceId={workspaceId}
        projectId={project.sourceProjectId ?? undefined}
        taskId={subtask.sourceTaskId ?? undefined}
        deliverableId={step.deliverableId}
        peopleOptions={peopleOptions}
        defaultApproverId={step.deliverableReviewerId ?? step.reviewerId ?? project.reviewerId ?? project.ownerId}
        requiresApproval={step.deliverableRequiresApproval || Boolean(step.deliverableId)}
        allowLink
        compact
        label="Nộp file hoặc link kết quả cho bước này"
        onUploaded={onUploaded}
      />
      <FileList
        workspaceId={workspaceId}
        projectId={project.sourceProjectId ?? undefined}
        taskId={subtask.sourceTaskId ?? undefined}
        deliverableId={step.deliverableId}
        reviewerId={step.deliverableReviewerId ?? step.reviewerId}
        currentPersonId={currentPersonId}
        requiresApproval={step.deliverableRequiresApproval || Boolean(step.deliverableId)}
        refreshKey={fileRefreshKey}
        peopleById={peopleById}
        onChanged={onFilesChanged}
      />
    </div>
  )
}

function SubtaskStepEvidenceSummary({
  subtask,
  filesByStepId,
  people,
  workspaceId,
  allowVersionDelete = false,
  onVersionDeleted,
}: {
  subtask: SubtaskItem
  filesByStepId: Record<string, AttachmentItem[]>
  people: Record<string, CommandCenterPersonRow>
  workspaceId?: string
  allowVersionDelete?: boolean
  onVersionDeleted?: (file: AttachmentItem, result: VersionDeleteResult) => void
}) {
  if (!subtask.steps.length) {
    return <div style={emptyInline}>Đầu việc con chưa có bước. Bàn giao chung sẽ hiển thị ở bên dưới.</div>
  }

  return (
    <div style={stepEvidenceSummaryStackStyle}>
      {subtask.steps.map((step, index) => (
        <section key={step.id} style={stepEvidenceSummaryGroupStyle}>
          <div style={stepEvidenceSummaryHeaderStyle}>
            <span style={stepEvidenceOrderBadgeStyle}>Bước {index + 1}</span>
            <span style={stepEvidenceSummaryTitleStyle}>{step.title}</span>
            <span style={statusChipStyle(STATUS_META[step.status].bg, STATUS_META[step.status].color)}>
              {STATUS_META[step.status].label}
            </span>
          </div>
          <StepEvidenceFiles
            files={filesByStepId[step.id] ?? []}
            people={people}
            workspaceId={workspaceId}
            emptyText="Chưa có kết quả bàn giao cho bước này."
            allowVersionDelete={allowVersionDelete}
            onVersionDeleted={onVersionDeleted}
          />
        </section>
      ))}
    </div>
  )
}

function StepDraftForm({
  draft,
  people,
  assignablePeople,
  submitLabel,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: StepDraft
  people: Record<string, CommandCenterPersonRow>
  assignablePeople: CommandCenterPersonRow[]
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
            {assignablePeople.map((person) => (
              <option key={person.id} value={person.id}>{formatPeopleOption(person)}</option>
            ))}
          </select>
        </Field>
        <Field label="Người duyệt">
          <select value={draft.reviewerId} onChange={(e) => onChange({ ...draft, reviewerId: e.target.value })} style={inputStyle}>
            <option value="">Chưa gắn người duyệt</option>
            {Object.values(people).map((person) => (
              <option key={person.id} value={person.id}>{formatPeopleOption(person)}</option>
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
  filters,
  assigneeOptions,
  currentPersonId,
  filterSummary,
  onChangeFilters,
}: {
  stats: ProjectOpsStats
  filters: ProjectFilters
  assigneeOptions: CommandCenterPersonRow[]
  currentPersonId: string | null
  filterSummary: ProjectFilterSummary | null
  onChangeFilters: (patch: Partial<ProjectFilters>) => void
}) {
  const peopleOptions = assigneeOptions.filter((person) => person.id !== currentPersonId)
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
        <button type="button" onClick={() => onChangeFilters(createDefaultProjectFilters())} style={filterChipStyle(filters.quick === 'all' && filters.status === 'all' && filters.deadline === 'all' && filters.assigneeId === 'all' && !filters.search)}>
          Tất cả
        </button>
        <button type="button" onClick={() => onChangeFilters({ quick: filters.quick === 'unassigned' ? 'all' : 'unassigned' })} style={filterChipStyle(filters.quick === 'unassigned', stats.unassigned > 0 ? 'warning' : 'neutral')}>
          Chưa gắn người · {stats.unassigned}
        </button>
        <select aria-label="Lọc trạng thái" value={filters.status} onChange={(event) => onChangeFilters({ status: event.target.value as ProjectStatusFilter })} style={selectStyle}>
          <option value="all">Tất cả trạng thái</option>
          {TASK_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
          <option value="overdue">Quá hạn</option>
        </select>
        <select aria-label="Lọc deadline" value={filters.deadline} onChange={(event) => onChangeFilters({ deadline: event.target.value as ProjectDeadlineFilter })} style={selectStyle}>
          <option value="all">Tất cả thời gian</option>
          <option value="today">Hôm nay</option>
          <option value="this_week">Tuần này</option>
          <option value="next_week">Tuần sau</option>
          <option value="overdue">Quá hạn</option>
          <option value="this_month">Tháng này</option>
          <option value="none">Không có deadline</option>
        </select>
        <select aria-label="Lọc người thực hiện" value={filters.assigneeId} onChange={(event) => onChangeFilters({ assigneeId: event.target.value })} style={selectStyle}>
          <option value="all">Tất cả người thực hiện</option>
          {currentPersonId ? <option value={currentPersonId}>Tôi</option> : null}
          {peopleOptions.map((person) => (
            <option key={person.id} value={person.id}>{formatPeopleOption(person)}</option>
          ))}
        </select>
        <input
          aria-label="Tìm trong dự án"
          value={filters.search}
          onChange={(event) => onChangeFilters({ search: event.target.value })}
          placeholder="Tìm project, đầu việc, bước..."
          style={{ ...inputStyle, minWidth: 220, flex: '1 1 220px' }}
        />
      </div>
      {filterSummary ? (
        <div style={mutedMetaStyle}>
          Đang hiển thị {filterSummary.visibleSubtasks}/{filterSummary.totalSubtasks} đầu việc con · {filterSummary.visibleSteps}/{filterSummary.totalSteps} bước trong phạm vi quyền hiện tại.
        </div>
      ) : null}
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

function EditWorkItemDrawer({
  context,
  people,
  assignablePeople,
  onClose,
  onSave,
}: {
  context: EditContext | null
  people: Record<string, CommandCenterPersonRow>
  assignablePeople: CommandCenterPersonRow[]
  onClose: () => void
  onSave: (draft: EditDraft) => Promise<boolean>
}) {
  if (!context) return null
  return (
    <EditWorkItemDrawerBody
      key={getEditContextKey(context)}
      context={context}
      people={people}
      assignablePeople={assignablePeople}
      onClose={onClose}
      onSave={onSave}
    />
  )
}

function EditWorkItemDrawerBody({
  context,
  people,
  assignablePeople,
  onClose,
  onSave,
}: {
  context: EditContext
  people: Record<string, CommandCenterPersonRow>
  assignablePeople: CommandCenterPersonRow[]
  onClose: () => void
  onSave: (draft: EditDraft) => Promise<boolean>
}) {
  const [draft, setDraft] = React.useState<EditDraft>(() => editContextToDraft(context))
  const [saving, setSaving] = React.useState(false)

  const kind = context.target.kind
  const title = getEditDrawerTitle(context)
  const showStartDate = kind !== 'step'
  const showExpectedResult = kind === 'subtask' || kind === 'step'
  const showStepToggles = kind === 'step'
  const showRequiresDeliverable = kind === 'step'

  async function handleSave() {
    if (saving) return
    setSaving(true)
    const ok = await onSave(draft)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Drawer
      open={Boolean(context)}
      title={title}
      onClose={onClose}
      width={520}
      footer={(
        <>
          <GhostButton icon="ti-x" onClick={onClose}>Hủy</GhostButton>
          <PrimaryButton icon="ti-device-floppy" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </PrimaryButton>
        </>
      )}
    >
      <div style={drawerTabLabelStyle}>
        <i className="ti ti-info-circle" />
        <span>Thông tin</span>
      </div>
      <div style={formGrid}>
        <Field label={getTitleFieldLabel(kind)}>
          <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} style={inputStyle} />
        </Field>
        <Field label="Owner / người phụ trách">
          <select value={draft.ownerId} onChange={(event) => setDraft((current) => ({ ...current, ownerId: event.target.value }))} style={inputStyle}>
            <option value="">Chưa gắn người</option>
            {assignablePeople.map((person) => (
              <option key={person.id} value={person.id}>{formatPeopleOption(person)}</option>
            ))}
          </select>
        </Field>
        <Field label="Người duyệt">
          <select value={draft.reviewerId} onChange={(event) => setDraft((current) => ({ ...current, reviewerId: event.target.value }))} style={inputStyle}>
            <option value="">Chưa gắn người duyệt</option>
            {Object.values(people).map((person) => (
              <option key={person.id} value={person.id}>{formatPeopleOption(person)}</option>
            ))}
          </select>
        </Field>
        {showStartDate ? (
          <Field label="Ngày bắt đầu">
            <input
              type="date"
              value={draft.startDate}
              onInput={(event) => {
                const { value } = event.currentTarget
                setDraft((current) => ({ ...current, startDate: value }))
              }}
              onChange={(event) => {
                const { value } = event.target
                setDraft((current) => ({ ...current, startDate: value }))
              }}
              style={inputStyle}
            />
          </Field>
        ) : null}
        <Field label="Deadline">
          <input
            type="date"
            value={draft.dueDate}
            onInput={(event) => {
              const { value } = event.currentTarget
              setDraft((current) => ({ ...current, dueDate: value }))
            }}
            onChange={(event) => {
              const { value } = event.target
              setDraft((current) => ({ ...current, dueDate: value }))
            }}
            style={inputStyle}
          />
        </Field>
        <Field label="Trạng thái">
          <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as TaskStatus }))} style={inputStyle}>
            {TASK_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Mô tả / ghi chú">
        <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} style={textareaStyle} />
      </Field>

      {showExpectedResult ? (
        <Field label={kind === 'step' ? 'Kết quả cần nộp / ghi chú bước' : 'Expected result / kết quả cần nộp'}>
          <textarea value={draft.expectedResult} onChange={(event) => setDraft((current) => ({ ...current, expectedResult: event.target.value }))} style={textareaStyle} />
        </Field>
      ) : null}

      {showRequiresDeliverable || showStepToggles ? (
        <div style={stepToggleRow}>
          {showStepToggles ? (
            <label style={toggleWrap}>
              <input type="checkbox" checked={draft.isRequired} onChange={(event) => setDraft((current) => ({ ...current, isRequired: event.target.checked }))} />
              <span>Bước bắt buộc</span>
            </label>
          ) : null}
          {showRequiresDeliverable ? (
            <label style={toggleWrap}>
              <input type="checkbox" checked={draft.requiresDeliverable} onChange={(event) => setDraft((current) => ({ ...current, requiresDeliverable: event.target.checked }))} />
              <span>Yêu cầu file/báo cáo</span>
            </label>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  )
}

function OverviewTab({
  project,
  people,
  filters,
  selectedSubtaskId,
  onSelectSubtask,
  renderSubtaskDetail,
  onOpenSubtaskComposer,
  onDeleteWorkstream,
  onEditWorkstream,
}: {
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  filters: ProjectFilters
  selectedSubtaskId: string | null
  onSelectSubtask: (id: string) => void
  renderSubtaskDetail: (subtask: SubtaskItem) => React.ReactNode
  onOpenSubtaskComposer: (workstreamId: string) => void
  onDeleteWorkstream: (workstreamId: string) => void
  onEditWorkstream: (workstreamId: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {project.workstreams.map((workstream) => {
        const visibleSubtasks = sortSubtasksForOperations(workstream.subtasks).filter((subtask) => matchesProjectWorkFilter(subtask, filters, { project, workstream }))
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
              <GhostButton icon="ti-pencil" onClick={() => onEditWorkstream(workstream.id)}>Sửa</GhostButton>
              <DangerButton icon="ti-trash" onClick={() => onDeleteWorkstream(workstream.id)}>Xóa đầu việc lớn</DangerButton>
              <GhostButton icon="ti-plus" onClick={() => onOpenSubtaskComposer(workstream.id)}>Thêm đầu việc con</GhostButton>
            </div>
          </div>

          <PlanDocumentsPanel
            key={`workstream-plan-${workstream.id}`}
            targetType="WORKSTREAM"
            targetId={workstream.id}
            title="Plan đầu việc lớn"
          />

          {visibleSubtasks.length === 0 ? (
            <div style={emptyInline}>{workstream.subtasks.length ? 'Không có việc phù hợp với bộ lọc.' : 'Đầu việc lớn này chưa có đầu việc con.'}</div>
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

function Metric({ icon, label, value, danger = false }: { icon: string; label: string; value: number | string; danger?: boolean }) {
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

function appendIndexValue<T>(index: Map<string, T[]>, key: string | null | undefined, value: T) {
  if (!key) return
  const values = index.get(key)
  if (values) values.push(value)
  else index.set(key, [value])
}

function projectWorkstreamIndexKey(projectId: string, workstreamId: string) {
  return `${projectId}:${workstreamId}`
}

function buildWorkspaceSeedIndex(
  tasks: CommandCenterTaskRow[],
  workstreams: CommandCenterWorkstreamRow[],
  taskSteps: CommandCenterTaskStepRow[],
  deliverables: CommandCenterDeliverableRow[],
  deliverableVersions: CommandCenterDeliverableVersionRow[],
  attachments: CommandCenterAttachmentRow[],
  meetings: CommandCenterMeetingRow[],
): WorkspaceSeedIndex {
  const tasksByProjectId = new Map<string, CommandCenterTaskRow[]>()
  const tasksByProjectWorkstream = new Map<string, CommandCenterTaskRow[]>()
  const workstreamsByProjectId = new Map<string, CommandCenterWorkstreamRow[]>()
  const taskStepsByTaskId = new Map<string, CommandCenterTaskStepRow[]>()
  const deliverablesByTaskId = new Map<string, CommandCenterDeliverableRow[]>()
  const firstDeliverableByStepId = new Map<string, CommandCenterDeliverableRow>()
  const versionsByDeliverableId = new Map<string, CommandCenterDeliverableVersionRow[]>()
  const versionsByTaskId = new Map<string, CommandCenterDeliverableVersionRow[]>()
  const meetingsByProjectId = new Map<string, CommandCenterMeetingRow[]>()

  const deliverablesById = new Map(deliverables.map((deliverable) => [deliverable.id, deliverable]))
  for (const task of tasks) {
    appendIndexValue(tasksByProjectId, task.project_id, task)
    if (task.project_id && task.workstream_id) {
      appendIndexValue(
        tasksByProjectWorkstream,
        projectWorkstreamIndexKey(task.project_id, task.workstream_id),
        task,
      )
    }
  }

  for (const workstream of workstreams) {
    appendIndexValue(workstreamsByProjectId, workstream.project_id, workstream)
  }

  for (const step of taskSteps) {
    appendIndexValue(taskStepsByTaskId, step.task_id, step)
  }

  for (const deliverable of deliverables) {
    appendIndexValue(deliverablesByTaskId, deliverable.task_id, deliverable)
    if (deliverable.step_id && !firstDeliverableByStepId.has(deliverable.step_id)) {
      firstDeliverableByStepId.set(deliverable.step_id, deliverable)
    }
  }

  for (const version of deliverableVersions) {
    appendIndexValue(versionsByDeliverableId, version.deliverable_id, version)
    const taskId = deliverablesById.get(version.deliverable_id)?.task_id
    appendIndexValue(versionsByTaskId, taskId, version)
  }
  for (const versions of versionsByDeliverableId.values()) {
    versions.sort((left, right) => right.version_number - left.version_number)
  }

  for (const meeting of meetings) {
    appendIndexValue(meetingsByProjectId, meeting.project_id, meeting)
  }

  return {
    tasksByProjectId,
    tasksByProjectWorkstream,
    workstreamsByProjectId,
    taskStepsByTaskId,
    deliverablesByTaskId,
    firstDeliverableByStepId,
    versionsByDeliverableId,
    attachmentsById: new Map(attachments.map((attachment) => [attachment.id, attachment])),
    meetingsByProjectId,
    versionsByTaskId,
  }
}

function seedWorkspace(
  projects: CommandCenterProjectRow[],
  people: CommandCenterPersonRow[],
  seedIndex: WorkspaceSeedIndex,
): ProjectWorkspace[] {
  const today = getVietnamDateKey()
  const fallbackOwner = people[0]?.id ?? null

  return normalizeWorkspaceTree(projects.map((project, projectIndex) => {
    const projectTasks = seedIndex.tasksByProjectId.get(project.id) ?? []
    const projectWorkstreams = seedIndex.workstreamsByProjectId.get(project.id) ?? []
    const startDate = normalizeDateKey(project.start_date) ?? shiftDate(today, projectIndex * 3)
    const mappedWorkstreams = projectWorkstreams.map((workstream) => {
      const streamTasks = seedIndex.tasksByProjectWorkstream.get(projectWorkstreamIndexKey(project.id, workstream.id)) ?? []
      const subtasks = streamTasks.map((task, taskIndex) => toSeedSubtask(task, startDate, taskIndex, seedIndex))
      return toWorkstreamItem(workstream, subtasks, startDate, fallbackOwner)
    })

    const projectWorkstreamIds = new Set(projectWorkstreams.map((stream) => stream.id))
    const ungroupedTasks = projectTasks.filter((task) => !task.workstream_id || !projectWorkstreamIds.has(task.workstream_id))
    const ungroupedWorkstream: WorkstreamItem | null = ungroupedTasks.length
      ? {
          id: `ungrouped-${project.id}`,
          title: 'Chưa phân nhóm',
          description: '',
          ownerId: project.owner_id ?? fallbackOwner,
          reviewerId: project.reviewer_id ?? null,
          storedStatus: 'NOT_STARTED',
          startDate,
          dueDate: normalizeDateKey(project.due_date) ?? shiftDate(startDate, 21),
          status: 'NOT_STARTED',
          subtasks: ungroupedTasks.map((task, taskIndex) => toSeedSubtask(task, startDate, taskIndex, seedIndex)),
        }
      : null
    const projectTree = ungroupedWorkstream ? [...mappedWorkstreams, ungroupedWorkstream] : mappedWorkstreams
    const dueDate = normalizeDateKey(project.due_date) ?? projectTree.map((item) => item.dueDate).filter(Boolean).sort().at(-1) ?? shiftDate(startDate, 21)

    return {
      id: project.id,
      sourceProjectId: project.id,
      name: project.name,
      code: project.code ?? `PRJ-${projectIndex + 1}`,
      status: normalizeStatus(project.status),
      storedStatus: project.status,
      ownerId: project.owner_id ?? fallbackOwner,
      reviewerId: project.reviewer_id ?? null,
      startDate,
      dueDate,
      description: project.description ?? '',
      workstreams: projectTree,
      meetings: (seedIndex.meetingsByProjectId.get(project.id) ?? [])
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
    description: workstream.description ?? '',
    ownerId: workstream.owner_id ?? fallbackOwner,
    reviewerId: workstream.reviewer_id ?? null,
    storedStatus: workstream.status,
    startDate: normalizeDateKey(workstream.start_date) ?? subtasks[0]?.startDate ?? projectStart,
    dueDate: normalizeDateKey(workstream.due_date) ?? subtasks.map((task) => task.dueDate).filter(Boolean).sort().at(-1) ?? shiftDate(projectStart, 14),
    status: isTaskStatus(workstream.status) ? normalizeStatus(workstream.status) : deriveWorkstreamStatus(subtasks),
    subtasks,
  }
}

function toSeedSubtask(
  task: CommandCenterTaskRow,
  projectStart: string,
  taskIndex: number,
  seedIndex: WorkspaceSeedIndex,
): SubtaskItem {
  const dueDate = normalizeDateKey(task.due_date) ?? shiftDate(projectStart, 5 + taskIndex * 2)
  const startDate = normalizeDateKey(task.start_date) ?? shiftDate(dueDate, -3)
  const taskDeliverables = seedIndex.deliverablesByTaskId.get(task.id) ?? []
  const taskAttachments = buildDeliverableFileItems(taskDeliverables, task.id, seedIndex)
  const persistedSteps = (seedIndex.taskStepsByTaskId.get(task.id) ?? [])
    .map((step) => {
      const linkedDeliverable = seedIndex.firstDeliverableByStepId.get(step.id)
      const evidence = getDeliverableEvidenceState(linkedDeliverable, seedIndex.versionsByDeliverableId)
      const stepStatus = normalizeStatus(step.status)
      const stepText = parseStepText(step.description)
      return {
        id: step.id,
        title: step.title,
        description: stepText.description,
        ownerId: step.owner_id,
        reviewerId: step.reviewer_id ?? null,
        dueDate: normalizeDateKey(step.due_date) ?? dueDate,
        missingDueDate: !normalizeDateKey(step.due_date),
        priority: step.priority,
        createdAt: step.created_at,
        sortOrder: step.sort_order,
        status: evidence.valid ? 'COMPLETED' : stepStatus,
        note: stepText.expectedResult,
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
  const taskEvidence = getDeliverableEvidenceState(taskLevelDeliverable, seedIndex.versionsByDeliverableId)
  const requiredDeliverableEvidence = taskDeliverables
    .filter((deliverable) => deliverable.is_required !== false)
    .map((deliverable) => getDeliverableEvidenceState(deliverable, seedIndex.versionsByDeliverableId))
  const allRequiredDeliverablesValid = requiredDeliverableEvidence.length > 0 && requiredDeliverableEvidence.every((evidence) => evidence.valid)
  const requiredSteps = persistedSteps.filter((step) => step.isRequired)
  const allRequiredStepsSatisfied = requiredSteps.every((step) => step.status === 'COMPLETED' || (step.requiresDeliverable && step.deliverableIsValid))
  const normalizedTaskStatus = normalizeStatus(task.status)
  const effectiveStatus: TaskStatus =
    allRequiredDeliverablesValid &&
    allRequiredStepsSatisfied &&
    !['CANCELLED', 'BLOCKED', 'REVISION_REQUIRED'].includes(normalizedTaskStatus)
      ? 'COMPLETED'
      : normalizedTaskStatus

  return {
    id: task.id,
    sourceTaskId: task.id,
    title: task.title,
    description: task.description ?? '',
    ownerId: task.owner_id,
    reviewerId: task.reviewer_id ?? null,
    supporterIds: [...(task.assignee_ids ?? []), ...(task.supporter_ids ?? [])],
    startDate,
    dueDate,
    missingStartDate: !task.start_date,
    missingDueDate: !task.due_date,
    status: effectiveStatus,
    reportText: task.expected_result ?? '',
    needsFile: Boolean(taskLevelDeliverable ?? taskDeliverables.length),
    taskDeliverableValid: taskEvidence.valid,
    fileBlocker: taskEvidence.blocker,
    attachments: taskAttachments,
    deadlineHistory: [],
    steps: persistedSteps,
  }
}

function getDeliverableEvidenceState(
  deliverable: CommandCenterDeliverableRow | null | undefined,
  versionsByDeliverableId: Map<string, CommandCenterDeliverableVersionRow[]>,
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

  const relatedVersions = versionsByDeliverableId.get(deliverable.id) ?? []
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

function formatPeopleOption(person: CommandCenterPersonRow) {
  const department = Array.isArray(person.department)
    ? person.department[0]?.name
    : person.department?.name
  return [person.full_name, person.job_title, department].filter(Boolean).join(' — ')
}

function isTaskStatus(value: string | null | undefined): value is TaskStatus {
  return Boolean(value && TASK_STATUS_ORDER.includes(value as TaskStatus))
}

function parseStepText(value: string | null | undefined) {
  const raw = value?.trim() ?? ''
  const markerIndex = raw.indexOf(STEP_EXPECTED_RESULT_MARKER)
  if (markerIndex === -1) return { description: raw, expectedResult: raw }
  return {
    description: raw.slice(0, markerIndex).trim(),
    expectedResult: raw.slice(markerIndex + STEP_EXPECTED_RESULT_MARKER.length).trim(),
  }
}

function serializeStepText(description: string, expectedResult: string) {
  const cleanDescription = description.trim()
  const cleanExpectedResult = expectedResult.trim()
  if (!cleanExpectedResult || cleanExpectedResult === cleanDescription) return cleanDescription
  if (!cleanDescription) return cleanExpectedResult
  return `${cleanDescription}${STEP_EXPECTED_RESULT_MARKER}${cleanExpectedResult}`
}

function makeStep(title: string, ownerId: string | null, dueDate: string, reviewerId: string | null = null): StepItem {
  return {
    id: makeId('step'),
    title,
    description: '',
    ownerId,
    reviewerId,
    dueDate,
    priority: 'MEDIUM',
    createdAt: new Date().toISOString(),
    sortOrder: null,
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

function buildDeliverableFileItems(
  deliverables: CommandCenterDeliverableRow[],
  taskId: string,
  seedIndex: WorkspaceSeedIndex,
): AttachmentItem[] {
  const deliverablesById = new Map(deliverables.map((deliverable) => [deliverable.id, deliverable]))

  return (seedIndex.versionsByTaskId.get(taskId) ?? [])
    .filter((version) => deliverablesById.has(version.deliverable_id))
    .filter((version) => !isVersionInvalid(normalizeVersionReviewStatus(version.review_status)))
    .sort((a, b) => {
      const submittedOrder = String(b.submitted_at ?? '').localeCompare(String(a.submitted_at ?? ''))
      return submittedOrder || b.version_number - a.version_number
    })
    .map((version) => {
      const deliverable = deliverablesById.get(version.deliverable_id)
      const attachment = version.attachment_id ? seedIndex.attachmentsById.get(version.attachment_id) : null
      const name = version.external_url
        ? externalLinkDisplayName(version.external_url, version.change_note)
        : attachment?.file_name ?? deliverable?.name ?? `Version ${version.version_number}`
      const url = version.external_url ?? buildStorageOpenUrl(attachment)

      return {
        id: version.id,
        name: cleanDisplayFileName(name),
        url,
        deliverableId: version.deliverable_id,
        versionId: version.id,
        attachmentId: version.attachment_id,
        stepId: deliverable?.step_id ?? null,
        mimeType: version.external_url ? 'external_url' : attachment?.mime_type ?? null,
        sizeBytes: attachment?.size_bytes ?? null,
        status: normalizeVersionReviewStatus(version.review_status),
        submittedBy: version.submitted_by ?? attachment?.uploaded_by ?? null,
        submittedAt: version.submitted_at ?? attachment?.uploaded_at ?? null,
        versionNumber: version.version_number,
      }
    })
}

function buildStorageOpenUrl(attachment: CommandCenterAttachmentRow | null | undefined) {
  if (!attachment?.workspace_id || !attachment.storage_path) return null
  const params = new URLSearchParams({ workspaceId: attachment.workspace_id, path: attachment.storage_path })
  return `/api/files/open?${params.toString()}`
}

function cleanDisplayFileName(name: string) {
  return name.replace(/^\d+_/, '')
}

function createStepDraft(subtask: SubtaskItem): StepDraft {
  return {
    title: '',
    description: '',
    ownerId: subtask.ownerId ?? '',
    reviewerId: subtask.reviewerId ?? '',
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
    reviewerId: step.reviewerId ?? '',
    dueDate: step.dueDate,
    status: step.status,
    isRequired: step.isRequired,
    requiresDeliverable: step.requiresDeliverable,
  }
}

function resolveEditContext(workspace: ProjectWorkspace[], target: EditTarget): EditContext | null {
  const project = workspace.find((item) => item.id === target.projectId)
  if (!project) return null
  if (target.kind === 'project') return { target, project }

  const workstream = project.workstreams.find((item) => item.id === target.workstreamId)
  if (!workstream) return null
  if (target.kind === 'workstream') return { target, project, workstream }

  const subtask = workstream.subtasks.find((item) => item.id === target.subtaskId)
  if (!subtask) return null
  if (target.kind === 'subtask') return { target, project, workstream, subtask }

  const step = subtask.steps.find((item) => item.id === target.stepId)
  if (!step) return null
  return { target, project, workstream, subtask, step }
}

function editContextToDraft(context: EditContext): EditDraft {
  if (context.target.kind === 'project') {
    return {
      title: context.project.name,
      description: context.project.description,
      ownerId: context.project.ownerId ?? '',
      reviewerId: context.project.reviewerId ?? '',
      startDate: context.project.startDate,
      dueDate: context.project.dueDate,
      status: context.project.status,
      expectedResult: '',
      isRequired: true,
      requiresDeliverable: false,
    }
  }

  if (context.target.kind === 'workstream' && context.workstream) {
    return {
      title: context.workstream.title,
      description: context.workstream.description,
      ownerId: context.workstream.ownerId ?? '',
      reviewerId: context.workstream.reviewerId ?? '',
      startDate: context.workstream.startDate,
      dueDate: context.workstream.dueDate,
      status: context.workstream.status,
      expectedResult: '',
      isRequired: true,
      requiresDeliverable: false,
    }
  }

  if (context.target.kind === 'subtask' && context.subtask) {
    return {
      title: context.subtask.title,
      description: context.subtask.description,
      ownerId: context.subtask.ownerId ?? '',
      reviewerId: context.subtask.reviewerId ?? '',
      startDate: context.subtask.startDate,
      dueDate: context.subtask.dueDate,
      status: context.subtask.status,
      expectedResult: context.subtask.reportText,
      isRequired: true,
      requiresDeliverable: context.subtask.needsFile,
    }
  }

  const step = context.step as StepItem
  return {
    title: step.title,
    description: step.description || step.note,
    ownerId: step.ownerId ?? '',
    reviewerId: step.reviewerId ?? '',
    startDate: '',
    dueDate: step.dueDate,
    status: step.status,
    expectedResult: step.note,
    isRequired: step.isRequired,
    requiresDeliverable: step.requiresDeliverable,
  }
}

function validateEditDraft(draft: EditDraft) {
  if (!draft.title.trim()) return 'Tên không được để trống.'
  if (draft.startDate && Number.isNaN(Date.parse(`${draft.startDate}T00:00:00+07:00`))) return 'Ngày bắt đầu không hợp lệ.'
  if (draft.dueDate && Number.isNaN(Date.parse(`${draft.dueDate}T00:00:00+07:00`))) return 'Deadline không hợp lệ.'
  if (!isTaskStatus(draft.status)) return 'Trạng thái không hợp lệ.'
  return null
}

function getEditApiTarget(context: EditContext): { type: 'project' | 'workstream' | 'task' | 'step'; id: string } | null {
  if (context.target.kind === 'project') return { type: 'project', id: context.project.sourceProjectId ?? context.project.id }
  if (context.target.kind === 'workstream' && context.workstream) return { type: 'workstream', id: context.workstream.id }
  if (context.target.kind === 'subtask' && context.subtask) return { type: 'task', id: context.subtask.sourceTaskId ?? context.subtask.id }
  if (context.target.kind === 'step' && context.step) return { type: 'step', id: context.step.id }
  return null
}

function buildEditPatch(kind: EditableKind, draft: EditDraft): Record<string, unknown> {
  if (kind === 'step') {
    return {
      title: draft.title.trim(),
      description: serializeStepText(draft.description, draft.expectedResult),
      ownerId: draft.ownerId || null,
      reviewerId: draft.reviewerId || null,
      dueDate: draft.dueDate || null,
      status: draft.status,
      isRequired: draft.isRequired,
      requiresDeliverable: draft.requiresDeliverable,
    }
  }

  return {
    name: draft.title.trim(),
    description: draft.description.trim(),
    ownerId: draft.ownerId || null,
    reviewerId: draft.reviewerId || null,
    startDate: draft.startDate || null,
    dueDate: draft.dueDate || null,
    status: draft.status,
    ...(kind === 'subtask' ? { expectedResult: draft.expectedResult.trim() } : {}),
  }
}

function applyEditDraftToWorkspace(workspace: ProjectWorkspace[], target: EditTarget, draft: EditDraft) {
  return workspace.map((project) => {
    if (project.id !== target.projectId) return project
    if (target.kind === 'project') {
      return {
        ...project,
        name: draft.title.trim(),
        description: draft.description,
        ownerId: draft.ownerId || null,
        reviewerId: draft.reviewerId || null,
        startDate: draft.startDate,
        dueDate: draft.dueDate,
        status: draft.status,
        storedStatus: draft.status,
      }
    }

    return {
      ...project,
      workstreams: project.workstreams.map((workstream) => {
        if (workstream.id !== target.workstreamId) return workstream
        if (target.kind === 'workstream') {
          return {
            ...workstream,
            title: draft.title.trim(),
            description: draft.description,
            ownerId: draft.ownerId || null,
            reviewerId: draft.reviewerId || null,
            startDate: draft.startDate,
            dueDate: draft.dueDate,
            status: draft.status,
            storedStatus: draft.status,
          }
        }

        return {
          ...workstream,
          subtasks: workstream.subtasks.map((subtask) => {
            if (subtask.id !== target.subtaskId) return subtask
            if (target.kind === 'subtask') {
              return {
                ...subtask,
                title: draft.title.trim(),
                description: draft.description,
                ownerId: draft.ownerId || null,
                reviewerId: draft.reviewerId || null,
                startDate: draft.startDate,
                dueDate: draft.dueDate,
                status: draft.status,
                reportText: draft.expectedResult,
              }
            }

            return {
              ...subtask,
              steps: subtask.steps.map((step) =>
                step.id !== target.stepId
                  ? step
                  : {
                      ...step,
                      title: draft.title.trim(),
                      description: draft.description,
                      note: draft.expectedResult,
                      ownerId: draft.ownerId || null,
                      reviewerId: draft.reviewerId || null,
                      dueDate: draft.dueDate,
                      status: draft.status,
                      isRequired: draft.isRequired,
                      requiresDeliverable: draft.requiresDeliverable,
                    },
              ),
            }
          }),
        }
      }),
    }
  })
}

function getEditContextKey(context: EditContext) {
  return [
    context.target.kind,
    context.project.id,
    context.workstream?.id,
    context.subtask?.id,
    context.step?.id,
  ].filter(Boolean).join(':')
}

function getEditDrawerTitle(context: EditContext) {
  if (context.target.kind === 'project') return 'Sửa dự án'
  if (context.target.kind === 'workstream') return 'Sửa đầu việc lớn'
  if (context.target.kind === 'subtask') return 'Sửa đầu việc con'
  return 'Sửa bước'
}

function getTitleFieldLabel(kind: EditableKind) {
  if (kind === 'project') return 'Tên dự án'
  if (kind === 'workstream') return 'Tên đầu việc lớn'
  if (kind === 'subtask') return 'Tên đầu việc con'
  return 'Tên bước'
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

function createDraft(ownerId?: string | null, dueDate?: string, reviewerId?: string | null): ComposerDraft {
  return {
    name: '',
    code: '',
    description: '',
    ownerId: ownerId ?? '',
    reviewerId: reviewerId ?? '',
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

function findWorkstreamForSubtask(project: ProjectWorkspace, subtaskId: string | null) {
  if (!subtaskId) return null
  return project.workstreams.find((workstream) => workstream.subtasks.some((subtask) => subtask.id === subtaskId)) ?? null
}

function isStructuralShareRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getStructuralShareId(value: unknown) {
  if (!isStructuralShareRecord(value)) return null
  return typeof value.id === 'string' ? value.id : null
}

function structurallyShareValue(previous: unknown, next: unknown): unknown {
  if (Object.is(previous, next)) return previous

  if (Array.isArray(next)) {
    if (!Array.isArray(previous)) return next

    const previousById = new Map<string, unknown>()
    for (const item of previous) {
      const id = getStructuralShareId(item)
      if (id) previousById.set(id, item)
    }

    const sharedItems = next.map((item, itemIndex) => {
      const id = getStructuralShareId(item)
      const previousItem = id ? previousById.get(id) : previous[itemIndex]
      return structurallyShareValue(previousItem, item)
    })
    const canReusePrevious = previous.length === sharedItems.length
      && sharedItems.every((item, itemIndex) => Object.is(item, previous[itemIndex]))
    return canReusePrevious ? previous : sharedItems
  }

  if (isStructuralShareRecord(next)) {
    if (!isStructuralShareRecord(previous)) return next

    const nextKeys = Object.keys(next)
    const previousKeys = Object.keys(previous)
    let canReusePrevious = nextKeys.length === previousKeys.length
    const sharedRecord: Record<string, unknown> = {}

    for (const key of nextKeys) {
      const sharedValue = structurallyShareValue(previous[key], next[key])
      if (!Object.prototype.hasOwnProperty.call(previous, key)) canReusePrevious = false
      sharedRecord[key] = sharedValue
      if (!Object.is(sharedValue, previous[key])) canReusePrevious = false
    }

    return canReusePrevious ? previous : sharedRecord
  }

  return next
}

function structurallyShareWorkspace(previous: ProjectWorkspace[], next: ProjectWorkspace[]) {
  const shared = structurallyShareValue(previous, next)
  return Array.isArray(shared) ? shared as ProjectWorkspace[] : next
}

function normalizeWorkspaceTree(
  projects: ProjectWorkspace[],
  previousProjects?: ProjectWorkspace[],
) {
  const normalized = projects.map((project) => {
    const workstreams = project.workstreams.map((workstream) => {
      const subtasks = workstream.subtasks.map(normalizeSubtaskState)
      const subtaskDueDates = subtasks.map((subtask) => subtask.dueDate).filter(Boolean)
      const subtaskStartDates = subtasks.map((subtask) => subtask.startDate).filter(Boolean)

      return {
        ...workstream,
        startDate: subtaskStartDates.length ? subtaskStartDates.reduce((min, value) => (value < min ? value : min), subtaskStartDates[0]) : workstream.startDate,
        dueDate: subtaskDueDates.length ? subtaskDueDates.reduce((max, value) => (value > max ? value : max), subtaskDueDates[0]) : workstream.dueDate,
        status: isTaskStatus(workstream.storedStatus) ? normalizeStatus(workstream.storedStatus) : deriveWorkstreamStatus(subtasks),
        subtasks,
      }
    })

    const workstreamDueDates = workstreams.map((workstream) => workstream.dueDate).filter(Boolean)
    const workstreamStartDates = workstreams.map((workstream) => workstream.startDate).filter(Boolean)

    return {
      ...project,
      startDate: workstreamStartDates.length ? workstreamStartDates.reduce((min, value) => (value < min ? value : min), workstreamStartDates[0]) : project.startDate,
      dueDate: workstreamDueDates.length ? workstreamDueDates.reduce((max, value) => (value > max ? value : max), workstreamDueDates[0]) : project.dueDate,
      status: isTaskStatus(project.storedStatus) ? normalizeStatus(project.storedStatus) : project.status,
      workstreams,
    }
  })

  return previousProjects ? structurallyShareWorkspace(previousProjects, normalized) : normalized
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

  const nextDueDate = latestStepDate > subtask.dueDate ? latestStepDate : subtask.dueDate
  if (nextStatus === subtask.status && nextDueDate === subtask.dueDate) return subtask

  return { ...subtask, status: nextStatus, dueDate: nextDueDate }
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

  const fallbackSubmittedCount = (subtask.taskDeliverableValid ? 1 : 0) + subtask.steps.filter((step) => step.deliverableIsValid).length
  const submittedCount = subtask.attachments.length || fallbackSubmittedCount
  if (submittedCount > 0 || subtask.reportText.trim()) {
    const hasApprovedFile = subtask.attachments.some((file) => file.status === 'APPROVED') || subtask.steps.some((step) => step.deliverableStatus === 'APPROVED')
    return {
      value: submittedCount > 0 ? `Đã nộp ${submittedCount} mục` : 'Đã có báo cáo',
      hint: hasApprovedFile ? 'Có file đã duyệt' : 'Đang có bằng chứng/báo cáo',
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

function getBlockedSection(subtask: SubtaskItem): DetailSection {
  if (
    getMissingDeliverableSteps(subtask).length ||
    getRevisionDeliverableSteps(subtask).length ||
    getMistakenDeliverableSteps(subtask).length ||
    getPendingApprovalDeliverableSteps(subtask).length
  ) return 'files'
  if ((subtask.needsFile || requiresEvidence(subtask.status)) && !hasEvidence(subtask)) return 'files'
  if (!subtask.reportText.trim() && !hasEvidence(subtask)) return 'report'
  return 'workflow'
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

function getProjectAssigneeOptions(
  project: ProjectWorkspace,
  people: Record<string, CommandCenterPersonRow>,
  currentPersonId: string | null,
) {
  const ids = new Set<string>()
  addPersonId(ids, currentPersonId)
  addPersonId(ids, project.ownerId)
  for (const workstream of project.workstreams) {
    addPersonId(ids, workstream.ownerId)
    for (const subtask of workstream.subtasks) {
      addPersonId(ids, subtask.ownerId)
      for (const supporterId of subtask.supporterIds) addPersonId(ids, supporterId)
      for (const step of subtask.steps) addPersonId(ids, step.ownerId)
    }
  }
  return Array.from(ids)
    .map((id) => people[id])
    .filter((person): person is CommandCenterPersonRow => Boolean(person))
    .sort((left, right) => left.full_name.localeCompare(right.full_name, 'vi'))
}

function getAssignablePeopleForOwner(
  people: CommandCenterPersonRow[],
  role: string | null,
  currentPersonId: string | null,
) {
  const normalizedRole = role?.trim().toUpperCase() ?? ''
  if (normalizedRole === 'EMPLOYEE') {
    return people.filter((person) => person.id === currentPersonId)
  }
  if (normalizedRole.includes('READONLY') || normalizedRole === 'ADVISOR') {
    return []
  }
  return [...people].sort((left, right) => left.full_name.localeCompare(right.full_name, 'vi'))
}

function getProjectFilterSummary(project: ProjectWorkspace, filters: ProjectFilters): ProjectFilterSummary {
  const subtasks = project.workstreams.flatMap((workstream) => workstream.subtasks)
  const visibleSubtasks = project.workstreams.flatMap((workstream) =>
    workstream.subtasks.filter((subtask) => matchesProjectWorkFilter(subtask, filters, { project, workstream })),
  )
  return {
    totalSubtasks: subtasks.length,
    visibleSubtasks: visibleSubtasks.length,
    totalSteps: subtasks.reduce((count, subtask) => count + subtask.steps.length, 0),
    visibleSteps: visibleSubtasks.reduce((count, subtask) => count + subtask.steps.length, 0),
  }
}

function addPersonId(target: Set<string>, personId: string | null | undefined) {
  if (personId) target.add(personId)
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

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
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

const projectCardTitleBlock: React.CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const projectNameStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--txt)',
  lineHeight: 1.35,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'break-word',
}

const projectCardMetaStyle: React.CSSProperties = {
  display: 'block',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 12,
  lineHeight: 1.45,
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

const subtaskTable: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
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

const stepInlineUploadPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
  padding: 12,
  borderRadius: 12,
  border: '1px solid rgba(218,223,33,.32)',
  background: 'rgba(218,223,33,.05)',
}

const stepInlineUploadHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  minWidth: 0,
}

const stepInlineUploadCopyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  color: 'var(--txt)',
  fontSize: 12,
  lineHeight: 1.45,
}
const stepUploadPreparingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid rgba(85,199,185,.32)',
  background: 'rgba(85,199,185,.08)',
  color: 'var(--txt)',
}

const stepUploadPreparingCopyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  color: 'var(--txt-2)',
  fontSize: 12,
  lineHeight: 1.45,
}

const stepEvidenceSummaryStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const stepEvidenceSummaryGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 9,
  minWidth: 0,
  padding: 12,
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
}

const sharedEvidenceGroupStyle: React.CSSProperties = {
  ...stepEvidenceSummaryGroupStyle,
  borderStyle: 'dashed',
  background: 'var(--surface-2)',
}

const stepEvidenceSummaryHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
}

const stepEvidenceSummaryTitleStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  color: 'var(--txt)',
  fontSize: 12.5,
  fontWeight: 850,
  overflowWrap: 'anywhere',
}

const stepEvidenceOrderBadgeStyle: React.CSSProperties = {
  flex: '0 0 auto',
  padding: '4px 7px',
  borderRadius: 7,
  border: '1px solid rgba(85,199,185,.32)',
  background: 'rgba(85,199,185,.1)',
  color: '#55C7B9',
  fontSize: 10.5,
  fontWeight: 900,
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

const drawerTabLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  alignSelf: 'flex-start',
  padding: '7px 10px',
  borderRadius: 999,
  border: '1px solid var(--line)',
  background: 'rgba(218, 223, 33, 0.08)',
  color: 'var(--txt-1)',
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 14,
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
