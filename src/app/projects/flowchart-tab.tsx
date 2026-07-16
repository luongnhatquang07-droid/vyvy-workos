'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { PlanDocumentsPanel } from '@/components/documents/PlanDocumentsPanel'
import type { CommandCenterPersonRow, CommandCenterVisibilitySummary } from '@/lib/database.types'
import {
  STATUS_META,
  type SubtaskFileGroups,
  formatDeadlineLabel,
  getAssigneeFilterId,
  getCompactBlockerText,
  getCompletionBlockers,
  getDeadlineSignal,
  getProjectProgress,
  getSubtaskFileGroups,
  getSubtaskProgress,
  getWorkstreamProgress,
  hasActiveProjectFilters,
  hasEvidence,
  isOverdue,
  isUnassignedSubtask,
  matchesDeadlineFilter,
  matchesProjectWorkFilter,
  matchesSearchFilter,
  matchesStatusFilter,
  matchesStepProjectFilter,
  progressStatus,
  toFullDate,
} from './helpers'
import {
  emptyInline,
  filterChipStyle,
  ghostBtnStyle,
  mutedMetaStyle,
  sectionTitle,
  statusChipStyle,
  stepEvidenceToggleStyle,
  textareaStyle,
  warningBanner,
} from './styles'
import { EvidenceFileList, GhostButton, PrimaryButton, ProgressBadge, StepEvidenceFiles } from './ui-primitives'
import type {
  AttachmentItem,
  BadgeTone,
  EditTarget,
  ProjectFilters,
  ProjectWorkspace,
  StepItem,
  SubtaskItem,
  TaskStatus,
  WorkstreamItem,
} from './types'
type FlowchartFilter = 'all' | 'active' | 'completed' | 'delayed' | 'overdue' | 'unassigned'

type FlowchartNodeKind = 'project' | 'workstream' | 'subtask' | 'stepGroup' | 'step'

interface FlowchartNode {
  kind: FlowchartNodeKind
  project: ProjectWorkspace
  workstream?: WorkstreamItem
  subtask?: SubtaskItem
  stepGroup?: FlowchartStepGroup
  step?: StepItem
}

interface FlowchartStepGroup {
  id: string
  title: string
  steps: StepItem[]
}

interface FlowchartPan {
  x: number
  y: number
}

interface FlowchartNodePosition {
  x: number
  y: number
}

type FlowchartNodePositions = Record<string, FlowchartNodePosition>

type FlowchartViewMode = 'diagram' | 'tree'

interface FlowchartConnectorLine {
  id: string
  path: string
  accent: string
  active: boolean
}

interface FlowchartLayoutNodeItem {
  kind: 'node'
  key: string
  node: FlowchartNode
  x: number
  y: number
  width: number
  height: number
  accent: string
  active: boolean
  pathActive: boolean
  variant: 'project' | 'default' | 'group' | 'step'
  collapsibleId?: string
  collapsed?: boolean
  stepGroupId?: string
  dragging?: boolean
}

interface FlowchartLayoutPillItem {
  kind: 'pill'
  key: string
  label: string
  x: number
  y: number
  width: number
  height: number
  accent: string
}

type FlowchartLayoutItem = FlowchartLayoutNodeItem | FlowchartLayoutPillItem

interface FlowchartMindmapLayout {
  items: FlowchartLayoutItem[]
  connectors: FlowchartConnectorLine[]
  width: number
  height: number
}

const FLOWCHART_FILTER_OPTIONS: Array<{ value: FlowchartFilter; label: string; shortLabel?: string; tone?: BadgeTone }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Đang thực hiện', shortLabel: 'Đang làm' },
  { value: 'completed', label: 'Đã hoàn thành', shortLabel: 'Xong', tone: 'success' },
  { value: 'delayed', label: 'Bị trì hoãn / Tạm dừng', shortLabel: 'Tạm dừng', tone: 'warning' },
  { value: 'overdue', label: 'Quá hạn', tone: 'danger' },
  { value: 'unassigned', label: 'Chưa gắn người', shortLabel: 'Chưa gắn' },
]

const FLOWCHART_MAX_ZOOM = 1.5

const FLOWCHART_ZOOM_LEVELS = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5] as const

const FLOWCHART_STEP_GROUP_THRESHOLD = 8

const FLOWCHART_WORKFLOW_STEP_PREVIEW_LIMIT = 12

const FLOWCHART_PROJECT_COLOR = '#DADF21'

const FLOWCHART_BRANCH_COLORS = ['#DADF21', '#55C7B9', '#F3A83B', '#8EA7FF', '#F472B6', '#A3D977', '#FB7185', '#38BDF8']

const FLOWCHART_LAYOUT_PADDING_X = 72

const FLOWCHART_LAYOUT_PADDING_Y = 56

const FLOWCHART_CONNECTOR_NODE_GAP = 8

const FLOWCHART_LAYOUT_VERSION = 1

const FLOWCHART_SNAP_GRID = 20

const FLOWCHART_TREE_COLUMN_GAP = 260

const FLOWCHART_TREE_ROW_GAP = 52

const FLOWCHART_TREE_BRANCH_GAP = 104

const FLOWCHART_NODE_WIDTH = {
  project: 286,
  workstream: 310,
  subtask: 330,
  group: 304,
  step: 286,
  pill: 248,
} as const

const FLOWCHART_NODE_HEIGHT = {
  project: 184,
  workstream: 176,
  subtask: 176,
  group: 150,
  step: 122,
  pill: 52,
} as const

function getDefaultFlowchartCollapsedIds(project: ProjectWorkspace) {
  return new Set(project.workstreams.map((workstream) => flowchartNodeId('workstream', workstream.id)))
}

function buildFlowchartTreeLayout({
  project,
  visibleWorkstreams,
  collapsedIds,
  selectedNode,
  nodePositions = {},
  draggingNodeKey,
}: {
  project: ProjectWorkspace
  visibleWorkstreams: WorkstreamItem[]
  collapsedIds: Set<string>
  selectedNode: FlowchartNode
  nodePositions?: FlowchartNodePositions
  draggingNodeKey?: string | null
}): FlowchartMindmapLayout {
  type ConnectorDraft = { id: string; parentKey: string; childKey: string; accent: string; active: boolean }
  type PendingNode = Omit<FlowchartLayoutNodeItem, 'kind' | 'x' | 'y'> & { x: number; y: number }

  const pendingNodes: PendingNode[] = []
  const connectorDrafts: ConnectorDraft[] = []
  const projectKey = flowchartNodeId('project', project.id)
  const projectX = FLOWCHART_LAYOUT_PADDING_X
  const workstreamX = projectX + FLOWCHART_NODE_WIDTH.project + FLOWCHART_TREE_COLUMN_GAP
  const subtaskX = workstreamX + FLOWCHART_NODE_WIDTH.workstream + FLOWCHART_TREE_COLUMN_GAP
  let cursorY = FLOWCHART_LAYOUT_PADDING_Y
  const workstreamCenters: number[] = []

  function addPendingNode(item: PendingNode) {
    pendingNodes.push(item)
  }

  visibleWorkstreams.forEach((workstream, branchIndex) => {
    const accent = getFlowchartBranchColor(branchIndex)
    const workstreamNode: FlowchartNode = { kind: 'workstream', project, workstream }
    const workstreamKey = getFlowchartNodeKey(workstreamNode)
    const collapsed = collapsedIds.has(workstreamKey)
    const active = selectedNode.kind === 'workstream' && selectedNode.workstream?.id === workstream.id
    const pathActive = isFlowchartWorkstreamPathActive(workstream, selectedNode)
    const branchStartY = cursorY
    const renderedSubtasks = collapsed ? [] : workstream.subtasks
    const subtaskCenters: number[] = []

    renderedSubtasks.forEach((subtask) => {
      const subtaskNode: FlowchartNode = { kind: 'subtask', project, workstream, subtask }
      const subtaskKey = getFlowchartNodeKey(subtaskNode)
      const subtaskActive = selectedNode.kind === 'subtask' && selectedNode.subtask?.id === subtask.id
      const subtaskPathActive = isFlowchartSubtaskPathActive(subtask, selectedNode)
      const y = cursorY
      subtaskCenters.push(y + FLOWCHART_NODE_HEIGHT.subtask / 2)
      addPendingNode({
        key: subtaskKey,
        node: subtaskNode,
        x: subtaskX,
        y,
        width: FLOWCHART_NODE_WIDTH.subtask,
        height: FLOWCHART_NODE_HEIGHT.subtask,
        accent,
        active: subtaskActive,
        pathActive: subtaskPathActive && !subtaskActive,
        variant: 'default',
        dragging: draggingNodeKey === subtaskKey,
      })
      connectorDrafts.push({
        id: `${workstreamKey}->${subtaskKey}`,
        parentKey: workstreamKey,
        childKey: subtaskKey,
        accent,
        active: subtaskPathActive,
      })
      cursorY += FLOWCHART_NODE_HEIGHT.subtask + FLOWCHART_TREE_ROW_GAP
    })

    const workstreamCenterY = subtaskCenters.length
      ? (subtaskCenters[0] + subtaskCenters[subtaskCenters.length - 1]) / 2
      : branchStartY + FLOWCHART_NODE_HEIGHT.workstream / 2
    workstreamCenters.push(workstreamCenterY)

    addPendingNode({
      key: workstreamKey,
      node: workstreamNode,
      x: workstreamX,
      y: workstreamCenterY - FLOWCHART_NODE_HEIGHT.workstream / 2,
      width: FLOWCHART_NODE_WIDTH.workstream,
      height: FLOWCHART_NODE_HEIGHT.workstream,
      accent,
      active,
      pathActive: pathActive && !active,
      variant: 'default',
      collapsibleId: workstreamKey,
      collapsed,
      dragging: draggingNodeKey === workstreamKey,
    })
    connectorDrafts.push({
      id: `${projectKey}->${workstreamKey}`,
      parentKey: projectKey,
      childKey: workstreamKey,
      accent,
      active: selectedNode.kind !== 'project' && selectedNode.workstream?.id === workstream.id,
    })

    cursorY = Math.max(cursorY, branchStartY + FLOWCHART_NODE_HEIGHT.workstream) + FLOWCHART_TREE_BRANCH_GAP
  })

  const projectCenterY = workstreamCenters.length
    ? (workstreamCenters[0] + workstreamCenters[workstreamCenters.length - 1]) / 2
    : FLOWCHART_LAYOUT_PADDING_Y + FLOWCHART_NODE_HEIGHT.project / 2
  const projectNode: FlowchartNode = { kind: 'project', project }
  const projectLayoutItem: FlowchartLayoutNodeItem = {
    kind: 'node',
    key: projectKey,
    node: projectNode,
    x: projectX,
    y: projectCenterY - FLOWCHART_NODE_HEIGHT.project / 2,
    width: FLOWCHART_NODE_WIDTH.project,
    height: FLOWCHART_NODE_HEIGHT.project,
    accent: FLOWCHART_PROJECT_COLOR,
    active: selectedNode.kind === 'project',
    pathActive: selectedNode.kind !== 'project',
    variant: 'project',
    dragging: draggingNodeKey === projectKey,
  }

  const items: FlowchartLayoutItem[] = [
    projectLayoutItem,
    ...pendingNodes.map((item): FlowchartLayoutNodeItem => ({ ...item, kind: 'node' })),
  ].map((item) => {
    if (item.kind !== 'node') return item
    const customPosition = normalizeFlowchartNodePosition(nodePositions[item.key])
    if (!customPosition) return item
    return {
      ...item,
      x: customPosition.x,
      y: customPosition.y,
    }
  })

  const nodeItems = items.filter((item): item is FlowchartLayoutNodeItem => item.kind === 'node')
  const itemMap = new Map(nodeItems.map((item) => [item.key, item]))
  const connectors = connectorDrafts.flatMap((connector, index) => {
    const parent = itemMap.get(connector.parentKey)
    const child = itemMap.get(connector.childKey)
    if (!parent || !child) return []
    return [{
      id: connector.id,
      path: flowchartOrthogonalConnectorPath(parent, child, index),
      accent: connector.accent,
      active: connector.active || connector.parentKey === draggingNodeKey || connector.childKey === draggingNodeKey,
    }]
  })

  const width = Math.max(
    1120,
    ...items.map((item) => item.x + item.width + FLOWCHART_LAYOUT_PADDING_X),
  )
  const height = Math.max(
    640,
    ...items.map((item) => item.y + item.height + FLOWCHART_LAYOUT_PADDING_Y),
  )

  return {
    items,
    connectors,
    width,
    height,
  }
}

