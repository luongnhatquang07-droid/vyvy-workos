'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─── Module-level toast (no prop drilling needed) ───────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning'
type ToastItem = { id: string; message: string; type: ToastType }
let _showToast: ((msg: string, type?: ToastType) => void) | null = null
function toast(msg: string, type: ToastType = 'success') { _showToast?.(msg, type) }

// ─── Module-level confirm dialog (thay window.confirm) ──────────────────────
let _confirm: ((msg: string) => Promise<boolean>) | null = null
function confirmDialog(msg: string): Promise<boolean> {
  return _confirm ? _confirm(msg) : Promise.resolve(window.confirm(msg))
}

type Department = {
  id: string
  code: string
  name: string
}

type Employee = {
  id: string
  full_name: string
  position: string | null
  role?: string | null
  is_department_head?: boolean | null
  can_view_all?: boolean | null
  can_manage_users?: boolean | null
  can_manage_tasks?: boolean | null
  can_manage_department_tasks?: boolean | null
  status?: string | null
  department_id?: string | null
  auth_user_id?: string | null
}

type Project = {
  id: string
  name: string
  code: string | null
  description: string | null
  owner_id: string | null
  department_id: string | null
  status: string | null
  priority: string | null
  progress_percent: number | null
  issue_status?: string | null
}

type ProjectHealth = {
  level: 'problem' | 'watch' | 'normal'
  label: string
  overdueTasks: number
  pendingTasks: number
  problemTasks: number
  slowTasks: number
  pendingSteps: number
  revisionSteps: number
  supportRequests: number
  missingReports: number
  overdueSteps: number
  totalWarnings: number
}

type ProjectCard = Project & {
  total: number
  done: number
  overdue: number
  problem: number
  rate: number
  health: ProjectHealth
}

type Task = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  progress_percent: number | null
  due_date: string | null
  department_id: string | null
  assignee_id: string | null
  project_id: string | null
  parent_task_id: string | null
  task_level: string | null
  head_id: string | null
  issue_status: string | null
  created_at?: string | null
}

type TaskStep = {
  id: string
  task_id: string
  step_title: string
  step_order: number
  is_done: boolean
  owner_id: string | null
  approver_id: string | null
  due_date: string | null
  note: string | null
  approval_status: string | null
  approval_note: string | null
  department_approver_id: string | null
  coo_approver_id: string | null
  ceo_approver_id: string | null
  requires_coo_approval: boolean | null
  requires_ceo_approval: boolean | null
  approval_stage: string | null
  department_approval_status: string | null
  coo_approval_status: string | null
  ceo_approval_status: string | null
  department_approval_note: string | null
  coo_approval_note: string | null
  ceo_approval_note: string | null
  department_approved_at: string | null
  coo_approved_at: string | null
  ceo_approved_at: string | null
  report_file_url: string | null
  report_file_name: string | null
  report_link: string | null
  support_request: string | null
}

type TaskSupporter = {
  id: string
  task_id: string
  employee_id: string
  role_note: string | null
  employees?: {
    id: string
    full_name: string
  } | null
}

type TaskReport = {
  id: string
  task_id: string
  file_name: string
  file_url: string
  file_type: string | null
  uploaded_by: string | null
  note: string | null
  created_at: string
}

type StepComment = {
  id: string
  step_id: string
  employee_id: string | null
  comment: string
  comment_type: string
  created_at: string
  employees?: {
    full_name: string
  } | null
}

type ViewKey = 'dashboard' | 'coo' | 'projects' | 'tasks' | 'meeting' | 'assistant' | 'admin'

type SubtaskForm = {
  title: string
  description: string
  departmentId: string
  headId: string
  assigneeId: string
  dueDate: string
  priority: string
}

type StepForm = {
  title: string
  ownerId: string
  approverId: string
  dueDate: string
}

type NotexRow = {
  id: string
  workstreamTitle: string
  subtaskTitle: string
  responsibility: string
  expectedOutput: string
  departmentId: string
  headId: string
  assigneeId: string
  dueDate: string
  priority: string
}