export function FlowchartTab({
  project,
  people,
  workspaceId,
  projectFilters,
  visibilitySummary,
  currentUser,
  onSaveSubtaskReport,
  onOpenSubtask,
  onEditNode,
}: {
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  workspaceId?: string
  projectFilters: ProjectFilters
  visibilitySummary?: CommandCenterVisibilitySummary
  currentUser?: {
    personId: string | null
    role: string | null
    canApproveOnBehalf: boolean
  }
  onSaveSubtaskReport: (subtask: SubtaskItem, value: string) => Promise<boolean>
  onOpenSubtask: (subtaskId: string) => void
  onEditNode: (target: EditTarget) => void
}) {
  const [filter, setFilter] = React.useState<FlowchartFilter>('all')
  const [viewMode, setViewMode] = React.useState<FlowchartViewMode>(() => {
    if (typeof window === 'undefined') return 'diagram'
    return window.localStorage.getItem(flowchartViewModeStorageKey(project.id)) === 'tree' ? 'tree' : 'diagram'
  })
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(() => getDefaultFlowchartCollapsedIds(project))
  const [selectedNode, setSelectedNode] = React.useState<FlowchartNode>(() => ({ kind: 'project', project }))
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState<FlowchartPan>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = React.useState(false)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [detailVisible, setDetailVisible] = React.useState(true)
  const [isLayoutEditing, setIsLayoutEditing] = React.useState(false)
  const [savedLayoutPositions, setSavedLayoutPositions] = React.useState<FlowchartNodePositions>(() => readFlowchartLayoutFromStorage(project.id))
  const [draftLayoutPositions, setDraftLayoutPositions] = React.useState<FlowchartNodePositions>(() => readFlowchartLayoutFromStorage(project.id))
  const [layoutEditStartPositions, setLayoutEditStartPositions] = React.useState<FlowchartNodePositions>({})
  const [draggingLayoutNodeKey, setDraggingLayoutNodeKey] = React.useState<string | null>(null)
  const [layoutNotice, setLayoutNotice] = React.useState<string | null>(null)
  const [showFlowchartGuide, setShowFlowchartGuide] = React.useState(() => (
    typeof window === 'undefined' ? true : window.localStorage.getItem('vyvy-flowchart-guide-hidden') !== '1'
  ))
  const [showFlowchartMiniMap, setShowFlowchartMiniMap] = React.useState(true)
  const [canvasViewport, setCanvasViewport] = React.useState({ width: 0, height: 0 })
  const flowchartScrollRef = React.useRef<HTMLDivElement | null>(null)
  const flowchartBoardRef = React.useRef<HTMLDivElement | null>(null)
  const panSessionRef = React.useRef<{ pointerId: number; startX: number; startY: number; pan: FlowchartPan } | null>(null)
  const nodeDragSessionRef = React.useRef<{
    pointerId: number
    key: string
    startX: number
    startY: number
    startPositions: FlowchartNodePositions
    fallbackPosition: FlowchartNodePosition
    moved: boolean
  } | null>(null)
  const ignoreNextFlowchartClickRef = React.useRef(false)
  const autoFitProjectRef = React.useRef<string | null>(null)
  const previousProjectIdRef = React.useRef(project.id)

  React.useEffect(() => {
    if (previousProjectIdRef.current === project.id) return
    previousProjectIdRef.current = project.id
    autoFitProjectRef.current = null
    queueMicrotask(() => {
      setSelectedNode({ kind: 'project', project })
      setCollapsedIds(getDefaultFlowchartCollapsedIds(project))
      setFilter('all')
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setDetailVisible(true)
      setViewMode(typeof window === 'undefined' ? 'diagram' : window.localStorage.getItem(flowchartViewModeStorageKey(project.id)) === 'tree' ? 'tree' : 'diagram')
      const storedLayout = readFlowchartLayoutFromStorage(project.id)
      setSavedLayoutPositions(storedLayout)
      setDraftLayoutPositions(storedLayout)
      setLayoutEditStartPositions({})
      setIsLayoutEditing(false)
      setDraggingLayoutNodeKey(null)
      setLayoutNotice(null)
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
    if (typeof window === 'undefined') return
    window.localStorage.setItem(flowchartViewModeStorageKey(project.id), viewMode)
  }, [project.id, viewMode])

  React.useEffect(() => {
    if (!draggingLayoutNodeKey) return

    function handlePointerMove(event: PointerEvent) {
      const session = nodeDragSessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      event.preventDefault()
      const deltaX = event.clientX - session.startX
      const deltaY = event.clientY - session.startY
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) session.moved = true
      const nextX = snapFlowchartPosition(session.fallbackPosition.x + deltaX / Math.max(zoom, 0.05))
      const nextY = snapFlowchartPosition(session.fallbackPosition.y + deltaY / Math.max(zoom, 0.05))
      setDraftLayoutPositions({
        ...session.startPositions,
        [session.key]: { x: nextX, y: nextY },
      })
    }

    function handlePointerUp(event: PointerEvent) {
      const session = nodeDragSessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      ignoreNextFlowchartClickRef.current = session.moved
      nodeDragSessionRef.current = null
      setDraggingLayoutNodeKey(null)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [draggingLayoutNodeKey, zoom])

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

  React.useEffect(() => {
    const viewport = flowchartScrollRef.current
    if (!viewport) return

    const updateViewport = () => {
      setCanvasViewport({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      })
    }

    updateViewport()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewport)
      return () => window.removeEventListener('resize', updateViewport)
    }

    const observer = new ResizeObserver(updateViewport)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [isFullscreen])
  const collapseIds = React.useMemo(
    () => [
      ...project.workstreams.map((workstream) => flowchartNodeId('workstream', workstream.id)),
      ...project.workstreams.flatMap((workstream) => workstream.subtasks.map((subtask) => flowchartNodeId('subtask', subtask.id))),
    ],
    [project],
  )
  const subtaskCollapseIds = React.useMemo(
    () => project.workstreams.flatMap((workstream) => workstream.subtasks.map((subtask) => flowchartNodeId('subtask', subtask.id))),
    [project],
  )
  const visibleWorkstreams = React.useMemo(() => {
    return project.workstreams
      .map((workstream) => {
        const workstreamMatches = matchesWorkstreamFlowchartFilter(workstream, filter)
        const workstreamProjectMatches = matchesWorkstreamProjectFilter(workstream, projectFilters, project)
        return {
          ...workstream,
          subtasks: workstreamMatches && workstreamProjectMatches
            ? workstream.subtasks
            : workstream.subtasks.filter((subtask) =>
                matchesFlowchartFilter(subtask, filter) &&
                matchesProjectWorkFilter(subtask, projectFilters, { project, workstream }),
              ),
        }
      })
      .filter((workstream) =>
        (matchesWorkstreamFlowchartFilter(workstream, filter) && matchesWorkstreamProjectFilter(workstream, projectFilters, project)) ||
        workstream.subtasks.length > 0,
      )
  }, [filter, project, projectFilters])
  const allSubtasks = project.workstreams.flatMap((workstream) => workstream.subtasks)
  const allSteps = allSubtasks.flatMap((subtask) => subtask.steps)
  const projectVisibility = visibilitySummary?.projects.find((item) => item.projectId === project.id)
  const permissionCounts = projectVisibility?.visible ?? {
    projects: 1,
    workstreams: project.workstreams.length,
    subtasks: allSubtasks.length,
    steps: allSteps.length,
  }
  const totalCounts = projectVisibility?.total ?? permissionCounts
  const flowchartFiltersActive = filter !== 'all' || hasActiveProjectFilters(projectFilters)
  const filteredSubtaskTotal = visibleWorkstreams.reduce((count, workstream) => count + workstream.subtasks.length, 0)
  const filteredStepTotal = visibleWorkstreams.reduce((count, workstream) => (
    count + workstream.subtasks.reduce((stepCount, subtask) => (
      stepCount + getVisibleFlowchartSteps(subtask, filter, projectFilters).length
    ), 0)
  ), 0)
  const visibleSubtaskCount = visibleWorkstreams.reduce((count, workstream) => (
    collapsedIds.has(flowchartNodeId('workstream', workstream.id)) ? count : count + workstream.subtasks.length
  ), 0)
  const hiddenSubtaskCount = Math.max(0, filteredSubtaskTotal - visibleSubtaskCount)
  const restrictedByPermission =
    visibilitySummary?.scope === 'restricted' ||
    totalCounts.workstreams !== permissionCounts.workstreams ||
    totalCounts.subtasks !== permissionCounts.subtasks ||
    totalCounts.steps !== permissionCounts.steps
  const currentRoleLabel = getFlowchartRoleLabel(currentUser?.role ?? visibilitySummary?.role)
  const permissionLine = restrictedByPermission
    ? `Theo quyền ${currentRoleLabel}${visibilitySummary?.departmentName ? ` · ${visibilitySummary.departmentName}` : ''}: ${permissionCounts.workstreams}/${totalCounts.workstreams} đầu việc lớn · ${permissionCounts.subtasks}/${totalCounts.subtasks} đầu việc con · ${permissionCounts.steps}/${totalCounts.steps} bước.`
    : `Hiển thị toàn bộ theo quyền ${currentRoleLabel}: ${permissionCounts.workstreams}/${totalCounts.workstreams} đầu việc lớn · ${permissionCounts.subtasks}/${totalCounts.subtasks} đầu việc con · ${permissionCounts.steps}/${totalCounts.steps} bước.`
  const renderLine = `Sơ đồ trái→phải: ${visibleWorkstreams.length}/${visibleWorkstreams.length} đầu việc lớn · ${visibleSubtaskCount}/${filteredSubtaskTotal} đầu việc con. ${filteredStepTotal} bước xem trong panel chi tiết.`
  const expandedWorkstream = visibleWorkstreams.find((workstream) => !collapsedIds.has(flowchartNodeId('workstream', workstream.id)))
  const branchLine = expandedWorkstream
    ? `Đang mở nhánh: ${expandedWorkstream.title} · ${expandedWorkstream.subtasks.length} đầu việc con.`
    : 'Mặc định chỉ hiện Project + Workstream. Click một Workstream để bung Subtask của nhánh đó.'
  const collapseLine =
    hiddenSubtaskCount
      ? `Đang thu gọn ${hiddenSubtaskCount} đầu việc con. Step không vẽ trên canvas để sơ đồ gọn.`
      : `Canvas đang hiện đủ ${visibleSubtaskCount}/${filteredSubtaskTotal} đầu việc con; step nằm trong panel chi tiết để tránh rối.`
  const filterLine = flowchartFiltersActive
    ? `Bộ lọc đang áp dụng: còn ${visibleWorkstreams.length} đầu việc lớn · ${filteredSubtaskTotal} đầu việc con · ${filteredStepTotal} bước trong phạm vi được phép.`
    : 'Không có filter phụ đang áp dụng.'
  const guideSteps = isLayoutEditing
    ? [
        'Cầm nút ⋮⋮ trên node để kéo',
        'Kéo nền để pan canvas',
        'Ctrl + lăn chuột để zoom',
        'Bấm Fit view nếu muốn căn lại khung',
        'Bấm Lưu bố cục để giữ lại',
      ]
    : [
        'Kéo nền để pan canvas',
        'Ctrl + lăn chuột để zoom',
        'Click node để xem chi tiết',
        'Double click để focus node',
      ]
  const activeLayoutPositions = isLayoutEditing ? draftLayoutPositions : savedLayoutPositions
  const hasSavedLayout = Object.keys(savedLayoutPositions).length > 0
  const flowchartLayout = React.useMemo(() => (
    buildFlowchartTreeLayout({
      project,
      visibleWorkstreams,
      collapsedIds,
      selectedNode,
      nodePositions: activeLayoutPositions,
      draggingNodeKey: draggingLayoutNodeKey,
    })
  ), [activeLayoutPositions, collapsedIds, draggingLayoutNodeKey, project, selectedNode, visibleWorkstreams])
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
  const flowchartViewportLocked = isLayoutEditing || Boolean(draggingLayoutNodeKey)
  const miniMapBounds = isFullscreen
    ? { minWidth: 280, minHeight: 180, maxWidth: 360, maxHeight: 240 }
    : { minWidth: 220, minHeight: 140, maxWidth: 280, maxHeight: 180 }
  const miniMapScale = Math.min(
    0.28,
    miniMapBounds.maxWidth / Math.max(flowchartLayout.width, 1),
    miniMapBounds.maxHeight / Math.max(flowchartLayout.height, 1),
  )
  const miniMapWidth = Math.max(miniMapBounds.minWidth, Math.round(flowchartLayout.width * miniMapScale))
  const miniMapHeight = Math.max(miniMapBounds.minHeight, Math.round(flowchartLayout.height * miniMapScale))
  const miniMapViewport = {
    left: Math.max(0, Math.min(miniMapWidth, (-pan.x / Math.max(zoom, 0.05)) * miniMapScale)),
    top: Math.max(0, Math.min(miniMapHeight, (-pan.y / Math.max(zoom, 0.05)) * miniMapScale)),
    width: Math.max(18, Math.min(miniMapWidth, (canvasViewport.width / Math.max(zoom, 0.05)) * miniMapScale)),
    height: Math.max(18, Math.min(miniMapHeight, (canvasViewport.height / Math.max(zoom, 0.05)) * miniMapScale)),
  }

  React.useEffect(() => {
    if (viewMode !== 'diagram') return
    if (autoFitProjectRef.current === project.id) return
    if (flowchartViewportLocked) return
    const viewport = flowchartScrollRef.current
    const board = flowchartBoardRef.current
    if (!viewport || !board) return
    const frame = window.requestAnimationFrame(() => {
      if (autoFitProjectRef.current === project.id || flowchartViewportLocked) return
      const safeWidth = Math.max(320, viewport.clientWidth - 64)
      const safeHeight = Math.max(260, viewport.clientHeight - 64)
      const boardWidth = Math.max(1, board.offsetWidth)
      const boardHeight = Math.max(1, board.offsetHeight)
      const fitZoom = Math.min(1.08, safeWidth / boardWidth, safeHeight / boardHeight)
      const nextZoom = snapFlowchartZoom(Math.max(0.45, Math.min(0.9, fitZoom * 1.8)), 'nearest')
      autoFitProjectRef.current = project.id
      setZoom(nextZoom)
      setPan({
        x: viewport.clientWidth / 2 - (flowchartLayout.width / 2) * nextZoom,
        y: viewport.clientHeight / 2 - (flowchartLayout.height / 2) * nextZoom,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [flowchartLayout.height, flowchartLayout.width, flowchartViewportLocked, project.id, viewMode])

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
    if (node.kind === 'project') {
      setCollapsedIds(new Set(collapseIds))
      return
    }
    if (node.kind === 'workstream' && node.workstream) {
      const selectedWorkstreamId = flowchartNodeId('workstream', node.workstream.id)
      setCollapsedIds(new Set(collapseIds.filter((id) => id !== selectedWorkstreamId)))
    }
  }

  function setFlowchartZoom(nextZoom: number, origin?: { x: number; y: number }) {
    const clampedZoom = snapFlowchartZoom(nextZoom)
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
    const nextZoom = snapFlowchartZoom(Math.min(1.15, safeWidth / boardWidth, safeHeight / boardHeight), 'floor')
    setZoom(nextZoom)
    setPan({
      x: Math.max(24, (viewport.clientWidth - boardWidth * nextZoom) / 2),
      y: Math.max(24, (viewport.clientHeight - boardHeight * nextZoom) / 2),
    })
  }

  function focusFlowchartNode(nodeKey: string) {
    const viewport = flowchartScrollRef.current
    const item = flowchartLayout.items.find((layoutItem) => layoutItem.key === nodeKey)
    if (!viewport || !item) return
    const nextZoom = snapFlowchartZoom(Math.max(0.55, Math.min(1.1, zoom < 0.72 ? 0.9 : zoom)), 'nearest')
    setZoom(nextZoom)
    setPan({
      x: viewport.clientWidth / 2 - (item.x + item.width / 2) * nextZoom,
      y: viewport.clientHeight / 2 - (item.y + item.height / 2) * nextZoom,
    })
  }

  function handleMiniMapPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    const viewport = flowchartScrollRef.current
    if (!viewport || miniMapScale <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const boardX = (event.clientX - rect.left) / miniMapScale
    const boardY = (event.clientY - rect.top) / miniMapScale
    setPan({
      x: viewport.clientWidth / 2 - boardX * zoom,
      y: viewport.clientHeight / 2 - boardY * zoom,
    })
  }

  function hideFlowchartGuide() {
    setShowFlowchartGuide(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('vyvy-flowchart-guide-hidden', '1')
    }
  }

  function collectVisibleFlowchartPositions() {
    return Object.fromEntries(
      flowchartLayout.items
        .filter((item): item is FlowchartLayoutNodeItem => item.kind === 'node')
        .map((item) => [item.key, { x: item.x, y: item.y }]),
    )
  }

  function beginLayoutEditing() {
    const basePositions = {
      ...savedLayoutPositions,
      ...collectVisibleFlowchartPositions(),
    }
    setDraftLayoutPositions(basePositions)
    setLayoutEditStartPositions(basePositions)
    setIsLayoutEditing(true)
    setViewMode('diagram')
    setLayoutNotice('Đang chỉnh bố cục - cầm nút ⋮⋮ trên node để kéo, bấm Lưu để giữ lại.')
  }

  function saveLayoutEditing() {
    const cleaned = Object.fromEntries(
      Object.entries(draftLayoutPositions)
        .map(([key, position]) => [key, normalizeFlowchartNodePosition(position)])
        .filter((entry): entry is [string, FlowchartNodePosition] => Boolean(entry[1])),
    )
    writeFlowchartLayoutToStorage(project.id, cleaned)
    setSavedLayoutPositions(cleaned)
    setDraftLayoutPositions(cleaned)
    setLayoutEditStartPositions({})
    setIsLayoutEditing(false)
    setLayoutNotice('Đã lưu bố cục Flowchart.')
  }

  function cancelLayoutEditing() {
    setDraftLayoutPositions(layoutEditStartPositions)
    setIsLayoutEditing(false)
    setDraggingLayoutNodeKey(null)
    nodeDragSessionRef.current = null
    setLayoutNotice('Đã hủy thay đổi bố cục.')
  }

  function resetAutoLayout() {
    if (typeof window !== 'undefined' && !window.confirm('Xóa bố cục đã sắp xếp và quay về bố cục tự động?')) return
    removeFlowchartLayoutFromStorage(project.id)
    setSavedLayoutPositions({})
    setDraftLayoutPositions({})
    setLayoutEditStartPositions({})
    setIsLayoutEditing(false)
    setDraggingLayoutNodeKey(null)
    nodeDragSessionRef.current = null
    setLayoutNotice('Đã reset về bố cục tự động.')
  }

  function alignSelectedBranch() {
    const autoLayout = buildFlowchartTreeLayout({
      project,
      visibleWorkstreams,
      collapsedIds,
      selectedNode,
      nodePositions: {},
      draggingNodeKey: null,
    })
    const autoPositions = Object.fromEntries(
      autoLayout.items
        .filter((item): item is FlowchartLayoutNodeItem => item.kind === 'node')
        .map((item) => [item.key, { x: item.x, y: item.y }]),
    )
    const next = { ...draftLayoutPositions }

    if (selectedNode.kind === 'workstream' && selectedNode.workstream) {
      for (const subtask of selectedNode.workstream.subtasks) {
        const key = flowchartNodeId('subtask', subtask.id)
        if (autoPositions[key]) next[key] = autoPositions[key]
      }
      setDraftLayoutPositions(next)
      setLayoutNotice(`Đã căn lại nhánh ${selectedNode.workstream.title}.`)
      return
    }

    if (selectedNode.kind === 'project') {
      const projectKey = flowchartNodeId('project', project.id)
      if (autoPositions[projectKey]) next[projectKey] = autoPositions[projectKey]
      for (const workstream of visibleWorkstreams) {
        const key = flowchartNodeId('workstream', workstream.id)
        if (autoPositions[key]) next[key] = autoPositions[key]
      }
      setDraftLayoutPositions(next)
      setLayoutNotice('Đã căn lại tầng Project và đầu việc lớn.')
      return
    }

    setLayoutNotice('Chọn Project hoặc một đầu việc lớn để căn lại nhánh.')
  }

  function openSelectedBranch() {
    if (selectedNode.kind === 'workstream' && selectedNode.workstream) {
      const selectedWorkstreamId = flowchartNodeId('workstream', selectedNode.workstream.id)
      setCollapsedIds(new Set(collapseIds.filter((id) => id !== selectedWorkstreamId)))
      return
    }
    if (selectedNode.kind === 'subtask' && selectedNode.workstream) {
      const selectedWorkstreamId = flowchartNodeId('workstream', selectedNode.workstream.id)
      const selectedSubtaskId = selectedNode.subtask ? flowchartNodeId('subtask', selectedNode.subtask.id) : ''
      setCollapsedIds(new Set(collapseIds.filter((id) => id !== selectedWorkstreamId && id !== selectedSubtaskId)))
    }
  }

  function collapseToWorkstreams() {
    setCollapsedIds(new Set(collapseIds))
  }

  function expandVisibleBranches() {
    setCollapsedIds(new Set(subtaskCollapseIds))
  }

  function beginNodeLayoutDrag(event: React.PointerEvent<HTMLElement>, item: FlowchartLayoutNodeItem) {
    if (!isLayoutEditing || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    ignoreNextFlowchartClickRef.current = false
    const fallbackPosition = normalizeFlowchartNodePosition(draftLayoutPositions[item.key]) ?? { x: item.x, y: item.y }
    nodeDragSessionRef.current = {
      pointerId: event.pointerId,
      key: item.key,
      startX: event.clientX,
      startY: event.clientY,
      startPositions: draftLayoutPositions,
      fallbackPosition,
      moved: false,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is best-effort; window listeners still keep dragging stable.
    }
    setDraggingLayoutNodeKey(item.key)
  }

  function beginCanvasPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    if (isFlowchartPanBlocked(event.target)) return
    event.preventDefault()
    panSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pan,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Best-effort only; window listeners handle the pan after the pointer leaves.
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
    setFlowchartZoom(getNextFlowchartZoom(zoom, event.deltaY > 0 ? -1 : 1), origin)
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

        for (const stepGroup of getFlowchartStepGroups(subtask, getVisibleFlowchartSteps(subtask, filter, projectFilters))) {
          const stepGroupNode: FlowchartNode = { kind: 'stepGroup', project, workstream, subtask, stepGroup }
          if (nodeKey === getFlowchartNodeKey(stepGroupNode)) {
            selectFlowchartNode(stepGroupNode)
            return
          }
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
    if (ignoreNextFlowchartClickRef.current) {
      ignoreNextFlowchartClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!(event.target instanceof HTMLElement)) return
    if (event.target.closest('[data-flowchart-drag-handle]')) return
    const nodeElement = event.target.closest('[data-flowchart-node-key]') as HTMLElement | null
    const nodeKey = nodeElement?.dataset.flowchartNodeKey
    if (!nodeKey) return
    event.stopPropagation()
    selectFlowchartNodeByKey(nodeKey)
  }

  function renderFlowchartLayoutItem(item: FlowchartLayoutItem) {
    if (item.kind === 'pill') {
      return (
        <div key={item.key} style={flowchartAbsoluteItemStyle(item)}>
          <div style={flowchartCollapsedPillStyle(item.accent)}>{item.label}</div>
        </div>
      )
    }

    return (
      <div
        key={item.key}
        data-flowchart-node-key={item.key}
        style={{
          ...flowchartAbsoluteItemStyle(item),
          cursor: undefined,
          zIndex: item.dragging ? 6 : item.active || item.pathActive ? 4 : 2,
          transform: item.dragging ? 'scale(1.02)' : undefined,
        }}
        aria-expanded={item.collapsibleId ? !item.collapsed : undefined}
        onDoubleClick={(event) => {
          event.stopPropagation()
          focusFlowchartNode(item.key)
        }}
      >
        {isLayoutEditing ? (
          <button
            type="button"
            data-flowchart-drag-handle="true"
            title="Kéo để sắp xếp"
            aria-label="Kéo node để sắp xếp bố cục"
            onPointerDown={(event) => beginNodeLayoutDrag(event, item)}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (ignoreNextFlowchartClickRef.current) ignoreNextFlowchartClickRef.current = false
            }}
            style={flowchartDragHandleStyle(item.accent, Boolean(item.dragging))}
          >
            ⋮⋮
          </button>
        ) : null}
        {item.collapsibleId ? (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              toggleCollapse(item.collapsibleId!)
            }}
            style={flowchartMindmapToggleStyle(item.accent)}
          >
            {item.collapsed ? '+' : '-'}
          </button>
        ) : null}
        <FlowchartNodeCard
          node={item.node}
          people={people}
          onClick={() => {
            if (ignoreNextFlowchartClickRef.current) {
              ignoreNextFlowchartClickRef.current = false
              return
            }
            selectFlowchartNode(item.node)
          }}
          variant={item.variant}
          accent={item.accent}
          active={item.active}
          pathActive={item.pathActive}
          layoutEditing={isLayoutEditing}
          dragging={item.dragging}
        />
      </div>
    )
  }

  function renderFlowchartLayoutControls() {
    return !isLayoutEditing ? (
      <button type="button" onClick={beginLayoutEditing} style={filterChipStyle(false)}>
        Chỉnh bố cục
      </button>
    ) : (
      <>
        <span style={flowchartEditingBadge}>Đang chỉnh bố cục</span>
        <button type="button" onClick={saveLayoutEditing} style={filterChipStyle(true, 'success')}>Lưu bố cục</button>
        <button type="button" onClick={cancelLayoutEditing} style={filterChipStyle(false)}>Hủy thay đổi</button>
        <button type="button" onClick={alignSelectedBranch} style={filterChipStyle(false)}>Căn lại nhánh</button>
      </>
    )
  }

  function renderFlowchartTreeView() {
    const projectNode: FlowchartNode = { kind: 'project', project }
    return (
      <div style={flowchartTreePanel}>
        <button type="button" onClick={() => selectFlowchartNode(projectNode)} style={flowchartTreeRowStyle(0, selectedNode.kind === 'project')}>
          <span style={flowchartTreeChevronSpacer} />
          <strong>{project.name}</strong>
          <span style={flowchartTreeMeta}>{visibleWorkstreams.length} đầu việc lớn · {filteredSubtaskTotal} đầu việc con · {filteredStepTotal} bước</span>
        </button>
        {visibleWorkstreams.length === 0 ? <div style={emptyInline}>Không có nhánh nào khớp bộ lọc hiện tại.</div> : null}
        {visibleWorkstreams.map((workstream, branchIndex) => {
          const accent = getFlowchartBranchColor(branchIndex)
          const workstreamNode: FlowchartNode = { kind: 'workstream', project, workstream }
          const workstreamKey = flowchartNodeId('workstream', workstream.id)
          const workstreamOpen = !collapsedIds.has(workstreamKey)
          const workstreamActive = selectedNode.workstream?.id === workstream.id
          return (
            <div key={workstream.id} style={flowchartTreeBranch}>
              <button type="button" onClick={() => selectFlowchartNode(workstreamNode)} style={flowchartTreeRowStyle(1, workstreamActive, accent)}>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleCollapse(workstreamKey)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      toggleCollapse(workstreamKey)
                    }
                  }}
                  style={flowchartTreeChevron}
                  aria-label={workstreamOpen ? 'Thu gọn đầu việc lớn' : 'Mở đầu việc lớn'}
                >
                  {workstreamOpen ? '▾' : '▸'}
                </span>
                <strong>{workstream.title}</strong>
                <span style={flowchartTreeMeta}>{workstream.subtasks.length} con · {getWorkstreamProgress(workstream)}% · {STATUS_META[workstream.status].label}</span>
              </button>
              {workstreamOpen ? (
                <div style={flowchartTreeChildren}>
                  {workstream.subtasks.length === 0 ? <div style={flowchartTreeEmpty}>Chưa có đầu việc con.</div> : null}
                  {workstream.subtasks.map((subtask) => {
                    const subtaskNode: FlowchartNode = { kind: 'subtask', project, workstream, subtask }
                    const subtaskKey = flowchartNodeId('subtask', subtask.id)
                    const subtaskOpen = !collapsedIds.has(subtaskKey)
                    const subtaskActive = selectedNode.subtask?.id === subtask.id
                    const visibleSteps = getVisibleFlowchartSteps(subtask, filter, projectFilters)
                    return (
                      <div key={subtask.id} style={flowchartTreeBranch}>
                        <button type="button" onClick={() => selectFlowchartNode(subtaskNode)} style={flowchartTreeRowStyle(2, subtaskActive, accent)}>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleCollapse(subtaskKey)
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                event.stopPropagation()
                                toggleCollapse(subtaskKey)
                              }
                            }}
                            style={flowchartTreeChevron}
                            aria-label={subtaskOpen ? 'Thu gọn bước' : 'Mở bước'}
                          >
                            {subtaskOpen ? '▾' : '▸'}
                          </span>
                          <strong>{subtask.title}</strong>
                          <span style={flowchartTreeMeta}>{visibleSteps.length} bước · {getSubtaskProgress(subtask)}% · {STATUS_META[subtask.status].label}</span>
                        </button>
                        {subtaskOpen ? (
                          <div style={flowchartTreeChildren}>
                            {visibleSteps.length === 0 ? <div style={flowchartTreeEmpty}>Chưa có bước khớp bộ lọc.</div> : null}
                            {visibleSteps.map((step) => {
                              const stepNode: FlowchartNode = { kind: 'step', project, workstream, subtask, step }
                              const stepActive = selectedNode.step?.id === step.id
                              return (
                                <button key={step.id} type="button" onClick={() => selectFlowchartNode(stepNode)} style={flowchartTreeRowStyle(3, stepActive, accent)}>
                                  <span style={flowchartTreeChevronSpacer} />
                                  <span>{step.title}</span>
                                  <span style={flowchartTreeMeta}>{STATUS_META[step.status].label}{step.dueDate ? ` · ${toFullDate(step.dueDate)}` : ''}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    )
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
            <span style={flowchartFullscreenMeta}>{permissionLine}</span>
            <span style={flowchartFullscreenMeta}>{renderLine}</span>
          </div>
          <div style={flowchartFullscreenToolGroup}>
            <button type="button" onClick={() => setViewMode('diagram')} style={filterChipStyle(viewMode === 'diagram')}>
              Sơ đồ
            </button>
            <button type="button" onClick={() => setViewMode('tree')} style={filterChipStyle(viewMode === 'tree')}>
              Dạng cây
            </button>
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
            <button type="button" onClick={collapseToWorkstreams} style={filterChipStyle(false)}>
              Thu gọn tất cả
            </button>
            <button type="button" onClick={openSelectedBranch} style={filterChipStyle(false)}>
              Mở nhánh đang chọn
            </button>
            <button type="button" onClick={expandVisibleBranches} style={filterChipStyle(false)}>
              Mở rộng tất cả
            </button>
            <button type="button" aria-label="Thu nhỏ Flowchart" onClick={() => setFlowchartZoom(getNextFlowchartZoom(zoom, -1))} style={flowchartIconButton}>-</button>
            <span style={flowchartZoomValue}>{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Phóng to Flowchart" onClick={() => setFlowchartZoom(getNextFlowchartZoom(zoom, 1))} style={flowchartIconButton}>+</button>
            <button type="button" onClick={fitFlowchartView} style={filterChipStyle(false)}>Fit view</button>
            <button type="button" onClick={() => setDetailVisible((value) => !value)} style={filterChipStyle(false)}>
              {detailVisible ? 'Ẩn chi tiết' : 'Hiện chi tiết'}
            </button>
              {hasSavedLayout && !isLayoutEditing ? <span style={flowchartSavedLayoutBadge}>Layout đã lưu</span> : null}
            {renderFlowchartLayoutControls()}
            <button type="button" onClick={resetAutoLayout} style={filterChipStyle(false, 'warning')}>Reset tự động</button>
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
              <button type="button" aria-label="Thu nhỏ Flowchart" onClick={() => setFlowchartZoom(getNextFlowchartZoom(zoom, -1))} style={flowchartIconButton}>-</button>
              <span style={flowchartZoomValue}>{Math.round(zoom * 100)}%</span>
              <button type="button" aria-label="Phóng to Flowchart" onClick={() => setFlowchartZoom(getNextFlowchartZoom(zoom, 1))} style={flowchartIconButton}>+</button>
              <button type="button" onClick={fitFlowchartView} style={filterChipStyle(false)}>Fit view</button>
              <button type="button" onClick={() => setIsFullscreen(true)} style={flowchartFullscreenButton}>
                <i className="ti ti-maximize" />
                Mở full màn
              </button>
            </div>
          </div>

          <div style={flowchartToolbar}>
            <div style={flowchartControls}>
              <button type="button" onClick={() => setViewMode('diagram')} style={filterChipStyle(viewMode === 'diagram')}>
                Sơ đồ
              </button>
              <button type="button" onClick={() => setViewMode('tree')} style={filterChipStyle(viewMode === 'tree')}>
                Dạng cây
              </button>
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
              <button type="button" onClick={collapseToWorkstreams} style={filterChipStyle(false)}>
                Thu gọn tất cả
              </button>
              <button type="button" onClick={openSelectedBranch} style={filterChipStyle(false)}>
                Mở nhánh đang chọn
              </button>
              <button type="button" onClick={expandVisibleBranches} style={filterChipStyle(false)}>
                Mở rộng tất cả
              </button>
              {hasSavedLayout && !isLayoutEditing ? <span style={flowchartSavedLayoutBadge}>Layout đã lưu</span> : null}
              {renderFlowchartLayoutControls()}
              <button type="button" onClick={resetAutoLayout} style={filterChipStyle(false, 'warning')}>
                Reset tự động
              </button>
            </div>
          </div>

          <div style={flowchartStatsRow}>
            <span>{filter === 'all' ? 'Tất cả dữ liệu' : 'Đang lọc dữ liệu'}</span>
            <span>1 dự án</span>
            <span>{visibleWorkstreams.length}/{project.workstreams.length} đầu việc lớn</span>
            <span>{visibleSubtaskCount}/{allSubtasks.length} đầu việc con</span>
            <span>{filteredStepTotal}/{allSteps.length} bước trong panel</span>
          </div>
          <div style={flowchartInsightBox}>
            {layoutNotice ? <span>{layoutNotice}</span> : null}
            <span>{permissionLine}</span>
            <span>{filterLine}</span>
            <span>{branchLine}</span>
            <span>{renderLine}</span>
            <span>{collapseLine}</span>
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

          {viewMode === 'tree' ? (
            renderFlowchartTreeView()
          ) : (
          <div
            ref={flowchartScrollRef}
            style={canvasScrollStyle}
            onPointerDown={beginCanvasPan}
            onWheel={handleCanvasWheel}
          >
            <div style={zoomLayerStyle} data-flowchart-zoom-layer="true">
              <div ref={flowchartBoardRef} style={flowchartBoardStyle(flowchartLayout.width, flowchartLayout.height)} onClickCapture={handleFlowchartBoardSelect}>
                <svg style={flowchartConnectorOverlay} viewBox={`0 0 ${flowchartLayout.width} ${flowchartLayout.height}`} aria-hidden="true">
                  <defs>
                    <marker id="flowchart-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                    </marker>
                  </defs>
                  {flowchartLayout.connectors.map((connector) => (
                    <path
                      key={connector.id}
                      d={connector.path}
                      fill="none"
                      stroke={connector.active ? connector.accent : flowchartColorAlpha(connector.accent, 0.58)}
                      strokeWidth={connector.active ? 3.8 : 2.4}
                      strokeLinecap="round"
                      markerEnd="url(#flowchart-arrowhead)"
                      style={{ filter: connector.active ? `drop-shadow(0 0 10px ${flowchartColorAlpha(connector.accent, 0.22)})` : undefined }}
                    />
                  ))}
                </svg>
                {flowchartLayout.items.map(renderFlowchartLayoutItem)}
              </div>
            </div>
            {showFlowchartGuide ? (
              <div style={flowchartGuideBox} onPointerDown={(event) => event.stopPropagation()}>
                <div style={flowchartGuideTitle}>Thao tác Flowchart</div>
              {guideSteps.map((step) => <span key={step}>{step}</span>)}
              <button type="button" onClick={hideFlowchartGuide} style={flowchartGuideDismissButton}>Ẩn hướng dẫn</button>
              </div>
            ) : null}
            {showFlowchartMiniMap ? (
              <div
                style={{ ...flowchartMiniMap, width: miniMapWidth, height: miniMapHeight }}
                onPointerDown={handleMiniMapPointerDown}
                aria-label="Mini map Flowchart"
              >
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setShowFlowchartMiniMap(false)
                  }}
                  style={flowchartMiniMapToggleButton}
                >
                  Ẩn bản đồ nhỏ
                </button>
              {flowchartLayout.connectors.map((connector) => (
                <svg key={connector.id} style={flowchartMiniMapConnectorOverlay} viewBox={`0 0 ${flowchartLayout.width} ${flowchartLayout.height}`} aria-hidden="true">
                  <path
                    d={connector.path}
                    fill="none"
                    stroke={connector.active ? connector.accent : 'rgba(157,184,199,.28)'}
                    strokeWidth={connector.active ? 10 : 6}
                    strokeLinecap="round"
                  />
                </svg>
              ))}
              {flowchartLayout.items.map((item) => (
                <span
                  key={item.key}
                  style={{
                    ...flowchartMiniMapNode,
                    left: item.x * miniMapScale,
                    top: item.y * miniMapScale,
                    width: Math.max(4, item.width * miniMapScale),
                    height: Math.max(3, item.height * miniMapScale),
                    borderColor: item.kind === 'node' && item.active ? item.accent : 'rgba(255,255,255,.36)',
                    background: item.kind === 'node' ? flowchartColorAlpha(item.accent, item.active ? 0.72 : 0.48) : 'rgba(255,255,255,.28)',
                  }}
                />
              ))}
              <span
                style={{
                  ...flowchartMiniMapViewport,
                  left: miniMapViewport.left,
                  top: miniMapViewport.top,
                  width: miniMapViewport.width,
                  height: miniMapViewport.height,
                }}
              />
              </div>
            ) : (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setShowFlowchartMiniMap(true)
                }}
                style={flowchartMiniMapShowButton}
              >
                Hiện bản đồ nhỏ
              </button>
            )}
          </div>
          )}
        </div>

        {!isFullscreen || detailVisible ? (
          <FlowchartDetailDrawer
            node={selectedNode}
            people={people}
            workspaceId={workspaceId}
            fullscreen={isFullscreen}
            onClose={isFullscreen ? () => setDetailVisible(false) : () => setSelectedNode({ kind: 'project', project })}
            onFocusNode={() => focusFlowchartNode(getFlowchartNodeKey(selectedNode))}
            onSaveSubtaskReport={onSaveSubtaskReport}
            onOpenSubtask={onOpenSubtask}
            onEditNode={onEditNode}
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
  accent = FLOWCHART_PROJECT_COLOR,
  active = false,
  pathActive = false,
  variant = 'default',
  layoutEditing = false,
  dragging = false,
}: {
  node: FlowchartNode
  people: Record<string, CommandCenterPersonRow>
  onClick: () => void
  accent?: string
  active?: boolean
  pathActive?: boolean
  variant?: 'project' | 'default' | 'group' | 'step'
  layoutEditing?: boolean
  dragging?: boolean
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
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        handleSelect()
      }}
      style={{
        ...flowchartNodeStyle(signal.tone, variant, active, pathActive, accent),
        cursor: 'pointer',
        outline: layoutEditing && !dragging ? '1px dashed rgba(218,223,33,.2)' : undefined,
        outlineOffset: layoutEditing && !dragging ? -5 : undefined,
        transform: dragging ? 'scale(1.015)' : undefined,
      }}
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
  workspaceId,
  fullscreen,
  onClose,
  onFocusNode,
  onSaveSubtaskReport,
  onOpenSubtask,
  onEditNode,
}: {
  node: FlowchartNode | null
  people: Record<string, CommandCenterPersonRow>
  workspaceId?: string
  fullscreen?: boolean
  onClose: () => void
  onFocusNode: () => void
  onSaveSubtaskReport: (subtask: SubtaskItem, value: string) => Promise<boolean>
  onOpenSubtask: (subtaskId: string) => void
  onEditNode: (target: EditTarget) => void
}) {
  const [workflowOpenNodeKey, setWorkflowOpenNodeKey] = React.useState<string | null>(null)
  const nodeKey = node ? getFlowchartNodeKey(node) : null
  const workflowOpen = Boolean(nodeKey && workflowOpenNodeKey === nodeKey)

  if (!node) return null

  const title = getFlowchartNodeTitle(node)
  const owner = getFlowchartNodeOwner(node)
  const supporterNames = node.subtask?.supporterIds.map((id) => people[id]?.full_name).filter(Boolean).join(', ')
  const deadline = getFlowchartNodeDeadline(node)
  const status = getFlowchartNodeStatus(node)
  const progress = getFlowchartNodeProgress(node)
  const description = getFlowchartNodeDescription(node)
  const subtask = node.subtask

  const workflowPanelSummary = getFlowchartWorkflowPanelSummary(node)
  const blockers = subtask ? getCompletionBlockers(subtask) : []
  const path = getFlowchartBreadcrumb(node)
  const fileGroups = getSubtaskFileGroups(node.subtask)
  const sharedFileItems = node.kind === 'subtask' ? fileGroups.shared : []

  return (
    <aside style={fullscreen ? { ...flowchartDetailPanel, ...flowchartDetailPanelFullscreen } : flowchartDetailPanel}>
      <div style={flowchartPanelHeader}>
        <div style={{ minWidth: 0 }}>
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

      {node.kind === 'project' ? (
        <PlanDocumentsPanel
          key={`flowchart-project-plan-${node.project.id}`}
          targetType="PROJECT"
          targetId={node.project.sourceProjectId ?? node.project.id}
          title="Kế hoạch tổng dự án"
        />
      ) : null}
      {node.kind === 'workstream' && node.workstream ? (
        <PlanDocumentsPanel
          key={`flowchart-workstream-plan-${node.workstream.id}`}
          targetType="WORKSTREAM"
          targetId={node.workstream.id}
          title="Plan đầu việc lớn"
        />
      ) : null}
      {node.kind === 'subtask' && node.workstream ? (
        <PlanDocumentsPanel
          key={`flowchart-subtask-plan-${node.subtask?.id ?? node.workstream.id}`}
          targetType="WORKSTREAM"
          targetId={node.workstream.id}
          title="Plan từ đầu việc lớn"
          readOnly
        />
      ) : null}

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

      <section style={flowchartWorkflowAccordionCard}>
        <button
          type="button"
          onClick={() => setWorkflowOpenNodeKey(workflowOpen ? null : nodeKey)}
          aria-expanded={workflowOpen}
          style={flowchartWorkflowAccordionHeader}
        >
          <span style={flowchartWorkflowAccordionHeading}>
            <strong style={flowchartWorkflowAccordionTitleStyle}>Quy trình thực hiện</strong>
            <span style={mutedMetaStyle}>{workflowPanelSummary}</span>
          </span>
          <i className="ti ti-chevron-down" style={flowchartWorkflowAccordionChevron(workflowOpen)} />
        </button>
        {workflowOpen ? (
          <div style={flowchartWorkflowAccordionBody}>
            <FlowchartWorkflowSummary key={nodeKey} node={node} people={people} workspaceId={workspaceId} />
            {blockers.length ? <div style={warningBanner}>Chưa thể hoàn thành: {getCompactBlockerText(subtask as SubtaskItem)}</div> : null}
          </div>
        ) : null}
      </section>

      {sharedFileItems.length ? (
        <section style={flowchartPanelCard}>
          <div style={sectionTitle}>Bàn giao chung</div>
          <div style={mutedMetaStyle}>Tài liệu được gắn ở cấp đầu việc con, chưa gắn riêng với bước.</div>
          <EvidenceFileList
            files={sharedFileItems}
            people={people}
            workspaceId={workspaceId}
            emptyText="Chưa có bàn giao chung."
          />
        </section>
      ) : null}
      <section style={flowchartPanelCard}>
        <div style={sectionTitle}>Deadline</div>
        <div style={deadline && isOverdue(deadline, status) ? flowchartDeadlineDanger : mutedMetaStyle}>
          {deadline ? `${formatDeadlineLabel(deadline, status)} · ${toFullDate(deadline)}` : 'Không deadline'}
        </div>
      </section>

      <div style={flowchartPanelActions}>
        <button type="button" onClick={onClose} style={ghostBtnStyle}>Đóng</button>
        <button type="button" onClick={onFocusNode} style={ghostBtnStyle}>Focus node</button>
        {node.kind !== 'stepGroup' ? (
          <GhostButton icon="ti-pencil" onClick={() => onEditNode(flowchartNodeToEditTarget(node))}>Sửa</GhostButton>
        ) : null}
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

function getFlowchartWorkflowPanelSummary(node: FlowchartNode) {
  if (node.kind === 'project') {
    const subtaskCount = node.project.workstreams.flatMap((workstream) => workstream.subtasks).length
    return `${node.project.workstreams.length} đầu việc lớn · ${subtaskCount} đầu việc con`
  }
  if (node.kind === 'workstream' && node.workstream) {
    const subtasks = node.workstream.subtasks
    const stepCount = subtasks.reduce((total, subtask) => total + subtask.steps.length, 0)
    const fileCount = subtasks.reduce((total, subtask) => total + subtask.attachments.length, 0)
    return `${subtasks.length} đầu việc con · ${stepCount} bước · ${fileCount} tài liệu`
  }
  if (node.kind === 'stepGroup' && node.stepGroup) {
    return `${node.stepGroup.steps.length} bước trong nhóm`
  }
  if (node.kind === 'subtask' && node.subtask) {
    return `${node.subtask.steps.length} bước · ${node.subtask.attachments.length} tài liệu`
  }
  if (node.step) {
    const files = getSubtaskFileGroups(node.subtask).byStepId[node.step.id] ?? []
    return `1 bước · ${files.length} tài liệu`
  }
  return 'Bấm để xem chi tiết quy trình'
}

interface FlowchartWorkflowStepEntry {
  subtask: SubtaskItem
  step: StepItem
  stepNumber: number
  contextLabel: string
}

function getFlowchartWorkflowStepEntries(node: FlowchartNode): FlowchartWorkflowStepEntry[] {
  function collectSubtaskSteps(subtask: SubtaskItem, workstreamTitle?: string) {
    return sortStepsForFlowchart(subtask.steps).map((step, index) => ({
      subtask,
      step,
      stepNumber: index + 1,
      contextLabel: workstreamTitle ? `${workstreamTitle} → ${subtask.title}` : subtask.title,
    }))
  }

  if (node.kind === 'project') {
    return node.project.workstreams.flatMap((workstream) =>
      workstream.subtasks.flatMap((subtask) => collectSubtaskSteps(subtask, workstream.title)),
    )
  }
  if (node.kind === 'workstream' && node.workstream) {
    return node.workstream.subtasks.flatMap((subtask) => collectSubtaskSteps(subtask, node.workstream?.title))
  }
  if (node.kind === 'stepGroup' && node.stepGroup && node.subtask) {
    return node.stepGroup.steps.map((step) => ({
      subtask: node.subtask as SubtaskItem,
      step,
      stepNumber: getSubtaskStepNumber(node.subtask, step.id) ?? 1,
      contextLabel: node.subtask?.title ?? '',
    }))
  }
  if (node.kind === 'subtask' && node.subtask) {
    return collectSubtaskSteps(node.subtask)
  }
  if (node.step && node.subtask) {
    return [{
      subtask: node.subtask,
      step: node.step,
      stepNumber: getSubtaskStepNumber(node.subtask, node.step.id) ?? 1,
      contextLabel: node.subtask.title,
    }]
  }
  return []
}

function FlowchartWorkflowSummary({
  node,
  people,
  workspaceId,
}: {
  node: FlowchartNode
  people: Record<string, CommandCenterPersonRow>
  workspaceId?: string
}) {
  const [expanded, setExpanded] = React.useState(false)
  const entries = React.useMemo(() => getFlowchartWorkflowStepEntries(node), [node])
  const fileGroupsBySubtaskId = React.useMemo(() => {
    const groups = new Map<string, SubtaskFileGroups>()
    for (const entry of entries) {
      if (!groups.has(entry.subtask.id)) groups.set(entry.subtask.id, getSubtaskFileGroups(entry.subtask))
    }
    return groups
  }, [entries])
  const visibleEntries = expanded ? entries : entries.slice(0, FLOWCHART_WORKFLOW_STEP_PREVIEW_LIMIT)

  if (!entries.length) {
    return <div style={mutedMetaStyle}>Cấp này chưa có bước trong quy trình.</div>
  }

  return (
    <div style={flowchartStepMiniList}>
      {visibleEntries.map((entry) => (
        <FlowchartWorkflowStepItem
          key={`${entry.subtask.id}-${entry.step.id}`}
          step={entry.step}
          stepNumber={entry.stepNumber}
          contextLabel={entry.contextLabel}
          files={fileGroupsBySubtaskId.get(entry.subtask.id)?.byStepId[entry.step.id] ?? []}
          people={people}
          workspaceId={workspaceId}
        />
      ))}
      {entries.length > FLOWCHART_WORKFLOW_STEP_PREVIEW_LIMIT ? (
        <button type="button" onClick={() => setExpanded((current) => !current)} style={stepEvidenceToggleStyle}>
          {expanded ? 'Thu gọn danh sách bước' : `Xem tất cả ${entries.length} bước`}
        </button>
      ) : null}
    </div>
  )
}

function FlowchartWorkflowStepItem({
  step,
  stepNumber,
  contextLabel,
  files,
  people,
  workspaceId,
}: {
  step: StepItem
  stepNumber?: number
  contextLabel?: string
  files: AttachmentItem[]
  people: Record<string, CommandCenterPersonRow>
  workspaceId?: string
}) {
  const ownerName = step.ownerId ? people[step.ownerId]?.full_name ?? 'Chưa gắn người' : 'Chưa gắn người'

  return (
    <div style={flowchartWorkflowStepCard}>
      <div style={flowchartWorkflowStepHeader}>
        <span style={flowchartWorkflowStepTitle}>{stepNumber ? `Bước ${stepNumber} · ` : ''}{step.title}</span>
        <span style={statusChipStyle(STATUS_META[step.status].bg, STATUS_META[step.status].color)}>{STATUS_META[step.status].label}</span>
      </div>
      <div style={flowchartWorkflowStepMeta}>
        {contextLabel ? <span>{contextLabel}</span> : null}
        <span>Người phụ trách: <strong>{ownerName}</strong></span>
      </div>
      {step.description || step.note ? (
        <div style={flowchartWorkflowStepDescription}>{step.description || step.note}</div>
      ) : null}
      <StepEvidenceFiles
        files={files}
        people={people}
        workspaceId={workspaceId}
        emptyText="Chưa có file hoặc link cho bước này."
      />
    </div>
  )
}

function getSubtaskStepNumber(subtask: SubtaskItem | null | undefined, stepId: string) {
  const index = sortStepsForFlowchart(subtask?.steps ?? []).findIndex((step) => step.id === stepId)
  return index >= 0 ? index + 1 : undefined
}

function matchesWorkstreamProjectFilter(workstream: WorkstreamItem, filters: ProjectFilters, project: ProjectWorkspace) {
  const assigneeId = getAssigneeFilterId(filters)
  const directMatch =
    matchesStatusFilter(workstream.status, workstream.dueDate, filters.status) &&
    matchesDeadlineFilter(workstream.dueDate, workstream.status, filters.deadline) &&
    matchesSearchFilter([project.name, project.code, workstream.title, workstream.description], filters.search) &&
    (filters.quick !== 'unassigned' || !workstream.ownerId) &&
    (!assigneeId || workstream.ownerId === assigneeId)

  return directMatch || workstream.subtasks.some((subtask) => matchesProjectWorkFilter(subtask, filters, { project, workstream }))
}

function flowchartNodeId(kind: FlowchartNodeKind, id: string) {
  return `${kind}-${id}`
}

function getFlowchartBranchColor(index: number) {
  return FLOWCHART_BRANCH_COLORS[index % FLOWCHART_BRANCH_COLORS.length]
}

function flowchartColorAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '')
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function normalizeFlowchartNodePosition(position: FlowchartNodePosition | null | undefined): FlowchartNodePosition | null {
  if (!position) return null
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null
  return {
    x: Math.max(24, Math.round(position.x)),
    y: Math.max(24, Math.round(position.y)),
  }
}

function snapFlowchartPosition(value: number) {
  return Math.max(24, Math.round(value / FLOWCHART_SNAP_GRID) * FLOWCHART_SNAP_GRID)
}

function flowchartLayoutStorageKey(projectId: string) {
  return `flowchart.customLayout.${projectId}`
}

function flowchartViewModeStorageKey(projectId: string) {
  return `flowchart.viewMode.${projectId}`
}

function readFlowchartLayoutFromStorage(projectId: string): FlowchartNodePositions {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(flowchartLayoutStorageKey(projectId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { version?: number; nodes?: FlowchartNodePositions }
    if (parsed.version !== FLOWCHART_LAYOUT_VERSION || !parsed.nodes) return {}
    return Object.fromEntries(
      Object.entries(parsed.nodes)
        .map(([key, position]) => [key, normalizeFlowchartNodePosition(position)])
        .filter((entry): entry is [string, FlowchartNodePosition] => Boolean(entry[1])),
    )
  } catch {
    return {}
  }
}

function writeFlowchartLayoutToStorage(projectId: string, nodes: FlowchartNodePositions) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(flowchartLayoutStorageKey(projectId), JSON.stringify({
    version: FLOWCHART_LAYOUT_VERSION,
    updatedAt: new Date().toISOString(),
    nodes,
  }))
}

function removeFlowchartLayoutFromStorage(projectId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(flowchartLayoutStorageKey(projectId))
}

function flowchartOrthogonalConnectorPath(parent: FlowchartLayoutNodeItem, child: FlowchartLayoutNodeItem, index = 0) {
  const parentCenter = { x: parent.x + parent.width / 2, y: parent.y + parent.height / 2 }
  const childCenter = { x: child.x + child.width / 2, y: child.y + child.height / 2 }
  const childIsRight = childCenter.x >= parentCenter.x
  const start = {
    x: childIsRight ? parent.x + parent.width + FLOWCHART_CONNECTOR_NODE_GAP : parent.x - FLOWCHART_CONNECTOR_NODE_GAP,
    y: parentCenter.y,
  }
  const end = {
    x: childIsRight ? child.x - FLOWCHART_CONNECTOR_NODE_GAP : child.x + child.width + FLOWCHART_CONNECTOR_NODE_GAP,
    y: childCenter.y,
  }
  const direction = childIsRight ? 1 : -1
  const offset = ((index % 4) - 1.5) * 8
  const minBend = 70
  const midX = childIsRight
    ? Math.max(start.x + minBend, (start.x + end.x) / 2 + offset)
    : Math.min(start.x - minBend, (start.x + end.x) / 2 + offset)
  const startX = start.x + direction * Math.max(0, offset)
  const endX = end.x - direction * Math.max(0, offset)
  return `M ${startX} ${start.y} H ${midX} V ${end.y} H ${endX}`
}

function clampZoom(value: number) {
  const minZoom = FLOWCHART_ZOOM_LEVELS[0]
  return Math.min(FLOWCHART_MAX_ZOOM, Math.max(minZoom, Number(value.toFixed(2))))
}

function snapFlowchartZoom(value: number, mode: 'nearest' | 'floor' | 'ceil' = 'nearest') {
  const clamped = clampZoom(value)
  if (mode === 'floor') {
    for (let index = FLOWCHART_ZOOM_LEVELS.length - 1; index >= 0; index -= 1) {
      if (FLOWCHART_ZOOM_LEVELS[index] <= clamped + Number.EPSILON) return FLOWCHART_ZOOM_LEVELS[index]
    }
    return FLOWCHART_ZOOM_LEVELS[0]
  }
  if (mode === 'ceil') {
    return FLOWCHART_ZOOM_LEVELS.find((level) => level >= clamped - Number.EPSILON) ?? FLOWCHART_ZOOM_LEVELS[FLOWCHART_ZOOM_LEVELS.length - 1]
  }
  return FLOWCHART_ZOOM_LEVELS.reduce((closest, level) => (
    Math.abs(level - clamped) < Math.abs(closest - clamped) ? level : closest
  ), FLOWCHART_ZOOM_LEVELS[0])
}

function getNextFlowchartZoom(currentZoom: number, direction: -1 | 1) {
  const currentLevel = snapFlowchartZoom(currentZoom)
  const currentIndex = FLOWCHART_ZOOM_LEVELS.indexOf(currentLevel)
  const nextIndex = Math.max(0, Math.min(FLOWCHART_ZOOM_LEVELS.length - 1, currentIndex + direction))
  return FLOWCHART_ZOOM_LEVELS[nextIndex]
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

const FLOWCHART_STEP_PRIORITY_ORDER: Record<NonNullable<StepItem['priority']>, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

function sortStepsForFlowchart(steps: StepItem[]) {
  return [...steps].sort((left, right) => {
    const leftDeadline = !left.missingDueDate && left.dueDate ? left.dueDate : null
    const rightDeadline = !right.missingDueDate && right.dueDate ? right.dueDate : null
    if (leftDeadline && !rightDeadline) return -1
    if (!leftDeadline && rightDeadline) return 1
    if (leftDeadline && rightDeadline) {
      const deadlineOrder = leftDeadline.localeCompare(rightDeadline)
      if (deadlineOrder) return deadlineOrder
    }

    const priorityOrder = FLOWCHART_STEP_PRIORITY_ORDER[left.priority ?? 'MEDIUM']
      - FLOWCHART_STEP_PRIORITY_ORDER[right.priority ?? 'MEDIUM']
    if (priorityOrder) return priorityOrder

    const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : Number.MAX_SAFE_INTEGER
    const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : Number.MAX_SAFE_INTEGER
    if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt

    const sortOrder = (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
    return sortOrder || left.id.localeCompare(right.id)
  })
}

function getVisibleFlowchartSteps(subtask: SubtaskItem, filter: FlowchartFilter, projectFilters: ProjectFilters) {
  const subtaskMatches = matchesSubtaskFlowchartFilter(subtask, filter) && matchesProjectWorkFilter(subtask, projectFilters)
  if (subtaskMatches) return sortStepsForFlowchart(subtask.steps)
  return sortStepsForFlowchart(subtask.steps.filter((step) =>
    matchesStepFlowchartFilter(step, filter) &&
    matchesStepProjectFilter(step, projectFilters),
  ))
}

function getFlowchartStepGroups(subtask: SubtaskItem, steps: StepItem[]): FlowchartStepGroup[] {
  if (steps.length <= FLOWCHART_STEP_GROUP_THRESHOLD) return []

  const prefixGroups = new Map<string, FlowchartStepGroup>()
  const otherSteps: StepItem[] = []

  for (const step of steps) {
    const normalizedTitle = step.title.trim().toUpperCase()
    const groupTitle = normalizedTitle.startsWith('PAGE SKIN')
      ? 'PAGE SKIN'
      : normalizedTitle.startsWith('PAGE HAIR')
        ? 'PAGE HAIR'
        : ''

    if (!groupTitle) {
      otherSteps.push(step)
      continue
    }

    const id = `${subtask.id}:${groupTitle.toLowerCase().replace(/\s+/g, '-')}`
    const existing = prefixGroups.get(id)
    if (existing) existing.steps.push(step)
    else prefixGroups.set(id, { id, title: groupTitle, steps: [step] })
  }

  if (prefixGroups.size > 0) {
    const groups = Array.from(prefixGroups.values())
    if (otherSteps.length) groups.push({ id: `${subtask.id}:other`, title: 'Khác / Step mặc định', steps: otherSteps })
    return groups
  }

  const weekGroups = new Map<string, FlowchartStepGroup>()
  const withoutDate: StepItem[] = []

  for (const step of steps) {
    if (!step.dueDate) {
      withoutDate.push(step)
      continue
    }
    const day = new Date(`${step.dueDate}T00:00:00`)
    if (Number.isNaN(day.getTime())) {
      withoutDate.push(step)
      continue
    }
    const weekIndex = Math.max(1, Math.min(5, Math.ceil(day.getDate() / 7)))
    const title = `Tuần ${weekIndex}`
    const id = `${subtask.id}:week-${weekIndex}`
    const existing = weekGroups.get(id)
    if (existing) existing.steps.push(step)
    else weekGroups.set(id, { id, title, steps: [step] })
  }

  if (weekGroups.size > 1) {
    const groups = Array.from(weekGroups.values()).sort((a, b) => a.id.localeCompare(b.id))
    if (withoutDate.length) groups.push({ id: `${subtask.id}:other`, title: 'Khác', steps: withoutDate })
    return groups
  }

  return [{ id: `${subtask.id}:main-steps`, title: 'Các bước chính', steps }]
}

function getFlowchartRoleLabel(role: string | null | undefined) {
  const normalized = role?.trim().toUpperCase()
  if (normalized === 'ADMIN') return 'Quản trị hệ thống'
  if (normalized === 'CEO') return 'CEO'
  if (normalized === 'COO') return 'COO'
  if (normalized === 'DEPARTMENT_HEAD') return 'Trưởng bộ phận'
  if (normalized === 'EMPLOYEE') return 'Nhân viên'
  if (normalized === 'PROJECT_COORDINATOR') return 'Điều phối dự án'
  if (normalized === 'CEO_READONLY') return 'CEO chỉ xem'
  return 'quyền hiện tại'
}

function getFlowchartNodeKey(node: FlowchartNode) {
  if (node.kind === 'project') return flowchartNodeId('project', node.project.id)
  if (node.kind === 'workstream') return flowchartNodeId('workstream', node.workstream?.id ?? node.project.id)
  if (node.kind === 'subtask') return flowchartNodeId('subtask', node.subtask?.id ?? node.project.id)
  if (node.kind === 'stepGroup') return flowchartNodeId('stepGroup', node.stepGroup?.id ?? node.subtask?.id ?? node.project.id)
  return flowchartNodeId('step', node.step?.id ?? node.project.id)
}

function flowchartNodeToEditTarget(node: FlowchartNode): EditTarget {
  if (node.kind === 'project') return { kind: 'project', projectId: node.project.id }
  if (node.kind === 'workstream') return { kind: 'workstream', projectId: node.project.id, workstreamId: node.workstream?.id }
  if (node.kind === 'subtask') {
    return {
      kind: 'subtask',
      projectId: node.project.id,
      workstreamId: node.workstream?.id,
      subtaskId: node.subtask?.id,
    }
  }
  return {
    kind: 'step',
    projectId: node.project.id,
    workstreamId: node.workstream?.id,
    subtaskId: node.subtask?.id,
    stepId: node.step?.id,
  }
}

function isFlowchartWorkstreamPathActive(workstream: WorkstreamItem, selectedNode: FlowchartNode) {
  return selectedNode.workstream?.id === workstream.id
}

function isFlowchartSubtaskPathActive(subtask: SubtaskItem, selectedNode: FlowchartNode) {
  return selectedNode.subtask?.id === subtask.id
}

function getFlowchartNodeWarnings(node: FlowchartNode) {
  const warnings: string[] = []
  const deadline = getFlowchartNodeDeadline(node)
  const status = getFlowchartNodeStatus(node)
  if (!getFlowchartNodeOwner(node)) warnings.push('Chưa gắn')
  if (deadline && isOverdue(deadline, status)) warnings.push('Quá hạn')
  if (node.stepGroup) {
    const missingDeliverables = node.stepGroup.steps.filter((step) => step.requiresDeliverable && !step.deliverableIsValid).length
    if (missingDeliverables > 0) warnings.push(`${missingDeliverables} bước thiếu bàn giao`)
  } else if (node.subtask) {
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
    node.stepGroup ? { kind: 'stepGroup', title: node.stepGroup.title } : null,
    node.step ? { kind: 'step', title: node.step.title } : null,
  ].filter(Boolean) as Array<{ kind: FlowchartNodeKind; title: string }>
}

function getFlowchartNodeTitle(node: FlowchartNode) {
  if (node.kind === 'stepGroup') return `${node.stepGroup?.title ?? 'Nhóm bước'} · ${node.stepGroup?.steps.length ?? 0} bước`
  if (node.kind === 'project') return node.project.name
  if (node.kind === 'workstream') return node.workstream?.title ?? 'Đầu việc lớn'
  if (node.kind === 'subtask') return node.subtask?.title ?? 'Đầu việc con'
  return node.step?.title ?? 'Bước'
}

function getFlowchartNodeOwner(node: FlowchartNode) {
  if (node.kind === 'stepGroup' && node.stepGroup) return getFlowchartStepGroupOwner(node.stepGroup) ?? node.subtask?.ownerId ?? null
  if (node.kind === 'project') return node.project.ownerId
  if (node.kind === 'workstream') return node.workstream?.ownerId ?? null
  if (node.kind === 'subtask') return node.subtask?.ownerId ?? null
  return node.step?.ownerId ?? node.subtask?.ownerId ?? null
}

function getFlowchartNodeDeadline(node: FlowchartNode) {
  if (node.kind === 'stepGroup' && node.stepGroup) return getFlowchartStepGroupDeadline(node.stepGroup)
  if (node.kind === 'project') return node.project.dueDate
  if (node.kind === 'workstream') return node.workstream?.dueDate ?? ''
  if (node.kind === 'subtask') return node.subtask?.dueDate ?? ''
  return node.step?.dueDate ?? ''
}

function getFlowchartNodeStatus(node: FlowchartNode): TaskStatus {
  if (node.kind === 'stepGroup' && node.stepGroup) return getFlowchartStepGroupStatus(node.stepGroup)
  if (node.kind === 'project') return progressStatus(getProjectProgress(node.project), node.project.dueDate)
  if (node.kind === 'workstream' && node.workstream) return progressStatus(getWorkstreamProgress(node.workstream), node.workstream.dueDate, node.workstream.status)
  if (node.kind === 'subtask') return node.subtask?.status ?? 'NOT_STARTED'
  return node.step?.status ?? 'NOT_STARTED'
}

function getFlowchartNodeProgress(node: FlowchartNode) {
  if (node.kind === 'stepGroup' && node.stepGroup) return getFlowchartStepGroupProgress(node.stepGroup)
  if (node.kind === 'project') return getProjectProgress(node.project)
  if (node.kind === 'workstream' && node.workstream) return getWorkstreamProgress(node.workstream)
  if (node.kind === 'subtask' && node.subtask) return getSubtaskProgress(node.subtask)
  return node.step?.status === 'COMPLETED' ? 100 : 0
}

function getFlowchartNodeDescription(node: FlowchartNode) {
  if (node.kind === 'stepGroup' && node.stepGroup) {
    const completed = node.stepGroup.steps.filter((step) => step.status === 'COMPLETED').length
    return `Nhóm ${node.stepGroup.title} có ${node.stepGroup.steps.length} bước · ${completed} bước hoàn thành.`
  }
  if (node.kind === 'project') return node.project.description
  if (node.kind === 'workstream') return `Đầu việc lớn gồm ${node.workstream?.subtasks.length ?? 0} đầu việc con trong dự án ${node.project.name}.`
  if (node.kind === 'subtask') return node.subtask?.reportText || 'Chưa có mô tả hoặc cập nhật kết quả cho đầu việc con này.'
  return node.step?.description || node.step?.note || ''
}

function getFlowchartKindLabel(kind: FlowchartNodeKind) {
  if (kind === 'stepGroup') return 'Nhóm bước'
  if (kind === 'project') return 'Dự án'
  if (kind === 'workstream') return 'Đầu việc lớn'
  if (kind === 'subtask') return 'Đầu việc con'
  return 'Bước'
}

function getFlowchartStepGroupOwner(group: FlowchartStepGroup) {
  const owners = group.steps.map((step) => step.ownerId).filter(Boolean) as string[]
  if (!owners.length) return null
  const firstOwner = owners[0]
  return owners.every((ownerId) => ownerId === firstOwner) ? firstOwner : firstOwner
}

function getFlowchartStepGroupDeadline(group: FlowchartStepGroup) {
  const dates = group.steps.map((step) => step.dueDate).filter(Boolean).sort()
  return dates[dates.length - 1] ?? ''
}

function getFlowchartStepGroupStatus(group: FlowchartStepGroup): TaskStatus {
  const statuses = group.steps.map((step) => step.status)
  if (!statuses.length) return 'NOT_STARTED'
  if (statuses.every((status) => status === 'COMPLETED')) return 'COMPLETED'
  if (statuses.some((status) => status === 'BLOCKED')) return 'BLOCKED'
  if (statuses.some((status) => status === 'REVISION_REQUIRED')) return 'REVISION_REQUIRED'
  if (statuses.some((status) => status === 'PENDING_APPROVAL')) return 'PENDING_APPROVAL'
  if (statuses.some((status) => status === 'IN_PROGRESS')) return 'IN_PROGRESS'
  if (statuses.some((status) => status === 'WAITING')) return 'WAITING'
  if (statuses.every((status) => status === 'CANCELLED')) return 'CANCELLED'
  return 'NOT_STARTED'
}

function getFlowchartStepGroupProgress(group: FlowchartStepGroup) {
  if (!group.steps.length) return 0
  return Math.round((group.steps.filter((step) => step.status === 'COMPLETED').length / group.steps.length) * 100)
}

function getFlowchartSignal(status: TaskStatus, deadline: string): { icon: string | null; label: string | null; tone: BadgeTone } {
  if (deadline && isOverdue(deadline, status)) return { icon: '!', label: 'Trễ hạn', tone: 'danger' }
  if (status === 'COMPLETED') return { icon: '✓', label: 'Hoàn thành', tone: 'success' }
  if (['WAITING', 'BLOCKED', 'REVISION_REQUIRED', 'PENDING_APPROVAL'].includes(status)) {
    return { icon: '!', label: STATUS_META[status].label, tone: 'warning' }
  }
  return { icon: null, label: null, tone: 'neutral' }
}

const flowchartShell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 18,
  borderRadius: 22,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  boxShadow: '0 24px 80px rgba(0,0,0,.16)',
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
  background: 'var(--bg)',
  overflow: 'hidden',
}

const flowchartFullscreenToolbar: React.CSSProperties = {
  minHeight: 56,
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 340px) minmax(0, 1fr)',
  gap: 10,
  alignItems: 'start',
  padding: '6px 10px',
  borderRadius: 18,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  boxShadow: '0 18px 54px rgba(0,0,0,.18)',
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
  gap: 6,
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
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
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

const flowchartInsightBox: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt-2)',
  fontSize: 12,
  fontWeight: 750,
  lineHeight: 1.45,
}

const flowchartSavedLayoutBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 32,
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(96,145,92,.42)',
  background: 'rgba(96,145,92,.14)',
  color: 'var(--color-success)',
  fontSize: 12,
  fontWeight: 900,
}

const flowchartEditingBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 32,
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(218,223,33,.42)',
  background: 'rgba(218,223,33,.12)',
  color: 'var(--txt)',
  fontSize: 12,
  fontWeight: 900,
}

const flowchartTreePanel: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  minHeight: 620,
  maxHeight: '72vh',
  overflow: 'auto',
  padding: 18,
  background: 'var(--surface)',
}

const flowchartTreeBranch: React.CSSProperties = {
  display: 'grid',
  gap: 6,
}

const flowchartTreeChildren: React.CSSProperties = {
  display: 'grid',
  gap: 6,
}

const flowchartTreeMeta: React.CSSProperties = {
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 750,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const flowchartTreeChevron: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 8,
  color: 'var(--txt-2)',
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  flex: '0 0 auto',
  cursor: 'pointer',
}

const flowchartTreeChevronSpacer: React.CSSProperties = {
  display: 'inline-flex',
  width: 24,
  height: 24,
  flex: '0 0 auto',
}

const flowchartTreeEmpty: React.CSSProperties = {
  marginLeft: 64,
  padding: '8px 10px',
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 750,
}

function flowchartTreeRowStyle(level: number, active: boolean, accent = FLOWCHART_PROJECT_COLOR): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '24px minmax(180px, 1fr) minmax(180px, auto)',
    gap: 10,
    alignItems: 'center',
    width: '100%',
    minHeight: level === 0 ? 50 : 42,
    padding: `8px 12px 8px ${12 + level * 26}px`,
    borderRadius: 12,
    border: `1px solid ${active ? flowchartColorAlpha(accent, 0.55) : 'var(--line)'}`,
    background: active ? `linear-gradient(90deg, ${flowchartColorAlpha(accent, 0.16)}, var(--surface-2))` : 'var(--surface-2)',
    color: 'var(--txt)',
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: active ? `0 0 0 2px ${flowchartColorAlpha(accent, 0.11)}` : undefined,
  }
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
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
  overflow: 'hidden',
}

const flowchartCanvasCardFullscreen: React.CSSProperties = {
  minHeight: 0,
  height: '100%',
}

const flowchartTierGap = 112

const flowchartCanvasHeader: React.CSSProperties = {
  minWidth: 1500,
  display: 'none',
  gridTemplateColumns: '280px 260px 300px 280px',
  gap: flowchartTierGap,
  padding: '14px 18px 12px',
  borderBottom: '1px solid var(--line)',
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
  minHeight: 640,
  padding: 24,
  touchAction: 'none',
  backgroundColor: 'var(--surface)',
  backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--txt) 10%, transparent) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  backgroundPosition: '0 0',
}

const flowchartGuideBox: React.CSSProperties = {
  position: 'absolute',
  left: 18,
  top: 18,
  zIndex: 12,
  display: 'grid',
  gap: 5,
  maxWidth: 250,
  padding: '12px 14px',
  borderRadius: 16,
  border: '1px solid rgba(218,223,33,.22)',
  background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
  boxShadow: '0 18px 50px rgba(0,0,0,.24)',
  color: 'var(--txt-2)',
  fontSize: 12,
  fontWeight: 750,
  lineHeight: 1.35,
  backdropFilter: 'blur(16px)',
}

const flowchartGuideTitle: React.CSSProperties = {
  color: 'var(--txt)',
  fontSize: 12,
  fontWeight: 950,
}

const flowchartGuideDismissButton: React.CSSProperties = {
  width: 'fit-content',
  marginTop: 3,
  padding: '5px 8px',
  borderRadius: 999,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt-2)',
  fontSize: 11,
  fontWeight: 900,
  cursor: 'pointer',
}

const flowchartMiniMap: React.CSSProperties = {
  position: 'absolute',
  right: 18,
  bottom: 18,
  zIndex: 12,
  borderRadius: 14,
  border: '1px solid rgba(157,184,199,.28)',
  background: 'color-mix(in srgb, var(--surface) 90%, transparent)',
  boxShadow: '0 16px 44px rgba(0,0,0,.26)',
  overflow: 'hidden',
  cursor: 'crosshair',
  backdropFilter: 'blur(16px)',
}

const flowchartMiniMapToggleButton: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  top: 8,
  zIndex: 4,
  padding: '5px 8px',
  borderRadius: 999,
  border: '1px solid rgba(157,184,199,.34)',
  background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
  color: 'var(--txt-2)',
  fontSize: 10,
  fontWeight: 900,
  cursor: 'pointer',
  backdropFilter: 'blur(10px)',
}

const flowchartMiniMapShowButton: React.CSSProperties = {
  position: 'absolute',
  right: 18,
  bottom: 18,
  zIndex: 12,
  padding: '9px 12px',
  borderRadius: 999,
  border: '1px solid rgba(218,223,33,.28)',
  background: 'color-mix(in srgb, var(--surface) 90%, transparent)',
  color: 'var(--txt)',
  boxShadow: '0 14px 34px rgba(0,0,0,.24)',
  fontSize: 12,
  fontWeight: 900,
  cursor: 'pointer',
  backdropFilter: 'blur(14px)',
}

const flowchartMiniMapConnectorOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
}