export default function Home() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null)

  // ─── Toast system ──────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const showToast = useCallback((msg: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev.slice(-4), { id, message: msg, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])
  useEffect(() => { _showToast = showToast; return () => { _showToast = null } }, [showToast])

  // ─── Confirm dialog ────────────────────────────────────────────────────────
  const [confirmState, setConfirmState] = useState<{ message: string; resolve: (ok: boolean) => void } | null>(null)
  useEffect(() => {
    _confirm = (message: string) => new Promise<boolean>((resolve) => setConfirmState({ message, resolve }))
    return () => { _confirm = null }
  }, [])
  const answerConfirm = useCallback((ok: boolean) => {
    setConfirmState((current) => {
      current?.resolve(ok)
      return null
    })
  }, [])

  // ─── Realtime sync ─────────────────────────────────────────────────────────
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'off'>('connecting')
  const fetchAllRef = useRef<((opts?: { silent?: boolean }) => void) | null>(null)

  const [view, setView] = useState<ViewKey>('coo')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [steps, setSteps] = useState<TaskStep[]>([])
  const [supporters, setSupporters] = useState<TaskSupporter[]>([])
  const [reports, setReports] = useState<TaskReport[]>([])
  const [comments, setComments] = useState<StepComment[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [selectedWorkstreamId, setSelectedWorkstreamId] = useState('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createTab, setCreateTab] = useState<'project' | 'workstream'>('workstream')

  const [projectName, setProjectName] = useState('')
  const [projectCode, setProjectCode] = useState('')
  const [projectDesc, setProjectDesc] = useState('')
  const [projectOwnerId, setProjectOwnerId] = useState('')
  const [projectDepartmentId, setProjectDepartmentId] = useState('')

  const [workTitle, setWorkTitle] = useState('')
  const [workDesc, setWorkDesc] = useState('')
  const [workProjectId, setWorkProjectId] = useState('')
  const [workDepartmentId, setWorkDepartmentId] = useState('')
  const [workHeadId, setWorkHeadId] = useState('')
  const [workAssigneeId, setWorkAssigneeId] = useState('')
  const [workDueDate, setWorkDueDate] = useState('')
  const [workPriority, setWorkPriority] = useState('medium')

  const [subtaskOpenFor, setSubtaskOpenFor] = useState('')
  const [subtaskForm, setSubtaskForm] = useState<SubtaskForm>({
    title: '',
    description: '',
    departmentId: '',
    headId: '',
    assigneeId: '',
    dueDate: '',
    priority: 'medium',
  })

  const [stepOpenFor, setStepOpenFor] = useState('')
  const [stepForm, setStepForm] = useState<StepForm>({
    title: '',
    ownerId: '',
    approverId: '',
    dueDate: '',
  })

  const [supporterDrafts, setSupporterDrafts] = useState<Record<string, string>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>({})
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({})
  const [supportDrafts, setSupportDrafts] = useState<Record<string, string>>({})

  const [meetingTitle, setMeetingTitle] = useState('Biên bản họp vận hành')
  const [meetingRaw, setMeetingRaw] = useState('')
  const [notexProjectName, setNotexProjectName] = useState('')
  const [notexRows, setNotexRows] = useState<NotexRow[]>([])
  const [importing, setImporting] = useState(false)
  const [assistantOutput, setAssistantOutput] = useState('')

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const { data: emp, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()

      if (empError) {
        // Column auth_user_id chưa tồn tại (SQL chưa chạy) — vẫn cho vào app
        setCurrentEmployee({ id: '', full_name: session.user.email || 'Admin', position: null, role: 'admin', status: 'active' })
        setAuthChecked(true)
        return
      }

      if (emp && emp.status === 'inactive') {
        await supabase.auth.signOut()
        router.push('/login')
        return
      }

      setCurrentEmployee(emp ? (emp as Employee) : { id: '', full_name: session.user.email || 'Admin', position: null, role: 'admin', status: 'active' })
      setAuthChecked(true)
    }
    checkAuth()
  }, [router])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const fetchDepartments = useCallback(async () => {
    const { data, error } = await supabase.from('departments').select('id, code, name').order('name')
    if (error) {
      console.error(error)
      setDepartments([])
      return
    }

    const rows = (data || []) as Department[]
    setDepartments(rows)

    if (rows[0]) {
      setProjectDepartmentId((v) => v || rows[0].id)
      setWorkDepartmentId((v) => v || rows[0].id)
    }
  }, [])

  const fetchEmployees = useCallback(async () => {
    const { data, error } = await supabase.from('employees').select('id, full_name, position').order('full_name')
    if (error) {
      console.error(error)
      setEmployees([])
      return
    }

    const rows = (data || []) as Employee[]
    setEmployees(rows)

    if (rows[0]) {
      setProjectOwnerId((v) => v || rows[0].id)
      setWorkHeadId((v) => v || rows[0].id)
      setWorkAssigneeId((v) => v || rows[0].id)
    }
  }, [])

  const fetchProjects = useCallback(async () => {
    const { data, error } = await supabase.from('projects').select('*').order('name')
    if (error) {
      console.error(error)
      setProjects([])
      return
    }

    const rows = (data || []) as Project[]
    setProjects(rows)

    if (rows[0]) {
      setWorkProjectId((v) => v || rows[0].id)
    }
  }, [])

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
    if (error) {
      console.error(error)
      setTasks([])
      return
    }

    setTasks((data || []) as Task[])
  }, [])

  const fetchSteps = useCallback(async () => {
    const { data, error } = await supabase.from('task_steps').select('*').order('step_order')
    if (error) {
      console.error(error)
      setSteps([])
      return
    }

    setSteps((data || []) as TaskStep[])
  }, [])

  const fetchSupporters = useCallback(async () => {
    const { data, error } = await supabase.from('task_supporters').select('*, employees(id, full_name)')
    if (error) {
      console.error(error)
      setSupporters([])
      return
    }

    setSupporters((data || []) as TaskSupporter[])
  }, [])

  const fetchReports = useCallback(async () => {
    const { data, error } = await supabase.from('task_reports').select('*').order('created_at', { ascending: false })
    if (error) {
      console.error(error)
      setReports([])
      return
    }

    setReports((data || []) as TaskReport[])
  }, [])

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase.from('task_step_comments').select('*, employees(full_name)').order('created_at')
    if (error) {
      console.error(error)
      setComments([])
      return
    }

    setComments((data || []) as StepComment[])
  }, [])

  const fetchAll = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true)
    }
    await Promise.all([
      fetchDepartments(),
      fetchEmployees(),
      fetchProjects(),
      fetchTasks(),
      fetchSteps(),
      fetchSupporters(),
      fetchReports(),
      fetchComments(),
    ])
    if (!options?.silent) {
      setLoading(false)
    }
  }, [
    fetchComments,
    fetchDepartments,
    fetchEmployees,
    fetchProjects,
    fetchReports,
    fetchSteps,
    fetchSupporters,
    fetchTasks,
  ])

  useEffect(() => {
    fetchAllRef.current = fetchAll
  }, [fetchAll])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { fetchAll() }, 0)
    return () => window.clearTimeout(loadTimer)
  }, [fetchAll])

  // Supabase Realtime
  useEffect(() => {
    if (!authChecked) return
    const channel = supabase
      .channel('workos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchAllRef.current?.({ silent: true })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_steps' }, () => {
        fetchAllRef.current?.({ silent: true })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchAllRef.current?.({ silent: true })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_supporters' }, () => {
        fetchAllRef.current?.({ silent: true })
      })
      .subscribe((status) => {
        setRealtimeStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CLOSED' ? 'off' : 'connecting')
      })
    return () => { supabase.removeChannel(channel) }
  }, [authChecked])

  const refreshDataSilent = useCallback(async () => {
    // Only refresh data that can change during small updates
    // Don't refetch departments, employees, projects to avoid unnecessary re-renders
    await Promise.all([
      fetchTasks(),
      fetchSteps(),
      fetchSupporters(),
      fetchReports(),
      fetchComments(),
    ])
  }, [fetchComments, fetchReports, fetchSteps, fetchSupporters, fetchTasks])

  async function createProject() {
    if (!projectName.trim()) {
      toast('Nhập tên dự án trước.', 'warning')
      return
    }

    setSaving(true)

    const { error } = await supabase.from('projects').insert({
      name: projectName.trim(),
      code: projectCode.trim() || null,
      description: projectDesc.trim() || null,
      owner_id: projectOwnerId || null,
      department_id: projectDepartmentId || null,
      status: 'not_started',
      priority: 'medium',
      progress_percent: 0,
      issue_status: 'normal',
    })

    setSaving(false)

    if (error) {
      console.error(error)
      toast('Tạo dự án bị lỗi.', 'error')
      return
    }

    toast('Đã tạo dự án thành công.')
    setProjectName('')
    setProjectCode('')
    setProjectDesc('')
    await fetchAll({ silent: true })
  }

  async function createWorkstream() {
    if (!workTitle.trim()) {
      toast('Nhập tên đầu việc lớn trước.', 'warning')
      return
    }

    if (!workProjectId) {
      toast('Chọn dự án trước.', 'warning')
      return
    }

    setSaving(true)

    const { error } = await supabase.from('tasks').insert({
      title: workTitle.trim(),
      description: workDesc.trim() || null,
      parent_task_id: null,
      task_level: 'workstream',
      status: 'not_started',
      priority: workPriority,
      progress_percent: 0,
      due_date: workDueDate || null,
      department_id: workDepartmentId || null,
      assignee_id: workAssigneeId || null,
      head_id: workHeadId || null,
      project_id: workProjectId || null,
      issue_status: 'normal',
      approval_status: 'not_submitted',
    })

    setSaving(false)

    if (error) {
      console.error(error)
      toast('Tạo đầu việc lớn bị lỗi.', 'error')
      return
    }

    setWorkTitle('')
    setWorkDesc('')
    setWorkDueDate('')
    await refreshDataSilent()
  }

  function openSubtaskForm(parent: Task) {
    setSubtaskOpenFor(parent.id)
    setSubtaskForm({
      title: '',
      description: '',
      departmentId: parent.department_id || departments[0]?.id || '',
      headId: parent.head_id || parent.assignee_id || employees[0]?.id || '',
      assigneeId: parent.assignee_id || parent.head_id || employees[0]?.id || '',
      dueDate: parent.due_date || '',
      priority: parent.priority || 'medium',
    })
  }

  async function createSubtask(parent: Task) {
    if (!subtaskForm.title.trim()) {
      toast('Nhập tên đầu việc con trước.', 'warning')
      return
    }

    const { error } = await supabase.from('tasks').insert({
      title: subtaskForm.title.trim(),
      description: subtaskForm.description.trim() || null,
      parent_task_id: parent.id,
      task_level: 'subtask',
      status: 'not_started',
      priority: subtaskForm.priority,
      progress_percent: 0,
      due_date: subtaskForm.dueDate || null,
      department_id: subtaskForm.departmentId || null,
      assignee_id: subtaskForm.assigneeId || null,
      head_id: subtaskForm.headId || null,
      project_id: parent.project_id || null,
      issue_status: 'normal',
      approval_status: 'not_submitted',
    })

    if (error) {
      console.error(error)
      toast('Tạo đầu việc con bị lỗi.', 'error')
      return
    }

    setSubtaskOpenFor('')
    await refreshDataSilent()
  }

  function openStepForm(task: Task) {
    const departmentApproverId = getDefaultDepartmentApprover(task.department_id, departments, employees)

    setStepOpenFor(task.id)
    setStepForm({
      title: '',
      ownerId: task.assignee_id || task.head_id || employees[0]?.id || '',
      approverId: departmentApproverId || task.head_id || employees[0]?.id || '',
      dueDate: task.due_date || '',
    })
  }

  async function createStep(taskId: string) {
    if (!stepForm.title.trim()) {
      toast('Nhập tên bước trước.', 'warning')
      return
    }

    const currentSteps = steps.filter((step) => step.task_id === taskId)
    const nextOrder = currentSteps.length + 1
    const task = tasks.find((item) => item.id === taskId)
    const departmentApproverId = stepForm.approverId || getDefaultDepartmentApprover(task?.department_id || null, departments, employees)
    const cooApproverId = getCooApprover(employees)
    const ceoApproverId = getCeoApprover(employees)

    const { error } = await supabase.from('task_steps').insert({
      task_id: taskId,
      step_title: stepForm.title.trim(),
      step_order: nextOrder,
      is_done: false,
      owner_id: stepForm.ownerId || null,
      approver_id: departmentApproverId || null,
      department_approver_id: departmentApproverId || null,
      coo_approver_id: cooApproverId || null,
      ceo_approver_id: ceoApproverId || null,
      requires_coo_approval: false,
      requires_ceo_approval: false,
      approval_stage: 'department',
      department_approval_status: 'not_submitted',
      coo_approval_status: 'not_required',
      ceo_approval_status: 'not_required',
      due_date: stepForm.dueDate || null,
      approval_status: 'not_submitted',
    })

    if (error) {
      console.error(error)
      toast('Tạo bước bị lỗi.', 'error')
      return
    }

    setStepOpenFor('')
    await syncTaskProgress(taskId)
    await refreshDataSilent()
  }

  async function updateTaskStatus(taskId: string, status: string) {
    const { error } = await supabase
      .from('tasks')
      .update({
        status,
        completed_date: status === 'completed' ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq('id', taskId)

    if (error) {
      console.error(error)
      toast('Cập nhật trạng thái lỗi.', 'error')
      return
    }

    await refreshDataSilent()
  }

  async function updateIssueStatus(taskId: string, issueStatus: string) {
    const { error } = await supabase.from('tasks').update({ issue_status: issueStatus }).eq('id', taskId)

    if (error) {
      console.error(error)
      toast('Cập nhật tình trạng lỗi.', 'error')
      return
    }

    await refreshDataSilent()
  }

  // Tự động tính % tiến độ + trạng thái đầu việc từ các bước (automation)
  async function syncTaskProgress(taskId: string) {
    const { data } = await supabase
      .from('task_steps')
      .select('id, is_done, approval_status')
      .eq('task_id', taskId)

    const rows = (data || []) as Pick<TaskStep, 'id' | 'is_done' | 'approval_status'>[]
    if (rows.length === 0) return

    const done = rows.filter((row) => row.is_done).length
    const percent = Math.round((done / rows.length) * 100)
    const hasActivity = rows.some((row) => row.is_done || (row.approval_status && row.approval_status !== 'not_submitted'))

    const task = tasks.find((item) => item.id === taskId)
    const patch: Record<string, unknown> = { progress_percent: percent }

    if (percent === 100) {
      patch.status = 'completed'
      patch.completed_date = new Date().toISOString().slice(0, 10)
    } else if (hasActivity && (task?.status === 'not_started' || !task?.status)) {
      patch.status = 'in_progress'
    } else if (percent < 100 && task?.status === 'completed') {
      patch.status = 'in_progress'
      patch.completed_date = null
    }

    await supabase.from('tasks').update(patch).eq('id', taskId)

    // Cascade: workstream cha tự tính % từ các đầu việc con
    if (task?.parent_task_id) {
      const { data: siblings } = await supabase
        .from('tasks')
        .select('id, progress_percent, status')
        .eq('parent_task_id', task.parent_task_id)

      const subRows = (siblings || []) as Pick<Task, 'id' | 'progress_percent' | 'status'>[]
      if (subRows.length > 0) {
        const avg = Math.round(subRows.reduce((sum, row) => sum + (row.progress_percent || 0), 0) / subRows.length)
        const allDone = subRows.every((row) => row.status === 'completed')
        await supabase.from('tasks').update({
          progress_percent: avg,
          ...(allDone ? { status: 'completed', completed_date: new Date().toISOString().slice(0, 10) } : {}),
        }).eq('id', task.parent_task_id)
      }
    }

    // Cascade: dự án tự tính % từ toàn bộ đầu việc
    if (task?.project_id) {
      const { data: projectTasks } = await supabase
        .from('tasks')
        .select('id, progress_percent')
        .eq('project_id', task.project_id)

      const projRows = (projectTasks || []) as Pick<Task, 'id' | 'progress_percent'>[]
      if (projRows.length > 0) {
        const avg = Math.round(projRows.reduce((sum, row) => sum + (row.progress_percent || 0), 0) / projRows.length)
        await supabase.from('projects').update({ progress_percent: avg }).eq('id', task.project_id)
      }
    }
  }

  async function updateStep(step: TaskStep, patch: Partial<TaskStep>) {
    const { error } = await supabase.from('task_steps').update(patch).eq('id', step.id)

    if (error) {
      console.error(error)
      toast('Cập nhật bước bị lỗi.', 'error')
      return
    }

    await syncTaskProgress(step.task_id)
    await refreshDataSilent()
  }

  async function submitStep(step: TaskStep) {
    await updateStep(step, {
      approval_status: 'pending',
      approval_stage: 'department',
      department_approval_status: 'pending',
      coo_approval_status: step.requires_coo_approval ? 'not_submitted' : 'not_required',
      ceo_approval_status: step.requires_ceo_approval ? 'not_submitted' : 'not_required',
      submitted_at: new Date().toISOString(),
    } as Partial<TaskStep>)
    toast('Đã gửi duyệt.', 'info')
  }

  async function approveCurrentStage(step: TaskStep) {
    const now = new Date().toISOString()
    const stage = step.approval_stage || 'department'

    if (stage === 'department') {
      if (step.requires_coo_approval) {
        await updateStep(step, {
          department_approval_status: 'approved',
          department_approved_at: now,
          approval_stage: 'coo',
          coo_approval_status: 'pending',
          approval_status: 'pending',
          is_done: false,
        } as Partial<TaskStep>)
        toast('Đã duyệt cấp phòng ban — chuyển lên COO.', 'info')
        return
      }

      if (step.requires_ceo_approval) {
        await updateStep(step, {
          department_approval_status: 'approved',
          department_approved_at: now,
          approval_stage: 'ceo',
          ceo_approval_status: 'pending',
          approval_status: 'pending',
          is_done: false,
        } as Partial<TaskStep>)
        toast('Đã duyệt cấp phòng ban — chuyển lên CEO.', 'info')
        return
      }

      await updateStep(step, {
        department_approval_status: 'approved',
        department_approved_at: now,
        approval_status: 'approved',
        approval_note: 'Đã duyệt.',
        is_done: true,
        approved_at: now,
      } as Partial<TaskStep>)
      toast('Đã duyệt bước hoàn tất.')
      return
    }

    if (stage === 'coo') {
      if (step.requires_ceo_approval) {
        await updateStep(step, {
          coo_approval_status: 'approved',
          coo_approved_at: now,
          approval_stage: 'ceo',
          ceo_approval_status: 'pending',
          approval_status: 'pending',
          is_done: false,
        } as Partial<TaskStep>)
        toast('COO đã duyệt — chuyển lên CEO.', 'info')
        return
      }

      await updateStep(step, {
        coo_approval_status: 'approved',
        coo_approved_at: now,
        approval_status: 'approved',
        approval_note: 'Đã duyệt.',
        is_done: true,
        approved_at: now,
      } as Partial<TaskStep>)
      toast('COO đã duyệt — bước hoàn tất.')
      return
    }

    await updateStep(step, {
      ceo_approval_status: 'approved',
      ceo_approved_at: now,
      approval_status: 'approved',
      approval_note: 'Đã duyệt.',
      is_done: true,
      approved_at: now,
    } as Partial<TaskStep>)
    toast('CEO đã duyệt — bước hoàn tất.')
  }

  async function requestRevision(step: TaskStep) {
    const note = revisionDrafts[step.id]?.trim()

    if (!note) {
      toast('Nhập lý do cần làm lại trước.', 'warning')
      return
    }

    const stage = step.approval_stage || 'department'
    const stagePatch =
      stage === 'coo'
        ? { coo_approval_status: 'revision', coo_approval_note: note }
        : stage === 'ceo'
          ? { ceo_approval_status: 'revision', ceo_approval_note: note }
          : { department_approval_status: 'revision', department_approval_note: note }

    const { error } = await supabase
      .from('task_steps')
      .update({
        is_done: false,
        approval_status: 'revision',
        approval_note: note,
        ...stagePatch,
      })
      .eq('id', step.id)

    if (error) {
      console.error(error)
      toast('Yêu cầu làm lại bị lỗi.', 'error')
      return
    }

    await addComment(step.id, note, 'revision')
    setRevisionDrafts((current) => ({ ...current, [step.id]: '' }))
    toast('Đã gửi yêu cầu làm lại.', 'info')
    await syncTaskProgress(step.task_id)
    await refreshDataSilent()
  }

  async function saveStepLink(step: TaskStep) {
    const link = linkDrafts[step.id] ?? step.report_link ?? ''
    await updateStep(step, { report_link: link } as Partial<TaskStep>)
    toast('Đã lưu link báo cáo.', 'info')
  }

  async function saveSupportRequest(step: TaskStep) {
    const request = supportDrafts[step.id] ?? step.support_request ?? ''

    const { error } = await supabase.from('task_steps').update({ support_request: request }).eq('id', step.id)

    if (error) {
      console.error(error)
      toast('Lưu yêu cầu hỗ trợ bị lỗi.', 'error')
      return
    }

    if (request.trim()) {
      await addComment(step.id, request, 'support_request')
    }

    toast('Đã gửi yêu cầu hỗ trợ.', 'info')
    await refreshDataSilent()
  }

  async function addComment(stepId: string, content?: string, type = 'comment') {
    const text = (content || commentDrafts[stepId] || '').trim()
    if (!text) return

    const { error } = await supabase.from('task_step_comments').insert({
      step_id: stepId,
      employee_id: employees[0]?.id || null,
      comment: text,
      comment_type: type,
    })

    if (error) {
      console.error(error)
      toast('Gửi bình luận bị lỗi.', 'error')
      return
    }

    setCommentDrafts((current) => ({ ...current, [stepId]: '' }))
    await fetchComments()
  }

  async function createSupporter(taskId: string) {
    const employeeId = supporterDrafts[taskId]

    if (!employeeId) {
      toast('Chọn người hỗ trợ trước.', 'warning')
      return
    }

    const { error } = await supabase.from('task_supporters').insert({
      task_id: taskId,
      employee_id: employeeId,
      role_note: 'Hỗ trợ thực hiện',
    })

    if (error) {
      console.error(error)
      toast('Người này đã là hỗ trợ hoặc thêm bị lỗi.', 'error')
      return
    }

    setSupporterDrafts((current) => ({ ...current, [taskId]: '' }))
    await refreshDataSilent()
  }

  async function uploadStepFile(step: TaskStep, file?: File) {
    if (!file) return

    setUploading(true)

    const safeName = file.name.replace(/\s+/g, '-')
    const filePath = `${step.id}/${Date.now()}-${safeName}`

    const { error: uploadError } = await supabase.storage.from('step-reports').upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    })

    if (uploadError) {
      console.error(uploadError)
      toast('Upload file bước bị lỗi.', 'error')
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('step-reports').getPublicUrl(filePath)

    const { error } = await supabase
      .from('task_steps')
      .update({
        report_file_url: data.publicUrl,
        report_file_name: file.name,
      })
      .eq('id', step.id)

    setUploading(false)

    if (error) {
      console.error(error)
      toast('Lưu file bước bị lỗi.', 'error')
      return
    }

    await refreshDataSilent()
  }

  async function uploadTaskFile(task: Task, file?: File) {
    if (!file) return

    setUploading(true)

    const safeName = file.name.replace(/\s+/g, '-')
    const filePath = `${task.id}/${Date.now()}-${safeName}`

    const { error: uploadError } = await supabase.storage.from('task-reports').upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    })

    if (uploadError) {
      console.error(uploadError)
      toast('Upload file bị lỗi.', 'error')
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('task-reports').getPublicUrl(filePath)

    const { error } = await supabase.from('task_reports').insert({
      task_id: task.id,
      file_name: file.name,
      file_url: data.publicUrl,
      file_type: file.type || null,
      uploaded_by: task.head_id || task.assignee_id || null,
      note: 'File báo cáo / kết quả đầu việc',
    })

    setUploading(false)

    if (error) {
      console.error(error)
      toast('Lưu file bị lỗi.', 'error')
      return
    }

    await fetchReports()
  }

  async function deleteProject(project: Project) {
    if (!(await confirmDialog(`Xóa dự án "${project.name}" và toàn bộ đầu việc thuộc dự án này?`))) return

    const { error: tasksError } = await supabase.from('tasks').delete().eq('project_id', project.id)

    if (tasksError) {
      console.error(tasksError)
      toast('Xóa các đầu việc thuộc dự án bị lỗi.', 'error')
      return
    }

    const { error } = await supabase.from('projects').delete().eq('id', project.id)

    if (error) {
      console.error(error)
      toast('Xóa dự án bị lỗi.', 'error')
      return
    }

    if (selectedProjectId === project.id) {
      setSelectedProjectId('all')
    }

    if (selectedTask?.project_id === project.id) {
      setSelectedTask(null)
    }

    toast('Đã xóa dự án.')
    await fetchAll({ silent: true })
  }

  async function deleteTask(task: Task) {
    const label = task.task_level === 'workstream' || !task.parent_task_id ? 'đầu việc lớn' : 'đầu việc con'
    if (!(await confirmDialog(`Xóa ${label} "${task.title}"?`))) return

    const { error } = await supabase.from('tasks').delete().eq('id', task.id)

    if (error) {
      console.error(error)
      toast(`Xóa ${label} bị lỗi.`, 'error')
      return
    }

    if (selectedWorkstreamId === task.id) {
      setSelectedWorkstreamId('')
    }

    if (selectedTask?.id === task.id) {
      setSelectedTask(null)
    }

    toast(`Đã xóa ${label}.`)
    await refreshDataSilent()
  }

  async function deleteStep(step: TaskStep) {
    if (!(await confirmDialog(`Xóa bước "${step.step_title}"?`))) return

    const { error } = await supabase.from('task_steps').delete().eq('id', step.id)

    if (error) {
      console.error(error)
      toast('Xóa bước bị lỗi.', 'error')
      return
    }

    await syncTaskProgress(step.task_id)
    await refreshDataSilent()
  }

  async function deleteSupporter(supporter: TaskSupporter) {
    const name = supporter.employees?.full_name || 'người hỗ trợ này'
    if (!(await confirmDialog(`Xóa ${name} khỏi danh sách hỗ trợ?`))) return

    const { error } = await supabase.from('task_supporters').delete().eq('id', supporter.id)

    if (error) {
      console.error(error)
      toast('Xóa người hỗ trợ bị lỗi.', 'error')
      return
    }

    await refreshDataSilent()
  }

  async function deleteTaskReport(report: TaskReport) {
    if (!(await confirmDialog(`Xóa file báo cáo "${report.file_name}"?`))) return

    const { error } = await supabase.from('task_reports').delete().eq('id', report.id)

    if (error) {
      console.error(error)
      toast('Xóa file báo cáo bị lỗi.', 'error')
      return
    }

    await fetchReports()
  }

  async function clearStepFile(step: TaskStep) {
    if (!(await confirmDialog(`Xóa file báo cáo của bước "${step.step_title}"?`))) return

    const { error } = await supabase
      .from('task_steps')
      .update({
        report_file_url: null,
        report_file_name: null,
      })
      .eq('id', step.id)

    if (error) {
      console.error(error)
      toast('Xóa file trong bước bị lỗi.', 'error')
      return
    }

    await refreshDataSilent()
  }

  function handleMeetingFile(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setMeetingRaw(String(reader.result || ''))
    reader.readAsText(file)
  }

  function splitNotexRows() {
    const rows = parseNotexText(meetingRaw, departments, employees)

    if (rows.length === 0) {
      toast('Chưa tách được đầu việc từ nội dung Notex.', 'warning')
      return
    }

    setNotexRows(rows)
    setNotexProjectName((current) => current || meetingTitle || 'Dự án từ biên bản Notex')
  }

  async function importNotexRows() {
    const projectName = notexProjectName.trim()

    if (!projectName) {
      toast('Nhập tên dự án import trước.', 'warning')
      return
    }

    if (notexRows.length === 0) {
      toast('Chưa có dòng preview để import.', 'warning')
      return
    }

    setImporting(true)

    try {
      let projectId = projects.find((project) => project.name.trim().toLowerCase() === projectName.toLowerCase())?.id

      if (!projectId) {
        const firstRow = notexRows[0]
        const { data, error } = await supabase
          .from('projects')
          .insert({
            name: projectName,
            code: null,
            description: `Import từ biên bản: ${meetingTitle}`,
            owner_id: firstRow.headId || firstRow.assigneeId || employees[0]?.id || null,
            department_id: firstRow.departmentId || departments[0]?.id || null,
            status: 'not_started',
            priority: 'medium',
            progress_percent: 0,
            issue_status: 'normal',
          })
          .select('id')
          .single()

        if (error) {
          console.error(error)
          toast('Tạo dự án từ Notex bị lỗi.', 'error')
          setImporting(false)
          return
        }

        projectId = data.id as string
      }

      const workstreamIds = new Map<string, string>()

      for (const row of notexRows) {
        const workstreamTitle = normalizeWorkstreamTitle(row.workstreamTitle)
        const workstreamKey = workstreamTitle.toLowerCase()
        let workstreamId = workstreamIds.get(workstreamKey)

        if (!workstreamId) {
          const { data, error } = await supabase
            .from('tasks')
            .insert({
              title: workstreamTitle,
              description: `Import từ Notex: ${meetingTitle}`,
              parent_task_id: null,
              task_level: 'workstream',
              status: 'not_started',
              priority: row.priority || 'medium',
              progress_percent: 0,
              due_date: row.dueDate || null,
              department_id: row.departmentId || null,
              assignee_id: row.assigneeId || null,
              head_id: row.headId || row.assigneeId || null,
              project_id: projectId,
              issue_status: 'normal',
              approval_status: 'not_submitted',
            })
            .select('id')
            .single()

          if (error) {
            console.error(error)
            toast(`Tạo đầu việc lớn "${workstreamTitle}" bị lỗi.`, 'error')
            setImporting(false)
            return
          }

          workstreamId = data.id as string
          workstreamIds.set(workstreamKey, workstreamId)
        }

        const { data: subtask, error: subtaskError } = await supabase
          .from('tasks')
          .insert({
            title: row.subtaskTitle.trim(),
            description: buildNotexDescription(row),
            parent_task_id: workstreamId,
            task_level: 'subtask',
            status: 'not_started',
            priority: row.priority || 'medium',
            progress_percent: 0,
            due_date: row.dueDate || null,
            department_id: row.departmentId || null,
            assignee_id: row.assigneeId || null,
            head_id: row.headId || row.assigneeId || null,
            project_id: projectId,
            issue_status: 'normal',
            approval_status: 'not_submitted',
          })
          .select('id')
          .single()

        if (subtaskError) {
          console.error(subtaskError)
          toast(`Tạo đầu việc con "${row.subtaskTitle}" bị lỗi.`, 'error')
          setImporting(false)
          return
        }

        const subtaskId = subtask.id as string
        const departmentApproverId = getDefaultDepartmentApprover(row.departmentId || null, departments, employees)
        const cooApproverId = getCooApprover(employees)
        const ceoApproverId = getCeoApprover(employees)
        const stepRows = [
          'Làm rõ yêu cầu và chuẩn đầu ra',
          'Thực hiện và cập nhật kết quả',
          'Gửi file/link báo cáo để duyệt',
        ].map((title, index) => ({
          task_id: subtaskId,
          step_title: title,
          step_order: index + 1,
          is_done: false,
          owner_id: row.assigneeId || null,
          approver_id: departmentApproverId || null,
          department_approver_id: departmentApproverId || null,
          coo_approver_id: cooApproverId || null,
          ceo_approver_id: ceoApproverId || null,
          requires_coo_approval: false,
          requires_ceo_approval: false,
          approval_stage: 'department',
          department_approval_status: 'not_submitted',
          coo_approval_status: 'not_required',
          ceo_approval_status: 'not_required',
          due_date: row.dueDate || null,
          approval_status: 'not_submitted',
        }))

        const { error: stepsError } = await supabase.from('task_steps').insert(stepRows)

        if (stepsError) {
          console.error(stepsError)
          toast(`Tạo bước cho "${row.subtaskTitle}" bị lỗi.`, 'error')
          setImporting(false)
          return
        }
      }

      await fetchAll({ silent: true })
      setNotexRows([])
      setView('coo')
      setSelectedProjectId(projectId)
      toast('Import Notex vào COO Board thành công.')
    } finally {
      setImporting(false)
    }
  }

  async function saveMeeting() {
    if (!meetingRaw.trim()) {
      toast('Dán biên bản họp trước.', 'warning')
      return
    }

    const { error } = await supabase.from('meeting_minutes').insert({
      title: meetingTitle,
      raw_content: meetingRaw,
      summary: 'Biên bản đã được lưu. Bước AI tách đầu việc sẽ nâng cấp sau.',
    })

    if (error) {
      console.error(error)
      toast('Lưu biên bản bị lỗi.', 'error')
      return
    }

    setMeetingRaw('')
    toast('Đã lưu biên bản họp.')
  }

  async function saveAssistantReport(type: string, title: string, content: string) {
    await supabase.from('coo_assistant_reports').insert({
      report_type: type,
      title,
      content,
      created_by: employees[0]?.id || null,
    })
  }

  function showAssistantReport(type: string, title: string, content: string) {
    setAssistantOutput(content)
    saveAssistantReport(type, title, content)
  }

  function generateDailyReport() {
    showAssistantReport('daily_report', 'Báo cáo COO hôm nay', buildDailyReport(tasks, steps, projectCards, urgentTasks))
  }

  function generateFollowUpReport() {
    showAssistantReport('follow_up_report', 'Việc cần hối thúc', buildFollowUpReport(urgentTasks, employeeMap, projectMap))
  }

  function generatePendingApprovalReport() {
    showAssistantReport(
      'pending_approval_report',
      'Việc chờ duyệt',
      buildStepReport('VIỆC CHỜ DUYỆT', getPendingApprovalSteps(steps), tasks, employeeMap, 'pending')
    )
  }

  function generateRevisionReport() {
    showAssistantReport(
      'revision_report',
      'Việc cần làm lại',
      buildStepReport('VIỆC CẦN LÀM LẠI', getRevisionSteps(steps), tasks, employeeMap, 'revision')
    )
  }

  function generateMissingReportFileReport() {
    showAssistantReport(
      'missing_report_file_report',
      'Việc thiếu file/link báo cáo',
      buildStepReport('VIỆC THIẾU FILE/LINK BÁO CÁO', getMissingReportSteps(steps), tasks, employeeMap, 'missing_report')
    )
  }

  function generatePeopleReport() {
    showAssistantReport('people_report', 'Báo cáo theo nhân sự', buildPeopleReport(peopleReports))
  }

  function generateProjectReport() {
    showAssistantReport('project_report', 'Báo cáo theo dự án', buildProjectReport(projectCards))
  }

  function getStatusLabel(status: string) {
    const map: Record<string, string> = {
      not_started: 'Chưa bắt đầu',
      in_progress: 'Đang làm',
      pending: 'Pending',
      completed: 'Hoàn thành',
      overdue: 'Trễ deadline',
    }

    return map[status] || status
  }

  const employeeMap = useMemo(() => new Map(employees.map((item) => [item.id, item])), [employees])
  const departmentMap = useMemo(() => new Map(departments.map((item) => [item.id, item])), [departments])
  const projectMap = useMemo(() => new Map(projects.map((item) => [item.id, item])), [projects])

  const stepsByTask = useMemo(() => {
    const map = new Map<string, TaskStep[]>()

    steps.forEach((step) => {
      const list = map.get(step.task_id) || []
      list.push(step)
      list.sort((a, b) => a.step_order - b.step_order)
      map.set(step.task_id, list)
    })

    return map
  }, [steps])

  const commentsByStep = useMemo(() => {
    const map = new Map<string, StepComment[]>()

    comments.forEach((comment) => {
      const list = map.get(comment.step_id) || []
      list.push(comment)
      map.set(comment.step_id, list)
    })

    return map
  }, [comments])

  const supportersByTask = useMemo(() => {
    const map = new Map<string, TaskSupporter[]>()

    supporters.forEach((supporter) => {
      const list = map.get(supporter.task_id) || []
      list.push(supporter)
      map.set(supporter.task_id, list)
    })

    return map
  }, [supporters])

  const reportsByTask = useMemo(() => {
    const map = new Map<string, TaskReport[]>()

    reports.forEach((report) => {
      const list = map.get(report.task_id) || []
      list.push(report)
      map.set(report.task_id, list)
    })

    return map
  }, [reports])

  const tasksByParent = useMemo(() => {
    const map = new Map<string, Task[]>()

    tasks.forEach((task) => {
      if (!task.parent_task_id) return
      const list = map.get(task.parent_task_id) || []
      list.push(task)
      map.set(task.parent_task_id, list)
    })

    return map
  }, [tasks])

  const workstreams = tasks.filter((task) => {
    const isWorkstream = task.task_level === 'workstream' || !task.parent_task_id
    const matchProject = selectedProjectId === 'all' || task.project_id === selectedProjectId
    return isWorkstream && matchProject
  })

  const selectedWorkstream = workstreams.find((task) => task.id === selectedWorkstreamId) || workstreams[0]
  const selectedSubtasks = selectedWorkstream ? tasksByParent.get(selectedWorkstream.id) || [] : []

  const projectCards = projects.map((project) => {
    const projectWorkstreams = tasks.filter(
      (task) =>
        task.project_id === project.id &&
        (task.task_level === 'workstream' || !task.parent_task_id)
    )

    const projectTasks = tasks.filter((task) => task.project_id === project.id)

    return {
      ...project,
      total: projectTasks.length,
      done: projectTasks.filter((task) => task.status === 'completed').length,
      overdue: projectTasks.filter((task) => isTaskOverdue(task)).length,
      problem: projectTasks.filter((task) => isTaskProblem(task)).length,
      rate: calculateProjectProgress(projectWorkstreams, tasksByParent, stepsByTask),
      health: calculateProjectHealth(project.id, tasks, steps, stepsByTask),
    }
  })

  const peopleReports = employees.map((employee) => {
    const ownedTasks = tasks.filter((task) => task.assignee_id === employee.id || task.head_id === employee.id)
    const done = ownedTasks.filter((task) => task.status === 'completed').length

    return {
      employee,
      total: ownedTasks.length,
      done,
      doing: ownedTasks.filter((task) => task.status === 'in_progress').length,
      pending: ownedTasks.filter((task) => task.status === 'pending').length,
      overdue: ownedTasks.filter((task) => isTaskOverdue(task)).length,
      problem: ownedTasks.filter((task) => isTaskProblem(task)).length,
      rate: ownedTasks.length === 0 ? 0 : Math.round((done / ownedTasks.length) * 100),
    }
  })

  const urgentTasks = tasks
    .filter((task) => isTaskOverdue(task) || isTaskProblem(task) || isTaskSlow(task, stepsByTask.get(task.id) || []))
    .slice(0, 20)

  const visibleTasks = useMemo(
    () => filterTasksByRole(currentEmployee, tasks, supporters, steps),
    [currentEmployee, tasks, supporters, steps]
  )

  const visibleProjects = useMemo(() => {
    if (!currentEmployee?.id) return projects
    const role = currentEmployee.role || 'employee'
    if (role === 'ceo' || role === 'coo') return projects
    if (role === 'admin' && currentEmployee.can_view_all) return projects
    const visibleProjectIds = new Set(visibleTasks.map((t) => t.project_id).filter(Boolean))
    return projects.filter(
      (p) => visibleProjectIds.has(p.id) || p.owner_id === currentEmployee.id
    )
  }, [currentEmployee, projects, visibleTasks])

  const canManageAll =
    currentEmployee?.role === 'ceo' ||
    currentEmployee?.role === 'coo' ||
    (currentEmployee?.role === 'admin' && Boolean(currentEmployee?.can_manage_users))

  const allMenuItems: { key: ViewKey; label: string; icon: string; adminOnly?: boolean }[] = [
    { key: 'dashboard', label: 'Thống kê', icon: '📊' },
    { key: 'coo', label: 'COO Board', icon: '🧭' },
    { key: 'projects', label: 'Dự án', icon: '📁' },
    { key: 'tasks', label: 'Công việc', icon: '✅' },
    { key: 'meeting', label: 'Biên bản họp', icon: '📄' },
    { key: 'assistant', label: 'COO Assistant', icon: '🤖' },
    { key: 'admin', label: 'Quản lý nhân sự', icon: '👥', adminOnly: true },
  ]
  const menu = allMenuItems.filter((item) => !item.adminOnly || canManageAll)

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F6F9]">
        <div className="text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0F172A] text-2xl font-extrabold text-white mx-auto">
            V
          </div>
          <p className="text-sm font-bold text-[#64748B]">Đang xác thực...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#F4F6F9] text-[#0F172A]">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 h-screen bg-[#0F172A] text-white transition-all duration-200
          ${mobileNavOpen ? 'w-[260px]' : 'w-0 overflow-hidden'}
          md:w-[64px] md:overflow-visible ${collapsed ? 'md:w-[64px]' : 'md:w-[240px]'}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-center border-b border-white/10 p-3 md:justify-between md:p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1B4FD8] font-extrabold">
                V
              </div>
              {!collapsed && (
                <div className="hidden md:block">
                  <h1 className="text-sm font-extrabold">VyVy WorkOS</h1>
                  <p className="text-[11px] text-slate-400">COO Operating System</p>
                </div>
              )}
            </div>

            <button type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="hidden rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 md:block"
            >
              {collapsed ? '›' : '‹'}
            </button>
          </div>

          <nav className="flex-1 space-y-1 p-2 md:p-3">
            {menu.map((item) => (
              <button type="button"
                key={item.key}
                onClick={() => { setView(item.key); setMobileNavOpen(false) }}
                title={item.label}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold justify-start ${
                  view === item.key ? 'bg-[#1B4FD8] text-white' : 'text-slate-300 hover:bg-white/10'
                } md:justify-start`}
              >
                <span className="shrink-0 text-base">{item.icon}</span>
                <span className={`${collapsed ? 'md:hidden' : ''}`}>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="border-t border-white/10 p-2 md:p-3 space-y-1">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2 md:p-3">
              <Avatar name={currentEmployee?.full_name || '?'} />
              <div className={`min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
                <p className="truncate text-sm font-bold">{currentEmployee?.full_name || 'Người dùng'}</p>
                <p className="text-[11px] text-slate-400 capitalize">
                  {currentEmployee?.role === 'ceo' ? 'CEO'
                    : currentEmployee?.role === 'coo' ? 'COO'
                    : currentEmployee?.role === 'admin' ? 'Admin'
                    : currentEmployee?.role === 'department_head' ? 'Trưởng bộ phận'
                    : currentEmployee?.position || 'Nhân viên'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { logout(); setMobileNavOpen(false) }}
              title="Đăng xuất"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <span className="shrink-0">⎋</span>
              <span className={collapsed ? 'md:hidden' : ''}>Đăng xuất</span>
            </button>
          </div>
        </div>
      </aside>

      <section className={`min-h-screen min-w-0 md:ml-[64px] ${collapsed ? 'md:ml-[64px]' : 'md:ml-[240px]'}`}>
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] bg-white px-3 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg p-2 text-[#0F172A] hover:bg-[#F1F5F9] md:hidden"
              aria-label="Mở menu"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <div className="min-w-0">
            <h2 className="text-base font-extrabold sm:text-lg">
              {view === 'dashboard' && 'Thống kê vận hành'}
              {view === 'coo' && 'COO Board'}
              {view === 'projects' && 'Tổng dự án'}
              {view === 'tasks' && 'Quản lý công việc'}
              {view === 'meeting' && 'Nhập biên bản họp'}
              {view === 'assistant' && 'COO Assistant'}
              {view === 'admin' && 'Quản lý nhân sự'}
            </h2>
            <p className="hidden text-xs text-[#64748B] sm:block">
              Dự án → Đầu việc lớn → Đầu việc con → Bước duyệt → File báo cáo.
            </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div
              title={realtimeStatus === 'live' ? 'Đang đồng bộ tự động' : realtimeStatus === 'connecting' ? 'Đang kết nối...' : 'Mất kết nối realtime'}
              className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:flex
                ${realtimeStatus === 'live' ? 'bg-emerald-50 text-emerald-700' :
                  realtimeStatus === 'connecting' ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-700'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${realtimeStatus === 'live' ? 'animate-pulse bg-emerald-500' : realtimeStatus === 'connecting' ? 'bg-amber-400' : 'bg-red-400'}`} />
              {realtimeStatus === 'live' ? 'Live' : realtimeStatus === 'connecting' ? 'Đang kết nối' : 'Offline'}
            </div>
            <button type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-[#1B4FD8] px-3 py-2 text-sm font-extrabold text-white sm:px-4"
            >
              + Tạo mới
            </button>
          </div>
        </header>

        <div className="p-3 sm:p-6">
          {loading ? (
            <DashboardSkeleton />
          ) : (
            <>
              {view === 'dashboard' && (
                <DashboardView
                  tasks={visibleTasks}
                  steps={steps}
                  urgentTasks={urgentTasks}
                  projectCards={projectCards}
                  peopleReports={peopleReports}
                  employeeMap={employeeMap}
                  projectMap={projectMap}
                  setView={setView}
                  setSelectedProjectId={setSelectedProjectId}
                  setSelectedTask={setSelectedTask}
                />
              )}

              {view === 'coo' && (
                <CooBoard
                  projects={visibleProjects}
                  workstreams={workstreams}
                  selectedProjectId={selectedProjectId}
                  setSelectedProjectId={setSelectedProjectId}
                  selectedWorkstream={selectedWorkstream}
                  setSelectedWorkstreamId={setSelectedWorkstreamId}
                  selectedSubtasks={selectedSubtasks}
                  stepsByTask={stepsByTask}
                  commentsByStep={commentsByStep}
                  supportersByTask={supportersByTask}
                  reportsByTask={reportsByTask}
                  tasksByParent={tasksByParent}
                  employees={employees}
                  departments={departments}
                  employeeMap={employeeMap}
                  departmentMap={departmentMap}
                  projectMap={projectMap}
                  setSelectedTask={setSelectedTask}
                  openSubtaskForm={openSubtaskForm}
                  subtaskOpenFor={subtaskOpenFor}
                  setSubtaskOpenFor={setSubtaskOpenFor}
                  subtaskForm={subtaskForm}
                  setSubtaskForm={setSubtaskForm}
                  createSubtask={createSubtask}
                  openStepForm={openStepForm}
                  stepOpenFor={stepOpenFor}
                  setStepOpenFor={setStepOpenFor}
                  stepForm={stepForm}
                  setStepForm={setStepForm}
                  createStep={createStep}
                  updateTaskStatus={updateTaskStatus}
                  updateIssueStatus={updateIssueStatus}
                  updateStep={updateStep}
                  submitStep={submitStep}
                  approveStep={approveCurrentStage}
                  requestRevision={requestRevision}
                  revisionDrafts={revisionDrafts}
                  setRevisionDrafts={setRevisionDrafts}
                  linkDrafts={linkDrafts}
                  setLinkDrafts={setLinkDrafts}
                  saveStepLink={saveStepLink}
                  supportDrafts={supportDrafts}
                  setSupportDrafts={setSupportDrafts}
                  saveSupportRequest={saveSupportRequest}
                  commentDrafts={commentDrafts}
                  setCommentDrafts={setCommentDrafts}
                  addComment={addComment}
                  uploadStepFile={uploadStepFile}
                  deleteTask={deleteTask}
                  deleteStep={deleteStep}
                  deleteSupporter={deleteSupporter}
                  clearStepFile={clearStepFile}
                  supporterDrafts={supporterDrafts}
                  setSupporterDrafts={setSupporterDrafts}
                  createSupporter={createSupporter}
                  getStatusLabel={getStatusLabel}
                />
              )}

              {view === 'projects' && (
                <ProjectsView
                  projectCards={projectCards.filter((p) => visibleProjects.some((vp) => vp.id === p.id))}
                  tasks={visibleTasks}
                  setView={setView}
                  setSelectedProjectId={setSelectedProjectId}
                  setSelectedTask={setSelectedTask}
                  deleteProject={deleteProject}
                />
              )}

              {view === 'tasks' && (
                <TasksView
                  tasks={visibleTasks}
                  employeeMap={employeeMap}
                  projectMap={projectMap}
                  setSelectedTask={setSelectedTask}
                  updateTaskStatus={updateTaskStatus}
                  getStatusLabel={getStatusLabel}
                />
              )}

              {view === 'meeting' && (
                <MeetingView
                  meetingTitle={meetingTitle}
                  setMeetingTitle={setMeetingTitle}
                  meetingRaw={meetingRaw}
                  setMeetingRaw={setMeetingRaw}
                  notexProjectName={notexProjectName}
                  setNotexProjectName={setNotexProjectName}
                  notexRows={notexRows}
                  setNotexRows={setNotexRows}
                  departments={departments}
                  employees={employees}
                  importing={importing}
                  handleMeetingFile={handleMeetingFile}
                  splitNotexRows={splitNotexRows}
                  importNotexRows={importNotexRows}
                  saveMeeting={saveMeeting}
                />
              )}

              {view === 'assistant' && (
                <AssistantView
                  assistantOutput={assistantOutput}
                  generateDailyReport={generateDailyReport}
                  generateFollowUpReport={generateFollowUpReport}
                  generatePendingApprovalReport={generatePendingApprovalReport}
                  generateRevisionReport={generateRevisionReport}
                  generateMissingReportFileReport={generateMissingReportFileReport}
                  generatePeopleReport={generatePeopleReport}
                  generateProjectReport={generateProjectReport}
                />
              )}

              {view === 'admin' && canManageAll && (
                <AdminUsersView
                  departments={departments}
                  onRefresh={fetchAll}
                />
              )}
            </>
          )}
        </div>
      </section>

      <CreatePanel
        open={createOpen}
        setOpen={setCreateOpen}
        tab={createTab}
        setTab={setCreateTab}
        projects={projects}
        departments={departments}
        employees={employees}
        saving={saving}
        projectName={projectName}
        setProjectName={setProjectName}
        projectCode={projectCode}
        setProjectCode={setProjectCode}
        projectDesc={projectDesc}
        setProjectDesc={setProjectDesc}
        projectOwnerId={projectOwnerId}
        setProjectOwnerId={setProjectOwnerId}
        projectDepartmentId={projectDepartmentId}
        setProjectDepartmentId={setProjectDepartmentId}
        createProject={createProject}
        workTitle={workTitle}
        setWorkTitle={setWorkTitle}
        workDesc={workDesc}
        setWorkDesc={setWorkDesc}
        workProjectId={workProjectId}
        setWorkProjectId={setWorkProjectId}
        workDepartmentId={workDepartmentId}
        setWorkDepartmentId={setWorkDepartmentId}
        workHeadId={workHeadId}
        setWorkHeadId={setWorkHeadId}
        workAssigneeId={workAssigneeId}
        setWorkAssigneeId={setWorkAssigneeId}
        workDueDate={workDueDate}
        setWorkDueDate={setWorkDueDate}
        workPriority={workPriority}
        setWorkPriority={setWorkPriority}
        createWorkstream={createWorkstream}
      />

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          employeeMap={employeeMap}
          departmentMap={departmentMap}
          projectMap={projectMap}
          steps={stepsByTask.get(selectedTask.id) || []}
          reports={reportsByTask.get(selectedTask.id) || []}
          close={() => setSelectedTask(null)}
          uploadTaskFile={uploadTaskFile}
          deleteTaskReport={deleteTaskReport}
          uploading={uploading}
          getStatusLabel={getStatusLabel}
        />
      )}

      {/* Confirm dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4" onClick={() => answerConfirm(false)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-lg">⚠️</div>
            <p className="text-sm font-bold text-[#0F172A]">{confirmState.message}</p>
            <p className="mt-1 text-xs text-[#64748B]">Hành động này không thể hoàn tác.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button"
                onClick={() => answerConfirm(false)}
                className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-bold"
              >
                Hủy
              </button>
              <button type="button"
                onClick={() => answerConfirm(true)}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-extrabold text-white"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-enter pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg
              transition-all duration-300 max-w-[340px]
              ${t.type === 'error' ? 'bg-red-600 text-white' :
                t.type === 'warning' ? 'bg-amber-500 text-white' :
                t.type === 'info' ? 'bg-blue-600 text-white' :
                'bg-emerald-600 text-white'}`}
          >
            <span className="shrink-0 mt-0.5">
              {t.type === 'error' ? '✕' : t.type === 'warning' ? '⚠' : t.type === 'info' ? 'ℹ' : '✓'}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </main>
  )
}

function DashboardView(props: {
  tasks: Task[]
  steps: TaskStep[]
  urgentTasks: Task[]
  projectCards: ProjectCard[]
  peopleReports: Array<{ employee: Employee; total: number; done: number; doing: number; pending: number; overdue: number; problem: number; rate: number }>
  employeeMap: Map<string, Employee>
  projectMap: Map<string, Project>
  setView: (view: ViewKey) => void
  setSelectedProjectId: (id: string) => void
  setSelectedTask: (task: Task) => void
}) {
  const total = props.tasks.length
  const done = props.tasks.filter((task) => task.status === 'completed').length
  const doing = props.tasks.filter((task) => task.status === 'in_progress').length
  const pending = props.tasks.filter((task) => task.status === 'pending').length
  const overdue = props.tasks.filter((task) => isTaskOverdue(task)).length
  const attentionProjects = props.projectCards.filter((project) => project.health.level !== 'normal')
  const pendingSteps = getPendingApprovalSteps(props.steps)
  const revisionSteps = getRevisionSteps(props.steps)
  const missingReportSteps = getMissingReportSteps(props.steps)
  const statusRows = [
    {
      label: 'Chưa bắt đầu',
      count: props.tasks.filter((task) => task.status === 'not_started').length,
      color: 'bg-slate-500',
    },
    {
      label: 'Đang làm',
      count: doing,
      color: 'bg-blue-600',
    },
    {
      label: 'Pending',
      count: pending,
      color: 'bg-purple-600',
    },
    {
      label: 'Hoàn thành',
      count: done,
      color: 'bg-emerald-600',
    },
    {
      label: 'Trễ deadline',
      count: overdue,
      color: 'bg-red-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Tổng đầu việc" value={total} icon="📋" tone="blue" />
        <MetricCard label="Hoàn thành" value={done} icon="✅" tone="green" />
        <MetricCard label="Đang làm" value={doing} icon="🔵" tone="blue" />
        <MetricCard label="Pending" value={pending} icon="🟣" tone="purple" />
        <MetricCard label="Trễ deadline" value={overdue} icon="🔴" tone="red" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card>
            <h3 className="mb-4 text-lg font-extrabold">Tỷ lệ trạng thái công việc</h3>
            <div className="space-y-4">
              {statusRows.map((row) => (
                <StatusDistributionRow
                  key={row.label}
                  label={row.label}
                  count={row.count}
                  total={total}
                  color={row.color}
                />
              ))}
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-extrabold">Báo cáo theo dự án</h3>
              <span className="text-sm font-bold text-[#64748B]">{props.projectCards.length} dự án</span>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {props.projectCards.map((project) => (
                <button type="button"
                  key={project.id}
                  onClick={() => {
                    props.setSelectedProjectId(project.id)
                    props.setView('coo')
                  }}
                  className="rounded-xl border border-[#E2E8F0] bg-white p-4 text-left hover:shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold">{project.name}</p>
                      <p className="mt-1 text-sm text-[#64748B]">{project.total} việc</p>
                    </div>
                    <div className="text-right">
                      <ProjectHealthBadge health={project.health} />
                      <p className="mt-2 text-2xl font-extrabold text-[#1B4FD8]">{project.rate}%</p>
                    </div>
                  </div>

                  <ProgressBar value={project.rate} />

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="Tổng" value={project.total} />
                    <MiniStat label="Trễ" value={project.overdue} danger />
                    <MiniStat label="Vấn đề" value={project.problem} danger />
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="mb-4 text-lg font-extrabold">Khối lượng công việc theo nhân sự</h3>
            <div className="space-y-3">
              {props.peopleReports.map((row) => {
                const needsAttention = row.overdue > 0 || row.problem > 0

                return (
                  <div
                    key={row.employee.id}
                    className={`rounded-xl border border-[#E2E8F0] p-4 ${needsAttention ? 'bg-red-50/70' : 'bg-white'}`}
                  >
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_1fr_160px]">
                      <div>
                        <p className="text-base font-extrabold text-[#0F172A]">{row.employee.full_name}</p>
                        <p className="mt-1 text-xs font-bold uppercase text-[#94A3B8]">Nhân sự phụ trách</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                        <MiniStat label="Tổng" value={row.total} />
                        <MiniStat label="Hoàn thành" value={row.done} />
                        <MiniStat label="Đang làm" value={row.doing} />
                        <MiniStat label="Pending" value={row.pending} />
                        <MiniStat label="Trễ" value={row.overdue} danger />
                        <MiniStat label="Vấn đề" value={row.problem} danger />
                      </div>

                      <div className="flex flex-col justify-center">
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="font-bold text-[#64748B]">Tỷ lệ</span>
                          <span className="font-extrabold text-[#1B4FD8]">{row.rate}%</span>
                        </div>
                        <ProgressBar value={row.rate} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="mb-4 text-lg font-extrabold">Dự án cần chú ý</h3>
            <div className="space-y-3">
              {attentionProjects.length === 0 ? (
                <EmptyState title="Không có cảnh báo" description="Tất cả dự án đang ổn." />
              ) : (
                attentionProjects.map((project) => (
                  <button type="button"
                    key={project.id}
                    onClick={() => {
                      props.setSelectedProjectId(project.id)
                      props.setView('coo')
                    }}
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white p-4 text-left hover:shadow-md"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-extrabold">{project.name}</p>
                        <p className="mt-1 text-sm font-bold text-[#64748B]">
                          {project.health.totalWarnings} cảnh báo
                        </p>
                      </div>
                      <ProjectHealthBadge health={project.health} />
                    </div>
                    <ProjectHealthSummary health={project.health} />
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card>
            <h3 className="mb-4 text-lg font-extrabold">Việc cần hối thúc</h3>
            <div className="space-y-3">
              {props.urgentTasks.length === 0 ? (
                <EmptyState title="Không có cảnh báo" description="Hiện chưa có việc cần hối thúc." />
              ) : (
                props.urgentTasks.map((task) => {
                  const person = props.employeeMap.get(task.assignee_id || task.head_id || '')
                  const project = props.projectMap.get(task.project_id || '')

                  return (
                    <button type="button"
                      key={task.id}
                      onClick={() => props.setSelectedTask(task)}
                      className="w-full rounded-xl border border-red-100 bg-red-50/70 p-4 text-left hover:bg-red-50"
                    >
                      <p className="font-extrabold">{task.title}</p>
                      <p className="mt-1 text-sm text-[#64748B]">
                        {person?.full_name || 'Chưa gắn người'} · {project?.name || 'Chưa gắn dự án'}
                      </p>
                      <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-red-600">
                        {getUrgentReason(task)}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold">Việc chờ duyệt / cần làm lại</h3>
                <p className="mt-1 text-sm text-[#64748B]">
                  {pendingSteps.length} chờ duyệt · {revisionSteps.length} cần làm lại
                </p>
              </div>
            </div>

            <DashboardStepList
              title="Chờ duyệt"
              steps={pendingSteps.slice(0, 5)}
              tasks={props.tasks}
              emptyText="Không có bước chờ duyệt."
            />

            <div className="mt-4">
              <DashboardStepList
                title="Cần làm lại"
                steps={revisionSteps.slice(0, 5)}
                tasks={props.tasks}
                emptyText="Không có bước cần làm lại."
              />
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-extrabold">Bước thiếu báo cáo</h3>
            <p className="mt-1 text-sm text-[#64748B]">{missingReportSteps.length} bước chưa có file hoặc link</p>

            <div className="mt-4">
              <DashboardStepList
                title="Thiếu báo cáo"
                steps={missingReportSteps.slice(0, 5)}
                tasks={props.tasks}
                emptyText="Không có bước thiếu báo cáo."
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function CooBoard(props: {
  projects: Project[]
  workstreams: Task[]
  selectedProjectId: string
  setSelectedProjectId: (id: string) => void
  selectedWorkstream?: Task
  setSelectedWorkstreamId: (id: string) => void
  selectedSubtasks: Task[]
  stepsByTask: Map<string, TaskStep[]>
  commentsByStep: Map<string, StepComment[]>
  supportersByTask: Map<string, TaskSupporter[]>
  reportsByTask: Map<string, TaskReport[]>
  tasksByParent: Map<string, Task[]>
  employees: Employee[]
  departments: Department[]
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  projectMap: Map<string, Project>
  setSelectedTask: (task: Task) => void
  openSubtaskForm: (task: Task) => void
  subtaskOpenFor: string
  setSubtaskOpenFor: (value: string) => void
  subtaskForm: SubtaskForm
  setSubtaskForm: (value: SubtaskForm) => void
  createSubtask: (parent: Task) => void
  openStepForm: (task: Task) => void
  stepOpenFor: string
  setStepOpenFor: (value: string) => void
  stepForm: StepForm
  setStepForm: (value: StepForm) => void
  createStep: (taskId: string) => void
  updateTaskStatus: (taskId: string, status: string) => void
  updateIssueStatus: (taskId: string, status: string) => void
  updateStep: (step: TaskStep, patch: Partial<TaskStep>) => void
  submitStep: (step: TaskStep) => void
  approveStep: (step: TaskStep) => void
  requestRevision: (step: TaskStep) => void
  revisionDrafts: Record<string, string>
  setRevisionDrafts: (value: Record<string, string>) => void
  linkDrafts: Record<string, string>
  setLinkDrafts: (value: Record<string, string>) => void
  saveStepLink: (step: TaskStep) => void
  supportDrafts: Record<string, string>
  setSupportDrafts: (value: Record<string, string>) => void
  saveSupportRequest: (step: TaskStep) => void
  commentDrafts: Record<string, string>
  setCommentDrafts: (value: Record<string, string>) => void
  addComment: (stepId: string) => void
  uploadStepFile: (step: TaskStep, file?: File) => void
  deleteTask: (task: Task) => void
  deleteStep: (step: TaskStep) => void
  deleteSupporter: (supporter: TaskSupporter) => void
  clearStepFile: (step: TaskStep) => void
  supporterDrafts: Record<string, string>
  setSupporterDrafts: (value: Record<string, string>) => void
  createSupporter: (taskId: string) => void
  getStatusLabel: (status: string) => string
}) {
  const selected = props.selectedWorkstream
  const selectedProgress = selected
    ? calculateWorkstreamProgress(selected, props.tasksByParent, props.stepsByTask)
    : 0

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">
      <Card>
        <div className="mb-4">
          <h3 className="text-lg font-extrabold">Đầu việc lớn</h3>
          <p className="text-sm text-[#64748B]">Chọn dự án và đầu việc lớn để xem chi tiết.</p>
        </div>

        <select
          className="mb-4 h-11 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm outline-none"
          value={props.selectedProjectId}
          onChange={(event) => props.setSelectedProjectId(event.target.value)}
        >
          <option value="all">Tất cả dự án</option>
          {props.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <div className="space-y-3">
          {props.workstreams.length === 0 ? (
            <EmptyState title="Chưa có đầu việc lớn" description="Bấm + Tạo mới để thêm dự án hoặc đầu việc." />
          ) : (
            props.workstreams.map((task) => {
              const head = props.employeeMap.get(task.head_id || task.assignee_id || '')
              const active = task.id === selected?.id
              const progress = calculateWorkstreamProgress(task, props.tasksByParent, props.stepsByTask)

              return (
                <div
                  key={task.id}
                  className={`w-full rounded-2xl border p-4 text-left hover:shadow-md ${
                    active ? 'border-[#1B4FD8] bg-[#E6F1FB]' : 'border-[#E2E8F0] bg-white'
                  }`}
                >
                  <button type="button"
                    onClick={() => props.setSelectedWorkstreamId(task.id)}
                    className="block w-full text-left"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-extrabold">{task.title}</p>
                      <IssueBadge issueStatus={task.issue_status} />
                    </div>

                    <p className="text-sm text-[#64748B]">
                      Head: {head?.full_name || 'Chưa gắn'} · Deadline: {task.due_date || 'Chưa có'}
                    </p>

                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs font-bold">
                        <span>Tiến độ</span>
                        <span>{progress}%</span>
                      </div>
                      <ProgressBar value={progress} />
                    </div>
                  </button>

                  <div className="mt-3 flex justify-end">
                    <button type="button"
                      onClick={() => props.deleteTask(task)}
                      className="rounded-lg bg-red-50 px-3 py-1 text-xs font-bold text-red-600"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>

      <div className="space-y-6">
        {!selected ? (
          <Card>
            <EmptyState title="Chưa chọn đầu việc lớn" description="Chọn một đầu việc lớn ở cột bên trái." />
          </Card>
        ) : (
          <>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h3 className="text-2xl font-extrabold">{selected.title}</h3>
                    <IssueBadge issueStatus={selected.issue_status} />
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">
                      {selectedProgress}%
                    </span>
                  </div>

                  <p className="max-w-3xl text-sm leading-6 text-[#64748B]">
                    {selected.description || 'Chưa có mô tả.'}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    <InfoPill label="Dự án" value={props.projectMap.get(selected.project_id || '')?.name || 'Chưa gắn'} />
                    <InfoPill label="Phòng ban" value={props.departmentMap.get(selected.department_id || '')?.name || 'Chưa gắn'} />
                    <InfoPill label="Head" value={props.employeeMap.get(selected.head_id || selected.assignee_id || '')?.full_name || 'Chưa gắn'} />
                    <InfoPill label="Deadline" value={selected.due_date || 'Chưa có'} />
                  </div>

                  <div className="mt-5">
                    <ProgressBar value={selectedProgress} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => props.openSubtaskForm(selected)}
                    className="rounded-xl bg-[#1B4FD8] px-4 py-2 text-sm font-bold text-white"
                  >
                    + Đầu việc con
                  </button>
                  <button type="button"
                    onClick={() => props.setSelectedTask(selected)}
                    className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold"
                  >
                    Chi tiết / File
                  </button>
                  <button type="button"
                    onClick={() => props.deleteTask(selected)}
                    className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-600"
                  >
                    Xóa
                  </button>
                </div>
              </div>

              {props.subtaskOpenFor === selected.id && (
                <InlineSubtaskForm
                  parent={selected}
                  form={props.subtaskForm}
                  setForm={props.setSubtaskForm}
                  departments={props.departments}
                  employees={props.employees}
                  createSubtask={props.createSubtask}
                  cancel={() => props.setSubtaskOpenFor('')}
                />
              )}
            </Card>

            <div className="space-y-4">
              {props.selectedSubtasks.length === 0 ? (
                <Card>
                  <EmptyState title="Chưa có đầu việc con" description="Bấm + Đầu việc con để tạo." />
                </Card>
              ) : (
                props.selectedSubtasks.map((task) => (
                  <SubtaskCard
                    key={task.id}
                    task={task}
                    steps={props.stepsByTask.get(task.id) || []}
                    commentsByStep={props.commentsByStep}
                    supporters={props.supportersByTask.get(task.id) || []}
                    reports={props.reportsByTask.get(task.id) || []}
                    employees={props.employees}
                    employeeMap={props.employeeMap}
                    departmentMap={props.departmentMap}
                    setSelectedTask={props.setSelectedTask}
                    openStepForm={props.openStepForm}
                    stepOpenFor={props.stepOpenFor}
                    setStepOpenFor={props.setStepOpenFor}
                    stepForm={props.stepForm}
                    setStepForm={props.setStepForm}
                    createStep={props.createStep}
                    updateTaskStatus={props.updateTaskStatus}
                    updateIssueStatus={props.updateIssueStatus}
                    updateStep={props.updateStep}
                    submitStep={props.submitStep}
                    approveStep={props.approveStep}
                    requestRevision={props.requestRevision}
                    revisionDrafts={props.revisionDrafts}
                    setRevisionDrafts={props.setRevisionDrafts}
                    linkDrafts={props.linkDrafts}
                    setLinkDrafts={props.setLinkDrafts}
                    saveStepLink={props.saveStepLink}
                    supportDrafts={props.supportDrafts}
                    setSupportDrafts={props.setSupportDrafts}
                    saveSupportRequest={props.saveSupportRequest}
                    commentDrafts={props.commentDrafts}
                    setCommentDrafts={props.setCommentDrafts}
                    addComment={props.addComment}
                    uploadStepFile={props.uploadStepFile}
                    deleteTask={props.deleteTask}
                    deleteStep={props.deleteStep}
                    deleteSupporter={props.deleteSupporter}
                    clearStepFile={props.clearStepFile}
                    supporterDrafts={props.supporterDrafts}
                    setSupporterDrafts={props.setSupporterDrafts}
                    createSupporter={props.createSupporter}
                    getStatusLabel={props.getStatusLabel}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function InlineSubtaskForm(props: {
  parent: Task
  form: SubtaskForm
  setForm: (value: SubtaskForm) => void
  departments: Department[]
  employees: Employee[]
  createSubtask: (parent: Task) => void
  cancel: () => void
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <h4 className="mb-3 font-extrabold">Tạo đầu việc con</h4>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Input
          placeholder="Tên đầu việc con"
          value={props.form.title}
          onChange={(value) => props.setForm({ ...props.form, title: value })}
        />
        <Input
          placeholder="Mô tả"
          value={props.form.description}
          onChange={(value) => props.setForm({ ...props.form, description: value })}
        />
        <Select
          value={props.form.departmentId}
          onChange={(value) => props.setForm({ ...props.form, departmentId: value })}
        >
          <option value="">Chọn phòng ban</option>
          {props.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
        <Select
          value={props.form.headId}
          onChange={(value) => props.setForm({ ...props.form, headId: value })}
        >
          <option value="">Chọn Head</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>
        <Select
          value={props.form.assigneeId}
          onChange={(value) => props.setForm({ ...props.form, assigneeId: value })}
        >
          <option value="">Chọn người phụ trách</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>
        <input
          type="date"
          className="h-12 rounded-2xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none"
          value={props.form.dueDate}
          onChange={(event) => props.setForm({ ...props.form, dueDate: event.target.value })}
        />
        <Select
          value={props.form.priority}
          onChange={(value) => props.setForm({ ...props.form, priority: value })}
        >
          <option value="low">Ưu tiên thấp</option>
          <option value="medium">Ưu tiên trung bình</option>
          <option value="high">Ưu tiên cao</option>
        </Select>
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button"
          onClick={() => props.createSubtask(props.parent)}
          className="rounded-xl bg-[#1B4FD8] px-4 py-2 text-sm font-extrabold text-white"
        >
          Lưu đầu việc con
        </button>
        <button type="button"
          onClick={props.cancel}
          className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold"
        >
          Hủy
        </button>
      </div>
    </div>
  )
}

function SubtaskCard(props: {
  task: Task
  steps: TaskStep[]
  commentsByStep: Map<string, StepComment[]>
  supporters: TaskSupporter[]
  reports: TaskReport[]
  employees: Employee[]
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  setSelectedTask: (task: Task) => void
  openStepForm: (task: Task) => void
  stepOpenFor: string
  setStepOpenFor: (value: string) => void
  stepForm: StepForm
  setStepForm: (value: StepForm) => void
  createStep: (taskId: string) => void
  updateTaskStatus: (taskId: string, status: string) => void
  updateIssueStatus: (taskId: string, status: string) => void
  updateStep: (step: TaskStep, patch: Partial<TaskStep>) => void
  submitStep: (step: TaskStep) => void
  approveStep: (step: TaskStep) => void
  requestRevision: (step: TaskStep) => void
  revisionDrafts: Record<string, string>
  setRevisionDrafts: (value: Record<string, string>) => void
  linkDrafts: Record<string, string>
  setLinkDrafts: (value: Record<string, string>) => void
  saveStepLink: (step: TaskStep) => void
  supportDrafts: Record<string, string>
  setSupportDrafts: (value: Record<string, string>) => void
  saveSupportRequest: (step: TaskStep) => void
  commentDrafts: Record<string, string>
  setCommentDrafts: (value: Record<string, string>) => void
  addComment: (stepId: string) => void
  uploadStepFile: (step: TaskStep, file?: File) => void
  deleteTask: (task: Task) => void
  deleteStep: (step: TaskStep) => void
  deleteSupporter: (supporter: TaskSupporter) => void
  clearStepFile: (step: TaskStep) => void
  supporterDrafts: Record<string, string>
  setSupporterDrafts: (value: Record<string, string>) => void
  createSupporter: (taskId: string) => void
  getStatusLabel: (status: string) => string
}) {
  const head = props.employeeMap.get(props.task.head_id || props.task.assignee_id || '')
  const department = props.departmentMap.get(props.task.department_id || '')
  const progress = calculateTaskProgress(props.task, props.steps)
  const slow = isTaskSlow(props.task, props.steps)
  const overdue = isTaskOverdue(props.task)
  const problem = isTaskProblem(props.task)

  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${overdue || problem ? 'border-red-200' : 'border-[#E2E8F0]'}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-extrabold">{props.task.title}</h4>
            <StatusBadge status={props.task.status} label={props.getStatusLabel(props.task.status)} />
            <IssueBadge issueStatus={props.task.issue_status} />
            {slow && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Chậm tiến độ</span>}
            {overdue && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">Quá hạn</span>}
          </div>

          <p className="text-sm text-[#64748B]">
            Head: <b>{head?.full_name || 'Chưa gắn'}</b> · Phòng ban:{' '}
            <b>{department?.name || 'Chưa gắn'}</b> · Deadline:{' '}
            <b>{props.task.due_date || 'Chưa có'}</b>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            className="h-10 rounded-xl border border-[#E2E8F0] px-2 text-xs font-bold"
            value={props.task.status}
            onChange={(event) => props.updateTaskStatus(props.task.id, event.target.value)}
          >
            <option value="not_started">Chưa bắt đầu</option>
            <option value="in_progress">Đang làm</option>
            <option value="pending">Pending</option>
            <option value="completed">Hoàn thành</option>
            <option value="overdue">Trễ deadline</option>
          </select>

          <select
            className="h-10 rounded-xl border border-[#E2E8F0] px-2 text-xs font-bold"
            value={props.task.issue_status || 'normal'}
            onChange={(event) => props.updateIssueStatus(props.task.id, event.target.value)}
          >
            <option value="normal">Bình thường</option>
            <option value="watch">Cần theo dõi</option>
            <option value="slow">Đang chậm</option>
            <option value="problem">Có vấn đề</option>
          </select>

          <button type="button"
            onClick={() => props.setSelectedTask(props.task)}
            className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs font-bold"
          >
            Chi tiết / File
          </button>

          <button type="button"
            onClick={() => props.deleteTask(props.task)}
            className="h-10 rounded-xl bg-red-50 px-3 text-xs font-bold text-red-600"
          >
            Xóa
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-bold">Tiến độ theo bước đã duyệt</span>
          <span className="font-extrabold text-[#1B4FD8]">{progress}%</span>
        </div>
        <ProgressBar value={progress} />
      </div>

      <div className="rounded-2xl bg-[#F8FAFC] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-extrabold">Các bước thực hiện & duyệt</p>
          <button type="button"
            onClick={() => props.openStepForm(props.task)}
            className="rounded-lg bg-white px-3 py-1 text-xs font-bold"
          >
            + Bước
          </button>
        </div>

        {props.stepOpenFor === props.task.id && (
          <InlineStepForm
            taskId={props.task.id}
            form={props.stepForm}
            setForm={props.setStepForm}
            employees={props.employees}
            createStep={props.createStep}
            cancel={() => props.setStepOpenFor('')}
          />
        )}

        <div className="mt-3 space-y-3">
          {props.steps.length === 0 ? (
            <p className="text-sm text-[#64748B]">Chưa có bước thực hiện.</p>
          ) : (
            props.steps.map((step, index) => {
              const previousStep = index > 0 ? props.steps[index - 1] : null
              const locked = previousStep ? previousStep.approval_status !== 'approved' : false

              return (
                <StepWorkflowCard
                  key={step.id}
                  step={step}
                  locked={locked}
                  employees={props.employees}
                  employeeMap={props.employeeMap}
                  comments={props.commentsByStep.get(step.id) || []}
                  updateStep={props.updateStep}
                  submitStep={props.submitStep}
                  approveStep={props.approveStep}
                  requestRevision={props.requestRevision}
                  revisionDrafts={props.revisionDrafts}
                  setRevisionDrafts={props.setRevisionDrafts}
                  linkDrafts={props.linkDrafts}
                  setLinkDrafts={props.setLinkDrafts}
                  saveStepLink={props.saveStepLink}
                  supportDrafts={props.supportDrafts}
                  setSupportDrafts={props.setSupportDrafts}
                  saveSupportRequest={props.saveSupportRequest}
                  commentDrafts={props.commentDrafts}
                  setCommentDrafts={props.setCommentDrafts}
                  addComment={props.addComment}
                  uploadStepFile={props.uploadStepFile}
                  deleteStep={props.deleteStep}
                  clearStepFile={props.clearStepFile}
                />
              )
            })
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl bg-[#F8FAFC] p-4">
          <p className="mb-3 font-extrabold">Người hỗ trợ</p>

          <div className="mb-3 flex gap-2">
            <select
              className="h-10 flex-1 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm outline-none"
              value={props.supporterDrafts[props.task.id] || ''}
              onChange={(event) =>
                props.setSupporterDrafts({
                  ...props.supporterDrafts,
                  [props.task.id]: event.target.value,
                })
              }
            >
              <option value="">Chọn người hỗ trợ</option>
              {props.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>

            <button type="button"
              onClick={() => props.createSupporter(props.task.id)}
              className="rounded-xl bg-[#1B4FD8] px-3 text-xs font-bold text-white"
            >
              Thêm
            </button>
          </div>

          <div className="space-y-2">
            {props.supporters.length === 0 ? (
              <p className="text-sm text-[#64748B]">Chưa có người hỗ trợ.</p>
            ) : (
              props.supporters.map((supporter) => (
                <div key={supporter.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                  <div>
                    <p className="text-sm font-bold">{supporter.employees?.full_name || 'Không rõ'}</p>
                    <p className="text-xs text-[#64748B]">{supporter.role_note || 'Hỗ trợ'}</p>
                  </div>
                  <button type="button"
                    onClick={() => props.deleteSupporter(supporter)}
                    className="rounded-lg bg-red-50 px-3 py-1 text-xs font-bold text-red-600"
                  >
                    Xóa
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-[#F8FAFC] p-4">
          <p className="font-extrabold">File báo cáo đầu việc</p>
          <p className="mt-1 text-sm text-[#64748B]">{props.reports.length} file đã upload ở cấp đầu việc.</p>
        </div>
      </div>
    </div>
  )
}

function InlineStepForm(props: {
  taskId: string
  form: StepForm
  setForm: (value: StepForm) => void
  employees: Employee[]
  createStep: (taskId: string) => void
  cancel: () => void
}) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
      <h4 className="mb-3 font-extrabold">Tạo bước thực hiện</h4>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Input
          placeholder="Tên bước"
          value={props.form.title}
          onChange={(value) => props.setForm({ ...props.form, title: value })}
        />
        <Select
          value={props.form.ownerId}
          onChange={(value) => props.setForm({ ...props.form, ownerId: value })}
        >
          <option value="">Chọn người phụ trách</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>
        <Select
          value={props.form.approverId}
          onChange={(value) => props.setForm({ ...props.form, approverId: value })}
        >
          <option value="">Chọn trưởng bộ phận duyệt</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>
        <input
          type="date"
          className="h-12 rounded-2xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none"
          value={props.form.dueDate}
          onChange={(event) => props.setForm({ ...props.form, dueDate: event.target.value })}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button"
          onClick={() => props.createStep(props.taskId)}
          className="rounded-xl bg-[#1B4FD8] px-4 py-2 text-sm font-extrabold text-white"
        >
          Lưu bước
        </button>
        <button type="button"
          onClick={props.cancel}
          className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold"
        >
          Hủy
        </button>
      </div>
    </div>
  )
}

function StepWorkflowCard(props: {
  step: TaskStep
  locked: boolean
  employees: Employee[]
  employeeMap: Map<string, Employee>
  comments: StepComment[]
  updateStep: (step: TaskStep, patch: Partial<TaskStep>) => void
  submitStep: (step: TaskStep) => void
  approveStep: (step: TaskStep) => void
  requestRevision: (step: TaskStep) => void
  revisionDrafts: Record<string, string>
  setRevisionDrafts: (value: Record<string, string>) => void
  linkDrafts: Record<string, string>
  setLinkDrafts: (value: Record<string, string>) => void
  saveStepLink: (step: TaskStep) => void
  supportDrafts: Record<string, string>
  setSupportDrafts: (value: Record<string, string>) => void
  saveSupportRequest: (step: TaskStep) => void
  commentDrafts: Record<string, string>
  setCommentDrafts: (value: Record<string, string>) => void
  addComment: (stepId: string) => void
  uploadStepFile: (step: TaskStep, file?: File) => void
  deleteStep: (step: TaskStep) => void
  clearStepFile: (step: TaskStep) => void
}) {
  const owner = props.employeeMap.get(props.step.owner_id || '')
  const departmentApprover = props.employeeMap.get(props.step.department_approver_id || props.step.approver_id || '')
  const cooApprover = props.employeeMap.get(props.step.coo_approver_id || '')
  const ceoApprover = props.employeeMap.get(props.step.ceo_approver_id || '')
  const status = props.step.approval_status || 'not_submitted'
  const stage = props.step.approval_stage || 'department'
  const approvalRoute = buildApprovalRoute(props.step)
  const approveButtonLabel = getApproveButtonLabel(stage)

  return (
    <div className={`rounded-2xl border bg-white p-4 ${props.locked ? 'opacity-60' : ''}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-extrabold">
                {props.step.step_order}. {props.step.step_title}
              </p>
              <StepApprovalBadge status={status} />
              {props.locked && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                  Khóa đến khi bước trước được duyệt
                </span>
              )}
            </div>

            <p className="mt-1 text-sm text-[#64748B]">
              Phụ trách: <b>{owner?.full_name || 'Chưa gắn'}</b> · Trưởng bộ phận:{' '}
              <b>{departmentApprover?.full_name || 'Chưa gắn'}</b> · Deadline:{' '}
              <b>{props.step.due_date || 'Chưa có'}</b>
            </p>
          </div>
        </div>

        <button type="button"
          onClick={() => props.deleteStep(props.step)}
          className="rounded-lg bg-red-50 px-3 py-1 text-xs font-bold text-red-600"
        >
          Xóa bước
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Select
          value={props.step.owner_id || ''}
          onChange={(value) => props.updateStep(props.step, { owner_id: value || null } as Partial<TaskStep>)}
        >
          <option value="">Chọn người phụ trách</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>

        <input
          type="date"
          className="h-12 rounded-2xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none"
          value={props.step.due_date || ''}
          onChange={(event) => props.updateStep(props.step, { due_date: event.target.value || null } as Partial<TaskStep>)}
        />
      </div>

      <div className="mt-3 rounded-xl bg-[#F8FAFC] p-3">
        <p className="mb-3 text-sm font-extrabold">Tuyến duyệt: {approvalRoute}</p>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-extrabold text-[#64748B]">Trưởng bộ phận duyệt</p>
            <Select
              value={props.step.department_approver_id || props.step.approver_id || ''}
              onChange={(value) =>
                props.updateStep(props.step, {
                  department_approver_id: value || null,
                  approver_id: value || null,
                } as Partial<TaskStep>)
              }
            >
              <option value="">Chọn trưởng bộ phận</option>
              {props.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white px-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={Boolean(props.step.requires_coo_approval)}
              onChange={(event) =>
                props.updateStep(props.step, {
                  requires_coo_approval: event.target.checked,
                  coo_approval_status: event.target.checked ? 'not_submitted' : 'not_required',
                } as Partial<TaskStep>)
              }
            />
            Cần COO duyệt
          </label>

          <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white px-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={Boolean(props.step.requires_ceo_approval)}
              onChange={(event) =>
                props.updateStep(props.step, {
                  requires_ceo_approval: event.target.checked,
                  ceo_approval_status: event.target.checked ? 'not_submitted' : 'not_required',
                } as Partial<TaskStep>)
              }
            />
            Cần CEO duyệt
          </label>
        </div>

        {(props.step.requires_coo_approval || props.step.requires_ceo_approval) && (
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {props.step.requires_coo_approval && (
              <div>
                <p className="mb-1 text-xs font-extrabold text-[#64748B]">COO duyệt vận hành</p>
                <Select
                  value={props.step.coo_approver_id || ''}
                  onChange={(value) => props.updateStep(props.step, { coo_approver_id: value || null } as Partial<TaskStep>)}
                >
                  <option value="">Chọn COO</option>
                  {props.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {props.step.requires_ceo_approval && (
              <div>
                <p className="mb-1 text-xs font-extrabold text-[#64748B]">CEO duyệt cuối</p>
                <Select
                  value={props.step.ceo_approver_id || ''}
                  onChange={(value) => props.updateStep(props.step, { ceo_approver_id: value || null } as Partial<TaskStep>)}
                >
                  <option value="">Chọn CEO</option>
                  {props.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-2 text-sm xl:grid-cols-3">
          <ApprovalStatusPill label="Trưởng bộ phận" status={props.step.department_approval_status || status} />
          <ApprovalStatusPill label="COO" status={props.step.coo_approval_status || 'not_required'} />
          <ApprovalStatusPill label="CEO" status={props.step.ceo_approval_status || 'not_required'} />
        </div>

        <p className="mt-2 text-xs text-[#64748B]">
          Người duyệt: Trưởng bộ phận {departmentApprover?.full_name || 'chưa gắn'}
          {props.step.requires_coo_approval ? ` · COO ${cooApprover?.full_name || 'chưa gắn'}` : ''}
          {props.step.requires_ceo_approval ? ` · CEO ${ceoApprover?.full_name || 'chưa gắn'}` : ''}
        </p>
      </div>

      {props.step.support_request && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <b>Yêu cầu hỗ trợ:</b> {props.step.support_request}
        </div>
      )}

      {props.step.approval_note && (
        <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
          <b>Ghi chú duyệt:</b> {props.step.approval_note}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="rounded-xl bg-[#F8FAFC] p-3">
          <p className="mb-2 text-sm font-extrabold">File / link báo cáo</p>

          <input
            type="file"
            disabled={props.locked}
            onChange={(event) => props.uploadStepFile(props.step, event.target.files?.[0])}
            className="block w-full rounded-xl border border-[#E2E8F0] bg-white p-2 text-xs"
          />

          {props.step.report_file_url && (
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={props.step.report_file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-lg bg-[#1B4FD8] px-3 py-2 text-xs font-bold text-white"
              >
                Mở file
              </a>
              <button type="button"
                onClick={() => props.clearStepFile(props.step)}
                className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600"
              >
                Xóa file
              </button>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <input
              className="h-9 flex-1 rounded-lg border border-[#E2E8F0] px-3 text-xs outline-none"
              placeholder="Dán link báo cáo... (tự lưu khi rời ô)"
              value={props.linkDrafts[props.step.id] ?? props.step.report_link ?? ''}
              onChange={(event) =>
                props.setLinkDrafts({
                  ...props.linkDrafts,
                  [props.step.id]: event.target.value,
                })
              }
              onBlur={() => {
                const draft = props.linkDrafts[props.step.id]
                if (draft !== undefined && draft !== (props.step.report_link ?? '')) {
                  props.saveStepLink(props.step)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
              }}
            />
            <button type="button"
              onClick={() => props.saveStepLink(props.step)}
              className="rounded-lg bg-[#1B4FD8] px-3 text-xs font-bold text-white"
            >
              Lưu
            </button>
          </div>

          {props.step.report_link && (
            <a
              href={props.step.report_link}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-xs font-bold text-[#1B4FD8]"
            >
              Mở link báo cáo
            </a>
          )}
        </div>

        <div className="rounded-xl bg-[#F8FAFC] p-3">
          <p className="mb-2 text-sm font-extrabold">Bình luận / cần hỗ trợ</p>

          <div className="mb-3 flex gap-2">
            <input
              className="h-9 flex-1 rounded-lg border border-[#E2E8F0] px-3 text-xs outline-none"
              placeholder="VD: Em cần công cụ hỗ trợ... (Enter để lưu)"
              value={props.supportDrafts[props.step.id] ?? props.step.support_request ?? ''}
              onChange={(event) =>
                props.setSupportDrafts({
                  ...props.supportDrafts,
                  [props.step.id]: event.target.value,
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') props.saveSupportRequest(props.step)
              }}
            />
            <button type="button"
              onClick={() => props.saveSupportRequest(props.step)}
              className="rounded-lg bg-amber-500 px-3 text-xs font-bold text-white"
            >
              Lưu
            </button>
          </div>

          <div className="mb-3 max-h-28 space-y-2 overflow-y-auto">
            {props.comments.length === 0 ? (
              <p className="text-xs text-[#64748B]">Chưa có bình luận.</p>
            ) : (
              props.comments.map((comment) => (
                <div key={comment.id} className="rounded-lg bg-white p-2 text-xs">
                  <p className="font-bold">{comment.employees?.full_name || 'Không rõ'}</p>
                  <p className="text-[#64748B]">{comment.comment}</p>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <input
              className="h-9 flex-1 rounded-lg border border-[#E2E8F0] px-3 text-xs outline-none"
              placeholder="Nhập bình luận... (Enter để gửi)"
              value={props.commentDrafts[props.step.id] || ''}
              onChange={(event) =>
                props.setCommentDrafts({
                  ...props.commentDrafts,
                  [props.step.id]: event.target.value,
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') props.addComment(props.step.id)
              }}
            />
            <button type="button"
              onClick={() => props.addComment(props.step.id)}
              className="rounded-lg bg-[#1B4FD8] px-3 text-xs font-bold text-white"
            >
              Gửi
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-red-50 p-3">
        <p className="mb-2 text-sm font-extrabold text-red-700">Yêu cầu làm lại nếu chưa đạt</p>
        <div className="flex gap-2">
          <input
            className="h-9 flex-1 rounded-lg border border-red-100 px-3 text-xs outline-none"
            placeholder="Nhập lý do cần làm lại..."
            value={props.revisionDrafts[props.step.id] || ''}
            onChange={(event) =>
              props.setRevisionDrafts({
                ...props.revisionDrafts,
                [props.step.id]: event.target.value,
              })
            }
          />
          <button type="button"
            disabled={props.locked}
            onClick={() => props.requestRevision(props.step)}
            className="rounded-lg bg-red-600 px-3 text-xs font-bold text-white disabled:opacity-40"
          >
            Gửi
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button"
          disabled={props.locked || status === 'approved'}
          onClick={() => props.submitStep(props.step)}
          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-40"
        >
          Gửi duyệt
        </button>

        <button type="button"
          disabled={props.locked}
          onClick={() => props.approveStep(props.step)}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-40"
        >
          {approveButtonLabel}
        </button>
      </div>
    </div>
  )
}

function ProjectsView(props: {
  projectCards: ProjectCard[]
  tasks: Task[]
  setView: (view: ViewKey) => void
  setSelectedProjectId: (id: string) => void
  setSelectedTask: (task: Task) => void
  deleteProject: (project: Project) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {props.projectCards.map((project) => {
        const projectTasks = props.tasks.filter((task) => task.project_id === project.id)
        const urgent = projectTasks.filter((task) => isTaskOverdue(task) || isTaskProblem(task)).slice(0, 4)

        return (
          <Card key={project.id}>
            <button type="button"
              onClick={() => {
                props.setSelectedProjectId(project.id)
                props.setView('coo')
              }}
              className="block w-full text-left"
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-extrabold">{project.name}</h3>
                  <p className="text-sm text-[#64748B]">
                    {project.total} việc · {project.done} hoàn thành
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <ProjectHealthBadge health={project.health} />
                  <p className="text-2xl font-extrabold text-[#1B4FD8]">{project.rate}%</p>
                </div>
              </div>

              <ProgressBar value={project.rate} />

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Tổng" value={project.total} />
                <MiniStat label="Trễ" value={project.overdue} danger />
                <MiniStat label="Vấn đề" value={project.problem} danger />
              </div>
            </button>

            <div className="mt-4 rounded-xl bg-[#F8FAFC] p-3">
              <ProjectHealthSummary health={project.health} />
            </div>

            <div className="mt-3 flex justify-end">
              <button type="button"
                onClick={() => props.deleteProject(project)}
                className="rounded-lg bg-red-50 px-3 py-1 text-xs font-bold text-red-600"
              >
                Xóa
              </button>
            </div>

            <div className="mt-5 border-t pt-4">
              <p className="mb-3 text-sm font-extrabold">Việc cần chú ý</p>

              {urgent.length === 0 ? (
                <p className="text-sm text-[#64748B]">Chưa có cảnh báo.</p>
              ) : (
                <div className="space-y-2">
                  {urgent.map((task) => (
                    <button type="button"
                      key={task.id}
                      onClick={() => props.setSelectedTask(task)}
                      className="w-full rounded-xl bg-red-50 p-3 text-left text-sm font-bold text-red-700"
                    >
                      {task.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function TasksView(props: {
  tasks: Task[]
  employeeMap: Map<string, Employee>
  projectMap: Map<string, Project>
  setSelectedTask: (task: Task) => void
  updateTaskStatus: (taskId: string, status: string) => void
  getStatusLabel: (status: string) => string
}) {
  return (
    <Card>
      <h3 className="mb-5 text-lg font-extrabold">Danh sách toàn bộ công việc</h3>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b bg-[#F8FAFC] text-xs uppercase text-[#64748B]">
              <th className="p-3">Công việc</th>
              <th className="p-3">Cấp</th>
              <th className="p-3">Head</th>
              <th className="p-3">Dự án</th>
              <th className="p-3">Deadline</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Cảnh báo</th>
              <th className="p-3">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {props.tasks.map((task) => {
              const head = props.employeeMap.get(task.head_id || task.assignee_id || '')
              const project = props.projectMap.get(task.project_id || '')
              const overdue = isTaskOverdue(task)
              const problem = isTaskProblem(task)

              return (
                <tr key={task.id} className="border-b hover:bg-[#F8FAFC]">
                  <td className="p-3">
                    <p className="font-extrabold">{task.title}</p>
                    <p className="text-xs text-[#64748B]">{task.description || 'Chưa có mô tả'}</p>
                  </td>
                  <td className="p-3">
                    <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-bold text-[#64748B]">
                      {task.task_level === 'workstream' ? 'Đầu việc lớn' : task.parent_task_id ? 'Đầu việc con' : 'Task'}
                    </span>
                  </td>
                  <td className="p-3 font-bold">{head?.full_name || 'Chưa gắn'}</td>
                  <td className="p-3 text-[#64748B]">{project?.name || 'Chưa gắn'}</td>
                  <td className="p-3 font-bold">{task.due_date || 'Chưa có'}</td>
                  <td className="p-3">
                    <StatusBadge status={task.status} label={props.getStatusLabel(task.status)} />
                  </td>
                  <td className="p-3">
                    {overdue || problem ? (
                      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                        {getUrgentReason(task)}
                      </span>
                    ) : (
                      <span className="text-[#94A3B8]">Ổn</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <select
                        className="h-10 rounded-xl border border-[#E2E8F0] px-2 text-xs font-bold"
                        value={task.status}
                        onChange={(event) => props.updateTaskStatus(task.id, event.target.value)}
                      >
                        <option value="not_started">Chưa bắt đầu</option>
                        <option value="in_progress">Đang làm</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Hoàn thành</option>
                        <option value="overdue">Trễ deadline</option>
                      </select>

                      <button type="button"
                        onClick={() => props.setSelectedTask(task)}
                        className="rounded-xl bg-[#1B4FD8] px-3 text-xs font-bold text-white"
                      >
                        Chi tiết
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function MeetingView(props: {
  meetingTitle: string
  setMeetingTitle: (value: string) => void
  meetingRaw: string
  setMeetingRaw: (value: string) => void
  notexProjectName: string
  setNotexProjectName: (value: string) => void
  notexRows: NotexRow[]
  setNotexRows: (value: NotexRow[]) => void
  departments: Department[]
  employees: Employee[]
  importing: boolean
  handleMeetingFile: (file?: File) => void
  splitNotexRows: () => void
  importNotexRows: () => void
  saveMeeting: () => void
}) {
  function updateRow(rowId: string, patch: Partial<NotexRow>) {
    props.setNotexRows(props.notexRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))
  }

  function deleteRow(rowId: string) {
    props.setNotexRows(props.notexRows.filter((row) => row.id !== rowId))
  }

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-lg font-extrabold">Nhập biên bản Notex AI</h3>
        <p className="mt-1 text-sm text-[#64748B]">
          Dán nội dung Notex, tách đầu việc, kiểm tra preview rồi import vào COO Board.
        </p>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Input placeholder="Tên biên bản họp" value={props.meetingTitle} onChange={props.setMeetingTitle} />
            <Input placeholder="Tên dự án import vào" value={props.notexProjectName} onChange={props.setNotexProjectName} />
          </div>

          <input
            type="file"
            accept=".txt"
            onChange={(event) => props.handleMeetingFile(event.target.files?.[0])}
            className="block w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm"
          />

          <textarea
            className="min-h-[320px] w-full rounded-2xl border border-[#E2E8F0] p-4 text-sm leading-6 outline-none"
            placeholder={`Dán nội dung Notex vào đây...

14.1. Nhóm đầu việc lớn
[ ] Tên đầu việc con
Trách nhiệm: Người/phòng ban phụ trách
Kết quả mong muốn: File, link, báo cáo hoặc output cần nộp`}
            value={props.meetingRaw}
            onChange={(event) => props.setMeetingRaw(event.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            <button type="button"
              onClick={props.splitNotexRows}
              className="rounded-xl bg-[#1B4FD8] px-5 py-3 text-sm font-extrabold text-white"
            >
              Tách đầu việc
            </button>
            <button type="button"
              onClick={props.saveMeeting}
              className="rounded-xl border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-bold"
            >
              Lưu biên bản
            </button>
            <button type="button"
              onClick={props.importNotexRows}
              disabled={props.importing || props.notexRows.length === 0}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-40"
            >
              {props.importing ? 'Đang import...' : 'Import vào COO Board'}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold">Preview đầu việc</h3>
            <p className="mt-1 text-sm text-[#64748B]">{props.notexRows.length} dòng đã tách từ Notex.</p>
          </div>
        </div>

        {props.notexRows.length === 0 ? (
          <EmptyState title="Chưa có preview" description="Dán nội dung Notex rồi bấm Tách đầu việc." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-left text-sm">
              <thead>
                <tr className="border-b bg-[#F8FAFC] text-xs uppercase text-[#64748B]">
                  <th className="p-3">Đầu việc lớn</th>
                  <th className="p-3">Đầu việc con</th>
                  <th className="p-3">Trách nhiệm Notex</th>
                  <th className="p-3">Kết quả mong muốn</th>
                  <th className="p-3">Phòng ban</th>
                  <th className="p-3">Head</th>
                  <th className="p-3">Người phụ trách</th>
                  <th className="p-3">Deadline</th>
                  <th className="p-3">Mức độ ưu tiên</th>
                  <th className="p-3">Xóa dòng</th>
                </tr>
              </thead>
              <tbody>
                {props.notexRows.map((row) => (
                  <tr key={row.id} className="border-b align-top">
                    <td className="p-3">
                      <input
                        className="h-10 w-48 rounded-xl border border-[#E2E8F0] px-3 text-sm outline-none"
                        value={row.workstreamTitle}
                        onChange={(event) => updateRow(row.id, { workstreamTitle: event.target.value })}
                      />
                    </td>
                    <td className="p-3">
                      <input
                        className="h-10 w-56 rounded-xl border border-[#E2E8F0] px-3 text-sm outline-none"
                        value={row.subtaskTitle}
                        onChange={(event) => updateRow(row.id, { subtaskTitle: event.target.value })}
                      />
                    </td>
                    <td className="p-3">
                      <textarea
                        className="h-20 w-56 rounded-xl border border-[#E2E8F0] p-3 text-sm outline-none"
                        value={row.responsibility}
                        onChange={(event) => updateRow(row.id, { responsibility: event.target.value })}
                      />
                    </td>
                    <td className="p-3">
                      <textarea
                        className="h-20 w-64 rounded-xl border border-[#E2E8F0] p-3 text-sm outline-none"
                        value={row.expectedOutput}
                        onChange={(event) => updateRow(row.id, { expectedOutput: event.target.value })}
                      />
                    </td>
                    <td className="p-3">
                      <select
                        className="h-10 w-44 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm outline-none"
                        value={row.departmentId}
                        onChange={(event) => updateRow(row.id, { departmentId: event.target.value })}
                      >
                        <option value="">Chọn phòng ban</option>
                        {props.departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <select
                        className="h-10 w-44 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm outline-none"
                        value={row.headId}
                        onChange={(event) => updateRow(row.id, { headId: event.target.value })}
                      >
                        <option value="">Chọn Head</option>
                        {props.employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.full_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <select
                        className="h-10 w-44 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm outline-none"
                        value={row.assigneeId}
                        onChange={(event) => updateRow(row.id, { assigneeId: event.target.value })}
                      >
                        <option value="">Chọn người phụ trách</option>
                        {props.employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.full_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <input
                        type="date"
                        className="h-10 w-40 rounded-xl border border-[#E2E8F0] px-3 text-sm outline-none"
                        value={row.dueDate}
                        onChange={(event) => updateRow(row.id, { dueDate: event.target.value })}
                      />
                    </td>
                    <td className="p-3">
                      <select
                        className="h-10 w-40 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm outline-none"
                        value={row.priority}
                        onChange={(event) => updateRow(row.id, { priority: event.target.value })}
                      >
                        <option value="low">Thấp</option>
                        <option value="medium">Trung bình</option>
                        <option value="high">Cao</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <button type="button"
                        onClick={() => deleteRow(row.id)}
                        className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600"
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function AssistantView(props: {
  assistantOutput: string
  generateDailyReport: () => void
  generateFollowUpReport: () => void
  generatePendingApprovalReport: () => void
  generateRevisionReport: () => void
  generateMissingReportFileReport: () => void
  generatePeopleReport: () => void
  generateProjectReport: () => void
}) {
  const reportButtons = [
    { label: 'Báo cáo COO hôm nay', action: props.generateDailyReport, className: 'bg-[#1B4FD8] text-white' },
    { label: 'Việc cần hối thúc', action: props.generateFollowUpReport, className: 'bg-red-600 text-white' },
    { label: 'Việc chờ duyệt', action: props.generatePendingApprovalReport, className: 'bg-amber-500 text-white' },
    { label: 'Việc cần làm lại', action: props.generateRevisionReport, className: 'bg-red-50 text-red-700' },
    {
      label: 'Việc thiếu file/link báo cáo',
      action: props.generateMissingReportFileReport,
      className: 'bg-slate-900 text-white',
    },
    { label: 'Báo cáo theo nhân sự', action: props.generatePeopleReport, className: 'bg-emerald-600 text-white' },
    { label: 'Báo cáo theo dự án', action: props.generateProjectReport, className: 'bg-blue-50 text-[#1B4FD8]' },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <Card>
        <h3 className="text-lg font-extrabold">COO Assistant</h3>
        <p className="mt-1 text-sm text-[#64748B]">
          Tạo báo cáo vận hành dạng text để copy gửi sếp.
        </p>

        <div className="mt-5 space-y-3">
          {reportButtons.map((button) => (
            <button type="button"
              key={button.label}
              onClick={button.action}
              className={`w-full rounded-xl px-4 py-3 text-sm font-extrabold ${button.className}`}
            >
              {button.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Kết quả báo cáo</h3>
          {props.assistantOutput && (
            <button type="button"
              onClick={() => navigator.clipboard.writeText(props.assistantOutput)}
              className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold"
            >
              Copy
            </button>
          )}
        </div>

        {props.assistantOutput ? (
          <pre className="whitespace-pre-wrap rounded-2xl bg-[#F8FAFC] p-5 text-sm leading-7 text-[#334155]">
            {props.assistantOutput}
          </pre>
        ) : (
          <EmptyState title="Chưa có báo cáo" description="Bấm một nút bên trái để tạo báo cáo." />
        )}
      </Card>
    </div>
  )
}

function CreatePanel(props: {
  open: boolean
  setOpen: (value: boolean) => void
  tab: 'project' | 'workstream'
  setTab: (value: 'project' | 'workstream') => void
  projects: Project[]
  departments: Department[]
  employees: Employee[]
  saving: boolean
  projectName: string
  setProjectName: (value: string) => void
  projectCode: string
  setProjectCode: (value: string) => void
  projectDesc: string
  setProjectDesc: (value: string) => void
  projectOwnerId: string
  setProjectOwnerId: (value: string) => void
  projectDepartmentId: string
  setProjectDepartmentId: (value: string) => void
  createProject: () => void
  workTitle: string
  setWorkTitle: (value: string) => void
  workDesc: string
  setWorkDesc: (value: string) => void
  workProjectId: string
  setWorkProjectId: (value: string) => void
  workDepartmentId: string
  setWorkDepartmentId: (value: string) => void
  workHeadId: string
  setWorkHeadId: (value: string) => void
  workAssigneeId: string
  setWorkAssigneeId: (value: string) => void
  workDueDate: string
  setWorkDueDate: (value: string) => void
  workPriority: string
  setWorkPriority: (value: string) => void
  createWorkstream: () => void
}) {
  if (!props.open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button type="button" className="flex-1" onClick={() => props.setOpen(false)} />
      <div className="h-full w-full max-w-full overflow-y-auto bg-white p-4 shadow-2xl sm:max-w-[520px] sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Tạo mới</h3>
          <button type="button" onClick={() => props.setOpen(false)} className="rounded-xl bg-[#F1F5F9] px-3 py-2 font-bold">
            ×
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-xl bg-[#F1F5F9] p-1">
          <button type="button"
            onClick={() => props.setTab('project')}
            className={`rounded-lg py-2 text-sm font-bold ${props.tab === 'project' ? 'bg-white shadow' : ''}`}
          >
            + Dự án
          </button>
          <button type="button"
            onClick={() => props.setTab('workstream')}
            className={`rounded-lg py-2 text-sm font-bold ${props.tab === 'workstream' ? 'bg-white shadow' : ''}`}
          >
            + Đầu việc lớn
          </button>
        </div>

        {props.tab === 'project' && (
          <div className="space-y-3">
            <Input placeholder="Tên dự án" value={props.projectName} onChange={props.setProjectName} />
            <Input placeholder="Mã dự án" value={props.projectCode} onChange={props.setProjectCode} />
            <Input placeholder="Mô tả dự án" value={props.projectDesc} onChange={props.setProjectDesc} />

            <Select value={props.projectDepartmentId} onChange={props.setProjectDepartmentId}>
              <option value="">Chọn phòng ban chính</option>
              {props.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>

            <Select value={props.projectOwnerId} onChange={props.setProjectOwnerId}>
              <option value="">Chọn owner</option>
              {props.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>

            <button type="button"
              onClick={props.createProject}
              disabled={props.saving}
              className="w-full rounded-xl bg-[#16A34A] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {props.saving ? 'Đang tạo...' : 'Tạo dự án'}
            </button>
          </div>
        )}

        {props.tab === 'workstream' && (
          <div className="space-y-3">
            <Input placeholder="Tên đầu việc lớn" value={props.workTitle} onChange={props.setWorkTitle} />
            <Input placeholder="Mô tả" value={props.workDesc} onChange={props.setWorkDesc} />

            <input
              type="date"
              className="h-12 w-full rounded-2xl border border-[#E2E8F0] px-4 text-sm outline-none"
              value={props.workDueDate}
              onChange={(event) => props.setWorkDueDate(event.target.value)}
            />

            <Select value={props.workProjectId} onChange={props.setWorkProjectId}>
              <option value="">Chọn dự án</option>
              {props.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>

            <Select value={props.workDepartmentId} onChange={props.setWorkDepartmentId}>
              <option value="">Chọn phòng ban</option>
              {props.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>

            <Select value={props.workHeadId} onChange={props.setWorkHeadId}>
              <option value="">Chọn Head</option>
              {props.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>

            <Select value={props.workAssigneeId} onChange={props.setWorkAssigneeId}>
              <option value="">Chọn người phụ trách</option>
              {props.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>

            <Select value={props.workPriority} onChange={props.setWorkPriority}>
              <option value="low">Ưu tiên thấp</option>
              <option value="medium">Ưu tiên trung bình</option>
              <option value="high">Ưu tiên cao</option>
            </Select>

            <button type="button"
              onClick={props.createWorkstream}
              disabled={props.saving}
              className="w-full rounded-xl bg-[#1B4FD8] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {props.saving ? 'Đang tạo...' : 'Tạo đầu việc lớn'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TaskDetailDrawer(props: {
  task: Task
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  projectMap: Map<string, Project>
  steps: TaskStep[]
  reports: TaskReport[]
  close: () => void
  uploadTaskFile: (task: Task, file?: File) => void
  deleteTaskReport: (report: TaskReport) => void
  uploading: boolean
  getStatusLabel: (status: string) => string
}) {
  const head = props.employeeMap.get(props.task.head_id || props.task.assignee_id || '')
  const assignee = props.employeeMap.get(props.task.assignee_id || '')
  const department = props.departmentMap.get(props.task.department_id || '')
  const project = props.projectMap.get(props.task.project_id || '')
  const progress = calculateTaskProgress(props.task, props.steps)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" onClick={props.close} />
      <div className="h-full w-full max-w-[560px] overflow-y-auto bg-white p-4 shadow-2xl sm:p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Chi tiết vận hành</h3>
          <button type="button" onClick={props.close} className="rounded-xl bg-[#F1F5F9] px-3 py-2 font-bold">
            ×
          </button>
        </div>

        <h2 className="text-2xl font-extrabold">{props.task.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#64748B]">
          {props.task.description || 'Chưa có mô tả.'}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge status={props.task.status} label={props.getStatusLabel(props.task.status)} />
          <IssueBadge issueStatus={props.task.issue_status} />
        </div>

        <div className="mt-6 space-y-4">
          <InfoRow label="Dự án" value={project?.name || 'Chưa gắn'} />
          <InfoRow label="Phòng ban" value={department?.name || 'Chưa gắn'} />
          <InfoRow label="Head phụ trách" value={head?.full_name || 'Chưa gắn'} />
          <InfoRow label="Người phụ trách" value={assignee?.full_name || 'Chưa gắn'} />
          <InfoRow label="Deadline" value={props.task.due_date || 'Chưa có'} />

          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="font-bold">Tiến độ theo bước đã duyệt</span>
              <span className="font-extrabold text-[#1B4FD8]">{progress}%</span>
            </div>
            <ProgressBar value={progress} />
          </div>

          <div className="rounded-2xl bg-[#F8FAFC] p-4">
            <p className="mb-3 font-extrabold">File báo cáo cấp đầu việc</p>

            <input
              type="file"
              onChange={(event) => props.uploadTaskFile(props.task, event.target.files?.[0])}
              className="block w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm"
            />

            {props.uploading && (
              <p className="mt-2 text-sm font-bold text-[#1B4FD8]">Đang upload...</p>
            )}

            <div className="mt-4 space-y-2">
              {props.reports.length === 0 ? (
                <p className="text-sm text-[#64748B]">Chưa có file báo cáo.</p>
              ) : (
                props.reports.map((report) => (
                  <div key={report.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                    <p className="truncate text-sm font-bold">📎 {report.file_name}</p>
                    <div className="flex shrink-0 gap-2">
                      <a
                        href={report.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-[#1B4FD8] px-3 py-2 text-xs font-bold text-white"
                      >
                        Mở
                      </a>
                      <button type="button"
                        onClick={() => props.deleteTaskReport(report)}
                        className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600"
                      >
                        Xóa file
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
            <b>Gợi ý COO cần hỏi:</b> {buildFollowUpQuestion(props.task, head?.full_name)}
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">{children}</div>
}

function MetricCard(props: {
  label: string
  value: number
  icon: string
  tone: 'blue' | 'green' | 'purple' | 'red'
}) {
  const toneMap = {
    blue: 'bg-blue-50 text-[#1B4FD8]',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    red: 'bg-red-50 text-red-700',
  }

  return (
    <div className="card-hover rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#64748B]">{props.label}</p>
        <span className={`rounded-xl px-3 py-2 ${toneMap[props.tone]}`}>{props.icon}</span>
      </div>
      <p className="mt-4 text-3xl font-extrabold tabular-nums">{props.value}</p>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-[#E2E8F0]">
      <div
        className="progress-bar-fill h-full rounded-full bg-gradient-to-r from-[#1B4FD8] to-[#3B82F6] transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

function StatusDistributionRow(props: {
  label: string
  count: number
  total: number
  color: string
}) {
  const percent = props.total === 0 ? 0 : Math.round((props.count / props.total) * 100)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <p className="font-bold text-[#334155]">{props.label}</p>
        <p className="font-extrabold">
          {props.count} <span className="text-[#64748B]">({percent}%)</span>
        </p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#E2E8F0]">
        <div className={`h-full rounded-full ${props.color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function MiniStat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-[#F8FAFC] p-2">
      <p className={`text-lg font-extrabold ${danger && value > 0 ? 'text-red-600' : ''}`}>{value}</p>
      <p className="text-[11px] font-bold text-[#64748B]">{label}</p>
    </div>
  )
}

function DashboardStepList(props: {
  title: string
  steps: TaskStep[]
  tasks: Task[]
  emptyText: string
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-extrabold text-[#334155]">{props.title}</p>
      {props.steps.length === 0 ? (
        <p className="text-sm text-[#64748B]">{props.emptyText}</p>
      ) : (
        <div className="space-y-2">
          {props.steps.map((step) => {
            const task = getTaskByStep(step, props.tasks)

            return (
              <div key={step.id} className="rounded-xl bg-[#F8FAFC] p-3">
                <p className="text-sm font-extrabold">{step.step_title}</p>
                <p className="mt-1 text-xs text-[#64748B]">{task?.title || 'Không rõ đầu việc cha'}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls =
    status === 'completed'
      ? 'bg-[#DCFCE7] text-[#16A34A]'
      : status === 'in_progress'
        ? 'bg-[#E0F2FE] text-[#0369A1]'
        : status === 'pending'
          ? 'bg-[#EDE9FE] text-[#6D28D9]'
          : status === 'overdue'
            ? 'bg-[#FEE2E2] text-[#DC2626]'
            : 'bg-[#F1F5F9] text-[#64748B]'

  return <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${cls}`}>{label}</span>
}

function IssueBadge({ issueStatus }: { issueStatus?: string | null }) {
  const value = issueStatus || 'normal'

  if (value === 'problem') {
    return <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-extrabold text-red-700">Có vấn đề</span>
  }

  if (value === 'slow') {
    return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-700">Đang chậm</span>
  }

  if (value === 'watch') {
    return <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">Cần theo dõi</span>
  }

  return <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">Ổn</span>
}

function ProjectHealthBadge({ health }: { health: ProjectHealth }) {
  const cls =
    health.level === 'problem'
      ? 'bg-red-50 text-red-700'
      : health.level === 'watch'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-emerald-50 text-emerald-700'

  return <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${cls}`}>{health.label}</span>
}

function ProjectHealthSummary({ health }: { health: ProjectHealth }) {
  const items = [
    { label: 'việc trễ', value: health.overdueTasks },
    { label: 'việc pending', value: health.pendingTasks },
    { label: 'việc có vấn đề', value: health.problemTasks },
    { label: 'việc đang chậm', value: health.slowTasks },
    { label: 'bước quá hạn', value: health.overdueSteps },
    { label: 'bước cần làm lại', value: health.revisionSteps },
    { label: 'bước chờ duyệt', value: health.pendingSteps },
    { label: 'yêu cầu hỗ trợ', value: health.supportRequests },
    { label: 'bước thiếu báo cáo', value: health.missingReports },
  ].filter((item) => item.value > 0)

  if (items.length === 0) {
    return <p className="text-sm text-[#64748B]">Không có cảnh báo vận hành.</p>
  }

  return (
    <div className="space-y-1 text-sm text-[#475569]">
      {items.map((item) => (
        <p key={item.label}>
          + {item.value} {item.label}
        </p>
      ))}
    </div>
  )
}

function StepApprovalBadge({ status }: { status: string }) {
  if (status === 'not_required') {
    return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-500">Không yêu cầu</span>
  }

  if (status === 'approved') {
    return <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">Đã duyệt</span>
  }

  if (status === 'pending') {
    return <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">Chờ duyệt</span>
  }

  if (status === 'revision') {
    return <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-extrabold text-red-700">Cần làm lại</span>
  }

  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-600">Chưa gửi</span>
}

function ApprovalStatusPill({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
      <span className="text-xs font-extrabold text-[#64748B]">{label}</span>
      <StepApprovalBadge status={status} />
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#F8FAFC] px-3 py-2">
      <p className="text-[11px] font-bold uppercase text-[#94A3B8]">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-extrabold uppercase text-[#94A3B8]">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B4FD8] text-sm font-extrabold text-white">
      {(name || 'U').slice(0, 1).toUpperCase()}
    </div>
  )
}

function Input(props: {
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <input
      className="h-12 w-full rounded-2xl border border-[#E2E8F0] px-4 text-sm outline-none"
      placeholder={props.placeholder}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  )
}

function Select(props: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      className="h-12 w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.children}
    </select>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center">
      <div className="mb-3 text-3xl">🗂️</div>
      <p className="font-extrabold">{title}</p>
      <p className="mt-1 text-sm text-[#64748B]">{description}</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-xl bg-white" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-xl bg-white" />
    </div>
  )
}

function calculateTaskProgress(task: Task, taskSteps: TaskStep[]) {
  if (taskSteps.length > 0) {
    const approved = taskSteps.filter((step) => step.approval_status === 'approved').length
    return Math.round((approved / taskSteps.length) * 100)
  }

  return task.progress_percent || 0
}

function calculateWorkstreamProgress(
  workstream: Task,
  tasksByParent: Map<string, Task[]>,
  stepsByTask: Map<string, TaskStep[]>
) {
  const subtasks = tasksByParent.get(workstream.id) || []

  if (subtasks.length === 0) {
    return calculateTaskProgress(workstream, stepsByTask.get(workstream.id) || [])
  }

  const total = subtasks.reduce((sum, subtask) => {
    return sum + calculateTaskProgress(subtask, stepsByTask.get(subtask.id) || [])
  }, 0)

  return Math.round(total / subtasks.length)
}

function calculateProjectProgress(
  workstreams: Task[],
  tasksByParent: Map<string, Task[]>,
  stepsByTask: Map<string, TaskStep[]>
) {
  if (workstreams.length === 0) return 0

  const total = workstreams.reduce((sum, workstream) => {
    return sum + calculateWorkstreamProgress(workstream, tasksByParent, stepsByTask)
  }, 0)

  return Math.round(total / workstreams.length)
}

function calculateProjectHealth(
  projectId: string,
  tasks: Task[],
  steps: TaskStep[],
  stepsByTask: Map<string, TaskStep[]>
): ProjectHealth {
  const projectTasks = tasks.filter((task) => task.project_id === projectId)
  const projectTaskIds = new Set(projectTasks.map((task) => task.id))
  const projectSteps = steps.filter((step) => projectTaskIds.has(step.task_id))

  const overdueTasks = projectTasks.filter((task) => isTaskOverdue(task)).length
  const pendingTasks = projectTasks.filter((task) => task.status === 'pending').length
  const problemTasks = projectTasks.filter((task) => task.issue_status === 'problem').length
  const slowTasks = projectTasks.filter((task) => isTaskSlow(task, stepsByTask.get(task.id) || [])).length
  const pendingSteps = getPendingApprovalSteps(projectSteps).length
  const revisionSteps = getRevisionSteps(projectSteps).length
  const supportRequests = projectSteps.filter((step) => Boolean(step.support_request?.trim())).length
  const missingReports = projectSteps.filter((step) => !step.report_file_url && !step.report_link).length
  const overdueSteps = projectSteps.filter((step) => isStepOverdue(step)).length

  const problemWarnings = overdueTasks + pendingTasks + problemTasks + revisionSteps + overdueSteps
  const watchWarnings = slowTasks + pendingSteps + supportRequests + missingReports
  const level = problemWarnings > 0 ? 'problem' : watchWarnings > 0 ? 'watch' : 'normal'
  const label =
    level === 'problem' ? '🔴 Có vấn đề' : level === 'watch' ? '🟠 Cần theo dõi' : '🟢 Đang ổn'

  return {
    level,
    label,
    overdueTasks,
    pendingTasks,
    problemTasks,
    slowTasks,
    pendingSteps,
    revisionSteps,
    supportRequests,
    missingReports,
    overdueSteps,
    totalWarnings: problemWarnings + watchWarnings,
  }
}

function isTaskOverdue(task: Task) {
  if (!task.due_date) return false
  if (task.status === 'completed') return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = new Date(task.due_date)
  due.setHours(0, 0, 0, 0)

  return due < today
}

function isStepOverdue(step: TaskStep) {
  if (!step.due_date) return false
  if (step.approval_status === 'approved') return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = new Date(step.due_date)
  due.setHours(0, 0, 0, 0)

  return due < today
}

function isTaskSlow(task: Task, taskSteps: TaskStep[]) {
  if (task.status === 'completed') return false
  if (task.issue_status === 'slow') return true
  if (!task.due_date) return false

  const progress = calculateTaskProgress(task, taskSteps)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = new Date(task.due_date)
  due.setHours(0, 0, 0, 0)

  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  return diffDays <= 3 && progress < 70
}

function isTaskProblem(task: Task) {
  return task.issue_status === 'problem' || task.status === 'pending'
}

function getTaskByStep(step: TaskStep, tasks: Task[]) {
  return tasks.find((task) => task.id === step.task_id) || null
}

function getPendingApprovalSteps(steps: TaskStep[]) {
  return steps.filter(
    (step) =>
      step.approval_status === 'pending' ||
      step.department_approval_status === 'pending' ||
      step.coo_approval_status === 'pending' ||
      step.ceo_approval_status === 'pending'
  )
}

function getRevisionSteps(steps: TaskStep[]) {
  return steps.filter(
    (step) =>
      step.approval_status === 'revision' ||
      step.department_approval_status === 'revision' ||
      step.coo_approval_status === 'revision' ||
      step.ceo_approval_status === 'revision'
  )
}

function getMissingReportSteps(steps: TaskStep[]) {
  return steps.filter((step) => {
    if (step.approval_status === 'approved') return false
    return !step.report_file_url && !step.report_link
  })
}

function getDefaultDepartmentApprover(
  departmentId: string | null,
  departments: Department[],
  employees: Employee[]
) {
  const department = departments.find((item) => item.id === departmentId)
  const text = normalizeSearchText(`${department?.name || ''} ${department?.code || ''}`)

  if (matchesAny(text, ['marketing', 'ads', 'livestream', 'brand'])) {
    return findEmployeeId(employees, ['vũ', 'vu']) || employees[0]?.id || ''
  }

  if (matchesAny(text, ['content', 'nội dung', 'noi dung'])) {
    return findEmployeeId(employees, ['nhung', 'nhung']) || findEmployeeId(employees, ['vũ', 'vu']) || employees[0]?.id || ''
  }

  if (matchesAny(text, ['sales', 'cskh', 'customer', 'bán hàng', 'ban hang'])) {
    return findEmployeeId(employees, ['vy']) || employees[0]?.id || ''
  }

  if (matchesAny(text, ['r&d', 'rnd', 'product', 'sản phẩm', 'san pham', 'nghiên cứu', 'nghien cuu'])) {
    return findEmployeeId(employees, ['má hồng', 'ma hong']) || employees[0]?.id || ''
  }

  if (matchesAny(text, ['kế toán', 'ke toan', 'kho', 'finance', 'accounting'])) {
    return findEmployeeId(employees, ['thùy linh', 'thuy linh']) || employees[0]?.id || ''
  }

  if (matchesAny(text, ['ops', 'hr', 'admin', 'nhân sự', 'nhan su', 'vận hành', 'van hanh'])) {
    return getCooApprover(employees)
  }

  if (matchesAny(text, ['design', 'thiết kế', 'thiet ke'])) {
    return findEmployeeId(employees, ['nhi']) || employees[0]?.id || ''
  }

  return employees[0]?.id || ''
}

function getCooApprover(employees: Employee[]) {
  return findEmployeeId(employees, ['quang']) || findEmployeeIdByPosition(employees, ['coo', 'ops', 'admin']) || employees[0]?.id || ''
}

function getCeoApprover(employees: Employee[]) {
  return (
    findEmployeeId(employees, ['vy']) ||
    findEmployeeId(employees, ['phúc', 'phuc']) ||
    findEmployeeIdByPosition(employees, ['ceo']) ||
    employees[0]?.id ||
    ''
  )
}

function findEmployeeId(employees: Employee[], names: string[]) {
  return employees.find((employee) => matchesAny(normalizeSearchText(employee.full_name), names))?.id || ''
}

function findEmployeeIdByPosition(employees: Employee[], positions: string[]) {
  return employees.find((employee) => matchesAny(normalizeSearchText(employee.position || ''), positions))?.id || ''
}

function matchesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(normalizeSearchText(value)))
}

function buildApprovalRoute(step: TaskStep) {
  const route = ['Trưởng bộ phận']
  if (step.requires_coo_approval) route.push('COO')
  if (step.requires_ceo_approval) route.push('CEO')
  return route.join(' → ')
}

function getApproveButtonLabel(stage: string) {
  if (stage === 'coo') return 'COO duyệt'
  if (stage === 'ceo') return 'CEO duyệt'
  return 'Trưởng bộ phận duyệt'
}

function getApprovalWaitingLabel(step: TaskStep) {
  const stage = step.approval_stage || 'department'
  if (stage === 'coo') return 'Chờ COO'
  if (stage === 'ceo') return 'Chờ CEO'
  return 'Chờ trưởng bộ phận'
}

function getRevisionRequesterLabel(step: TaskStep) {
  const stage = step.approval_stage || 'department'
  if (stage === 'coo') return 'COO yêu cầu làm lại'
  if (stage === 'ceo') return 'CEO yêu cầu làm lại'
  return 'Trưởng bộ phận yêu cầu làm lại'
}

function getRevisionNote(step: TaskStep) {
  const stage = step.approval_stage || 'department'
  if (stage === 'coo') return step.coo_approval_note || step.approval_note || ''
  if (stage === 'ceo') return step.ceo_approval_note || step.approval_note || ''
  return step.department_approval_note || step.approval_note || ''
}

function parseNotexText(text: string, departments: Department[], employees: Employee[]) {
  const rows: NotexRow[] = []
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  let currentWorkstream = 'Đầu việc từ Notex'
  let currentRow: NotexRow | null = null

  function pushCurrentRow() {
    if (!currentRow || !currentRow.subtaskTitle.trim()) return
    rows.push({
      ...currentRow,
      departmentId: currentRow.departmentId || guessDepartmentId(`${currentRow.subtaskTitle} ${currentRow.responsibility}`, departments),
      headId: currentRow.headId || currentRow.assigneeId || employees[0]?.id || '',
      assigneeId: currentRow.assigneeId || currentRow.headId || employees[0]?.id || '',
    })
  }

  lines.forEach((line, index) => {
    const workstreamMatch = line.match(/^\d+(?:\.\d+)+\.?\s*(.+)$/)
    const checkboxMatch = line.match(/^\[\s*\]\s*(.+)$/)
    const responsibilityMatch = line.match(/^trách nhiệm\s*:\s*(.+)$/i)
    const outputMatch = line.match(/^kết quả mong muốn\s*:\s*(.+)$/i)

    if (workstreamMatch) {
      pushCurrentRow()
      currentRow = null
      currentWorkstream = normalizeWorkstreamTitle(workstreamMatch[1])
      return
    }

    if (checkboxMatch) {
      pushCurrentRow()
      currentRow = {
        id: `notex-${index}-${checkboxMatch[1].slice(0, 24)}`,
        workstreamTitle: currentWorkstream,
        subtaskTitle: checkboxMatch[1].trim(),
        responsibility: '',
        expectedOutput: '',
        departmentId: guessDepartmentId(`${currentWorkstream} ${checkboxMatch[1]}`, departments),
        headId: employees[0]?.id || '',
        assigneeId: employees[0]?.id || '',
        dueDate: '',
        priority: 'medium',
      }
      return
    }

    if (responsibilityMatch && currentRow) {
      const responsibility = responsibilityMatch[1].trim()
      const employeeId = guessEmployeeId(responsibility, employees)
      currentRow = {
        ...currentRow,
        responsibility,
        departmentId: currentRow.departmentId || guessDepartmentId(responsibility, departments),
        headId: currentRow.headId || employeeId,
        assigneeId: employeeId || currentRow.assigneeId,
      }
      return
    }

    if (outputMatch && currentRow) {
      currentRow = {
        ...currentRow,
        expectedOutput: outputMatch[1].trim(),
      }
    }
  })

  pushCurrentRow()
  return rows
}

function guessDepartmentId(text: string, departments: Department[]) {
  const normalizedText = normalizeSearchText(text)
  const match = departments.find((department) => {
    return (
      normalizedText.includes(normalizeSearchText(department.name)) ||
      normalizedText.includes(normalizeSearchText(department.code))
    )
  })

  return match?.id || departments[0]?.id || ''
}

function normalizeWorkstreamTitle(rawTitle: string) {
  return rawTitle.replace(/^\d+(?:\.\d+)+\.?\s*/, '').trim() || 'Đầu việc từ Notex'
}

function buildNotexDescription(row: NotexRow) {
  return [
    row.responsibility ? `Trách nhiệm: ${row.responsibility}` : '',
    row.expectedOutput ? `Kết quả mong muốn: ${row.expectedOutput}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function guessEmployeeId(text: string, employees: Employee[]) {
  const normalizedText = normalizeSearchText(text)
  const match = employees.find((employee) => {
    return (
      normalizedText.includes(normalizeSearchText(employee.full_name)) ||
      Boolean(employee.position && normalizedText.includes(normalizeSearchText(employee.position)))
    )
  })

  return match?.id || ''
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function getUrgentReason(task: Task) {
  if (isTaskOverdue(task)) return 'Quá hạn'
  if (task.issue_status === 'problem') return 'Có vấn đề'
  if (task.issue_status === 'slow') return 'Đang chậm'
  if (task.status === 'pending') return 'Pending'
  return 'Cần theo dõi'
}

function buildFollowUpQuestion(task: Task, personName?: string) {
  const name = personName || 'người phụ trách'

  if (isTaskOverdue(task)) {
    return `Hỏi ${name}: Việc "${task.title}" đang quá hạn, lý do chậm là gì và cần hỗ trợ gì để chốt?`
  }

  if (task.status === 'pending' || task.issue_status === 'problem') {
    return `Hỏi ${name}: Việc "${task.title}" đang bị kẹt ở đâu, ai đang chờ ai, cần sếp quyết gì?`
  }

  if (task.issue_status === 'slow') {
    return `Hỏi ${name}: Tiến độ "${task.title}" đang chậm, bước tiếp theo là gì và khi nào hoàn thành?`
  }

  return `Hỏi ${name}: Cập nhật nhanh tiến độ "${task.title}" và bước tiếp theo.`
}

function buildDailyReport(
  tasks: Task[],
  steps: TaskStep[],
  projectCards: ProjectCard[],
  urgentTasks: Task[]
) {
  const doneTasks = tasks.filter((task) => task.status === 'completed').length
  const doingTasks = tasks.filter((task) => task.status === 'in_progress').length
  const pendingTasks = tasks.filter((task) => task.status === 'pending').length
  const overdueTasks = tasks.filter((task) => isTaskOverdue(task)).length
  const pendingSteps = getPendingApprovalSteps(steps)
  const revisionSteps = getRevisionSteps(steps)
  const missingReportSteps = getMissingReportSteps(steps)
  const attentionProjects = projectCards.filter((project) => project.health.level !== 'normal')

  return `BÁO CÁO COO HÔM NAY

1. TỔNG QUAN
- Tổng đầu việc: ${tasks.length}
- Hoàn thành: ${doneTasks}
- Đang làm: ${doingTasks}
- Pending: ${pendingTasks}
- Trễ deadline: ${overdueTasks}
- Việc cần hối thúc: ${urgentTasks.length}
- Bước đang chờ duyệt: ${pendingSteps.length}
- Bước cần làm lại: ${revisionSteps.length}
- Bước thiếu file/link báo cáo: ${missingReportSteps.length}

2. DỰ ÁN CÓ CẢNH BÁO ĐỎ/CAM
${
  attentionProjects
    .map((project) => `- ${project.name}: ${project.health.label} | ${project.health.totalWarnings} cảnh báo | Tiến độ ${project.rate}%`)
    .join('\n') || '- Không có dự án đỏ/cam.'
}

3. ĐỀ XUẤT HÀNH ĐỘNG TRONG NGÀY
- Chốt các bước đang chờ duyệt để không nghẽn tiến độ.
- Hối các việc quá hạn, pending hoặc có vấn đề rõ người chịu trách nhiệm.
- Yêu cầu bổ sung file/link báo cáo cho các bước còn thiếu trước khi duyệt.
- Ưu tiên xử lý dự án đỏ trước, dự án cam theo dõi trong ngày.`
}

function buildFollowUpReport(
  urgentTasks: Task[],
  employeeMap: Map<string, Employee>,
  projectMap: Map<string, Project>
) {
  if (urgentTasks.length === 0) {
    return 'Hiện chưa có việc cần hối thúc.'
  }

  return `DANH SÁCH CẦN HỐI THÚC

${urgentTasks
  .map((task, index) => {
    const person = employeeMap.get(task.assignee_id || task.head_id || '')
    const project = projectMap.get(task.project_id || '')

    return `${index + 1}. ${person?.full_name || 'Chưa gắn người'} — ${task.title}
- Dự án: ${project?.name || 'Chưa gắn'}
- Lý do: ${getUrgentReason(task)}
- Cần hỏi: ${buildFollowUpQuestion(task, person?.full_name)}`
  })
  .join('\n\n')}`
}

function buildStepReport(
  title: string,
  reportSteps: TaskStep[],
  tasks: Task[],
  employeeMap: Map<string, Employee>,
  mode: 'pending' | 'revision' | 'missing_report'
) {
  if (reportSteps.length === 0) {
    return `${title}\n\n- Không có.`
  }

  return `${title} (${reportSteps.length})

${reportSteps
  .map((step, index) => {
    const task = getTaskByStep(step, tasks)
    const owner = employeeMap.get(step.owner_id || '')
    const stageApproverId =
      step.approval_stage === 'coo'
        ? step.coo_approver_id
        : step.approval_stage === 'ceo'
          ? step.ceo_approver_id
          : step.department_approver_id || step.approver_id
    const approver = employeeMap.get(stageApproverId || '')
    const approverLine = mode === 'pending' ? `\n- Đang chờ: ${getApprovalWaitingLabel(step)} (${approver?.full_name || 'Chưa gắn'})` : ''
    const revisionLine = mode === 'revision' ? `\n- Người yêu cầu: ${getRevisionRequesterLabel(step)}\n- Lý do làm lại: ${getRevisionNote(step) || 'Chưa có ghi chú'}` : ''

    return `${index + 1}. ${step.step_title}
- Task cha: ${task?.title || 'Không rõ'}
- Người phụ trách: ${owner?.full_name || 'Chưa gắn'}${approverLine}${revisionLine}`
  })
  .join('\n\n')}`
}

function buildPeopleReport(
  peopleReports: Array<{ employee: Employee; total: number; done: number; doing: number; pending: number; overdue: number; problem: number; rate: number }>
) {
  if (peopleReports.length === 0) {
    return 'BÁO CÁO THEO NHÂN SỰ\n\n- Chưa có nhân sự.'
  }

  return `BÁO CÁO THEO NHÂN SỰ

${peopleReports
  .map((person, index) => {
    return `${index + 1}. ${person.employee.full_name}
- Tổng việc: ${person.total}
- Hoàn thành: ${person.done}
- Đang làm: ${person.doing}
- Pending: ${person.pending}
- Trễ: ${person.overdue}
- Vấn đề: ${person.problem}
- Tỷ lệ hoàn thành: ${person.rate}%`
  })
  .join('\n\n')}`
}

function buildProjectReport(projectCards: ProjectCard[]) {
  if (projectCards.length === 0) {
    return 'BÁO CÁO THEO DỰ ÁN\n\n- Chưa có dự án.'
  }

  return `BÁO CÁO THEO DỰ ÁN

${projectCards
  .map((project, index) => {
    return `${index + 1}. ${project.name}
- Tiến độ: ${project.rate}%
- Cảnh báo: ${project.health.label}
- Tổng cảnh báo: ${project.health.totalWarnings}
- Tổng việc: ${project.total}
- Việc trễ: ${project.health.overdueTasks}
- Việc pending: ${project.health.pendingTasks}
- Bước chờ duyệt: ${project.health.pendingSteps}
- Bước cần làm lại: ${project.health.revisionSteps}`
  })
  .join('\n\n')}`
}

// ─── Role helpers ────────────────────────────────────────────────────────────

function filterTasksByRole(
  emp: Employee | null,
  tasks: Task[],
  supporters: TaskSupporter[],
  steps: TaskStep[]
): Task[] {
  if (!emp || !emp.id) return tasks
  const role = emp.role || 'employee'
  if (role === 'ceo' || role === 'coo') return tasks
  if (role === 'admin' && emp.can_view_all) return tasks

  const supportedTaskIds = new Set(
    supporters.filter((s) => s.employee_id === emp.id).map((s) => s.task_id)
  )
  const stepTaskIds = new Set(
    steps
      .filter(
        (s) =>
          s.owner_id === emp.id ||
          s.approver_id === emp.id ||
          s.department_approver_id === emp.id ||
          s.coo_approver_id === emp.id ||
          s.ceo_approver_id === emp.id
      )
      .map((s) => s.task_id)
  )

  return tasks.filter((task) => {
    if (task.assignee_id === emp.id || task.head_id === emp.id) return true
    if (supportedTaskIds.has(task.id)) return true
    if (stepTaskIds.has(task.id)) return true
    if (
      (role === 'department_head' || emp.is_department_head) &&
      emp.department_id &&
      task.department_id === emp.department_id
    )
      return true
    return false
  })
}

// ─── AdminUsersView ───────────────────────────────────────────────────────────

type AdminEmployee = {
  id: string
  full_name: string
  position: string | null
  role: string | null
  status: string | null
  department_id: string | null
  auth_user_id: string | null
  is_department_head: boolean | null
  can_view_all: boolean | null
  can_manage_users: boolean | null
  can_manage_tasks: boolean | null
}

const ROLE_OPTIONS = [
  { value: 'employee', label: 'Nhân viên' },
  { value: 'department_head', label: 'Trưởng bộ phận' },
  { value: 'admin', label: 'Admin' },
  { value: 'coo', label: 'COO' },
  { value: 'ceo', label: 'CEO' },
]

function AdminUsersView(props: {
  departments: Department[]
  onRefresh: () => void
}) {
  const [employees, setEmployees] = useState<AdminEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createRole, setCreateRole] = useState('employee')
  const [createDept, setCreateDept] = useState('')
  const [createPosition, setCreatePosition] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  async function fetchEmployees() {
    setLoading(true)
    const { data } = await supabase
      .from('employees')
      .select('id, full_name, position, role, status, department_id, auth_user_id, is_department_head, can_view_all, can_manage_users, can_manage_tasks')
      .order('full_name')
    setEmployees((data || []) as AdminEmployee[])
    setLoading(false)
  }

  useEffect(() => { fetchEmployees() }, [])

  async function updateEmployee(id: string, patch: Partial<AdminEmployee>) {
    setSaving(id)
    await supabase.from('employees').update(patch).eq('id', id)
    setSaving(null)
    await fetchEmployees()
  }

  async function toggleStatus(emp: AdminEmployee) {
    await updateEmployee(emp.id, { status: emp.status === 'active' ? 'inactive' : 'active' })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    setCreating(true)

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: createEmail,
        password: createPassword,
        fullName: createName,
        role: createRole,
        departmentId: createDept || null,
        position: createPosition || null,
      }),
    })

    const json = await res.json()
    setCreating(false)

    if (!res.ok) {
      setCreateError(json.error || 'Lỗi tạo tài khoản')
      return
    }

    setShowCreate(false)
    setCreateName('')
    setCreateEmail('')
    setCreatePassword('')
    setCreateRole('employee')
    setCreateDept('')
    setCreatePosition('')
    await fetchEmployees()
  }

  const deptMap = new Map(props.departments.map((d) => [d.id, d.name]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#64748B]">{employees.length} nhân sự</p>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-xl bg-[#1B4FD8] px-4 py-2 text-sm font-extrabold text-white"
        >
          + Tạo tài khoản
        </button>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
          <h3 className="mb-4 text-base font-extrabold">Tạo tài khoản nhân viên</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-[#64748B]">Họ và tên *</label>
              <input required value={createName} onChange={(e) => setCreateName(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#1B4FD8]" placeholder="Nguyễn Văn A" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[#64748B]">Email *</label>
              <input required type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#1B4FD8]" placeholder="email@vyvyhaircare.com" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[#64748B]">Mật khẩu *</label>
              <input required type="password" minLength={6} value={createPassword} onChange={(e) => setCreatePassword(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#1B4FD8]" placeholder="Tối thiểu 6 ký tự" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[#64748B]">Chức vụ</label>
              <input value={createPosition} onChange={(e) => setCreatePosition(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#1B4FD8]" placeholder="Nhân viên Marketing..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[#64748B]">Role</label>
              <select value={createRole} onChange={(e) => setCreateRole(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#1B4FD8]">
                {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[#64748B]">Phòng ban</label>
              <select value={createDept} onChange={(e) => setCreateDept(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#1B4FD8]">
                <option value="">Chọn phòng ban</option>
                {props.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {createError && (
              <div className="col-span-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{createError}</div>
            )}
            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={creating}
                className="rounded-xl bg-[#1B4FD8] px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">
                {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
              </button>
              <button type="button" onClick={() => { setShowCreate(false); setCreateError('') }}
                className="rounded-xl border border-[#E2E8F0] px-5 py-2.5 text-sm font-bold text-[#64748B]">
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#64748B]">Đang tải...</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[#64748B]">Họ tên</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[#64748B]">Chức vụ</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[#64748B]">Phòng ban</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[#64748B]">Role</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[#64748B]">Quyền thêm</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[#64748B]">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[#64748B]">Auth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3 font-bold">{emp.full_name}</td>
                  <td className="px-4 py-3 text-[#64748B]">{emp.position || '—'}</td>
                  <td className="px-4 py-3 text-[#64748B]">{deptMap.get(emp.department_id || '') || '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={emp.role || 'employee'}
                      disabled={saving === emp.id}
                      onChange={(e) => updateEmployee(emp.id, { role: e.target.value })}
                      className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs font-bold outline-none"
                    >
                      {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {[
                        { key: 'can_view_all', label: 'Xem tất cả', val: emp.can_view_all },
                        { key: 'can_manage_users', label: 'Quản lý user', val: emp.can_manage_users },
                        { key: 'can_manage_tasks', label: 'Quản lý task', val: emp.can_manage_tasks },
                      ].map((perm) => (
                        <button
                          key={perm.key}
                          type="button"
                          onClick={() => updateEmployee(emp.id, { [perm.key]: !perm.val } as Partial<AdminEmployee>)}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            perm.val ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {perm.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleStatus(emp)}
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        emp.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {emp.status === 'active' ? 'Đang hoạt động' : 'Đã khóa'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {emp.auth_user_id ? (
                        <>
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Đã liên kết</span>
                          <ResetPasswordButton authUserId={emp.auth_user_id} />
                        </>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">Chưa liên kết</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ResetPasswordButton({ authUserId }: { authUserId: string }) {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authUserId, newPassword: pw }),
    })
    setLoading(false)
    if (res.ok) {
      setMsg('Đã đặt lại mật khẩu!')
      setPw('')
      setTimeout(() => { setOpen(false); setMsg('') }, 1500)
    } else {
      const j = await res.json()
      setMsg(j.error || 'Lỗi')
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-200">
        Đặt lại MK
      </button>
    )
  }

  return (
    <form onSubmit={handleReset} className="flex flex-col gap-1">
      <input required minLength={6} type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        placeholder="Mật khẩu mới" className="h-7 w-32 rounded border border-[#E2E8F0] px-2 text-xs outline-none" />
      {msg && <p className={`text-[10px] font-bold ${msg.includes('Đã') ? 'text-emerald-600' : 'text-red-600'}`}>{msg}</p>}
      <div className="flex gap-1">
        <button type="submit" disabled={loading}
          className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white disabled:opacity-60">
          {loading ? '...' : 'Lưu'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setMsg('') }}
          className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          Hủy
        </button>
      </div>
    </form>
  )
}