const flowchartMiniMapNode: React.CSSProperties = {
  position: 'absolute',
  borderRadius: 2,
  border: '1px solid rgba(255,255,255,.3)',
  pointerEvents: 'none',
}

const flowchartMiniMapViewport: React.CSSProperties = {
  position: 'absolute',
  borderRadius: 8,
  border: '2px solid rgba(218,223,33,.9)',
  boxShadow: '0 0 0 1px rgba(0,0,0,.28), 0 0 18px rgba(218,223,33,.25)',
  background: 'rgba(218,223,33,.08)',
  pointerEvents: 'none',
}

const flowchartToggle: React.CSSProperties = {
  position: 'absolute',
  left: -46,
  top: '50%',
  transform: 'translateY(-50%)',
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

function flowchartMindmapToggleStyle(accent: string): React.CSSProperties {
  return {
    ...flowchartToggle,
    left: -42,
    borderColor: flowchartColorAlpha(accent, 0.48),
    background: `linear-gradient(180deg, ${flowchartColorAlpha(accent, 0.24)}, rgba(13,16,21,.92))`,
  }
}

function flowchartDragHandleStyle(accent: string, dragging: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    right: -12,
    top: -12,
    zIndex: 12,
    width: 34,
    height: 34,
    borderRadius: 12,
    border: `1px solid ${flowchartColorAlpha(accent, dragging ? 0.86 : 0.52)}`,
    background: dragging
      ? `linear-gradient(180deg, ${flowchartColorAlpha(accent, 0.36)}, rgba(13,16,21,.96))`
      : `linear-gradient(180deg, ${flowchartColorAlpha(accent, 0.22)}, color-mix(in srgb, var(--surface) 88%, transparent))`,
    color: 'var(--txt)',
    boxShadow: dragging
      ? `0 0 0 4px ${flowchartColorAlpha(accent, 0.16)}, 0 16px 34px rgba(0,0,0,.34)`
      : '0 10px 24px rgba(0,0,0,.26)',
    cursor: dragging ? 'grabbing' : 'grab',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 950,
    lineHeight: 1,
    letterSpacing: 0,
    userSelect: 'none',
    touchAction: 'none',
  }
}

const flowchartZoomLayer: React.CSSProperties = {
  minWidth: 1500,
  transformOrigin: 'top left',
  transition: 'transform .18s ease',
  willChange: 'transform',
}

const flowchartBoard: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '310px minmax(1080px, 1fr)',
  gap: flowchartTierGap,
  alignItems: 'stretch',
  width: 'max-content',
}

function flowchartBoardStyle(width: number, height: number): React.CSSProperties {
  return {
    ...flowchartBoard,
    display: 'block',
    width,
    height,
    minWidth: width,
    minHeight: height,
  }
}

function flowchartAbsoluteItemStyle(item: FlowchartLayoutItem): React.CSSProperties {
  return {
    position: 'absolute',
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    zIndex: 2,
  }
}

const flowchartConnectorOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  overflow: 'visible',
  pointerEvents: 'none',
  zIndex: 0,
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

function flowchartCollapsedPillStyle(accent: string): React.CSSProperties {
  return {
    ...flowchartCollapsedPill,
    borderColor: flowchartColorAlpha(accent, 0.32),
    background: `linear-gradient(90deg, ${flowchartColorAlpha(accent, 0.08)}, rgba(255,255,255,.018))`,
  }
}

function flowchartNodeStyle(tone: BadgeTone, variant: 'project' | 'default' | 'group' | 'step', active: boolean, pathActive: boolean, accent: string): React.CSSProperties {
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
        : flowchartColorAlpha(accent, 0.24)
  const toneBackground = danger
    ? 'linear-gradient(90deg, rgba(184,64,64,.16), rgba(184,64,64,.04))'
    : warning
      ? 'linear-gradient(90deg, rgba(184,139,62,.16), rgba(184,139,62,.04))'
      : success
        ? 'linear-gradient(90deg, rgba(96,145,92,.16), rgba(96,145,92,.04))'
        : `linear-gradient(90deg, ${flowchartColorAlpha(accent, variant === 'project' ? 0.22 : 0.14)}, rgba(255,255,255,.018))`
  return {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    minHeight: variant === 'project' ? 112 : variant === 'step' ? 64 : variant === 'group' ? 72 : 78,
    display: 'flex',
    flexDirection: 'column',
    gap: variant === 'step' ? 6 : 7,
    padding: variant === 'project' ? '14px 16px' : variant === 'step' ? '9px 12px' : variant === 'group' ? '10px 13px' : '11px 13px',
    borderRadius: variant === 'project' ? 18 : 14,
    border: `1px solid ${borderColor}`,
    borderLeft: `${active || pathActive ? 5 : 4}px solid ${active ? accent : flowchartColorAlpha(accent, 0.72)}`,
    background: toneBackground,
    color: 'var(--txt)',
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: active
      ? `0 0 0 3px ${flowchartColorAlpha(accent, 0.16)}, 0 16px 38px rgba(0,0,0,.26)`
      : pathActive
        ? `0 0 0 2px ${flowchartColorAlpha(accent, 0.09)}, 0 12px 30px rgba(0,0,0,.18)`
        : variant === 'project'
          ? '0 12px 34px rgba(0,0,0,.22)'
          : 'none',
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
  background: 'var(--surface-3)',
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
  minWidth: 0,
  padding: 16,
  borderRadius: 20,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  boxShadow: '0 24px 70px rgba(0,0,0,.18)',
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
  lineHeight: 1.3,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
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
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
}

const flowchartPanelCard: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 14,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
}

const flowchartWorkflowAccordionCard: React.CSSProperties = {
  ...flowchartPanelCard,
  gap: 0,
  minWidth: 0,
  padding: 0,
  overflow: 'visible',
}

const flowchartWorkflowAccordionHeader: React.CSSProperties = {
  width: '100%',
  minHeight: 54,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '12px 14px',
  border: 0,
  borderRadius: 14,
  background: 'transparent',
  color: 'var(--txt)',
  cursor: 'pointer',
  textAlign: 'left',
  font: 'inherit',
  lineHeight: 1.35,
}

const flowchartWorkflowAccordionHeading: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  overflowWrap: 'anywhere',
}

const flowchartWorkflowAccordionTitleStyle: React.CSSProperties = {
  display: 'block',
  margin: 0,
  color: 'var(--txt)',
  fontSize: 15,
  fontWeight: 800,
  lineHeight: 1.35,
}

const flowchartWorkflowAccordionChevron = (open: boolean): React.CSSProperties => ({
  flex: '0 0 auto',
  color: 'var(--txt-2)',
  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
  transition: 'transform .18s ease',
})

const flowchartWorkflowAccordionBody: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 0,
  padding: '12px 14px 14px',
  borderTop: '1px solid var(--line)',
  overflow: 'visible',
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
  border: '1px solid var(--line)',
  color: 'var(--txt-2)',
  background: 'var(--surface-3)',
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

const flowchartWorkflowStepCard: React.CSSProperties = {
  ...flowchartStepMiniItem,
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 9,
  padding: 10,
}

const flowchartWorkflowStepHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  flexWrap: 'wrap',
  minWidth: 0,
}

const flowchartWorkflowStepTitle: React.CSSProperties = {
  flex: '1 1 150px',
  minWidth: 0,
  overflowWrap: 'anywhere',
  color: 'var(--txt)',
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.4,
}

const flowchartWorkflowStepMeta: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  color: 'var(--txt-3)',
  fontSize: 10.5,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
}

const flowchartWorkflowStepDescription: React.CSSProperties = {
  color: 'var(--txt-2)',
  fontSize: 11,
  lineHeight: 1.45,
}
