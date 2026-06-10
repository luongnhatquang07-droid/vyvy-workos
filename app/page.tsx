'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

type Department = {
  id: string
  code: string
  name: string
}

type Employee = {
  id: string
  full_name: string
  position: string | null
}

type Project = {
  id: string
  name: string
  code: string | null
  status?: string | null
  progress_percent?: number | null
}

type Task = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  progress_percent: number
  due_date: string | null
  department_id: string | null
  assignee_id: string | null
  project_id: string | null
  parent_task_id?: string | null
  task_level?: string | null
  head_id?: string | null
  issue_status?: string | null
  issue_note?: string | null
  support_note?: string | null
  created_at?: string
}

type TaskStep = {
  id: string
  task_id: string
  step_title: string
  step_order: number
  is_done: boolean
  owner_id: string | null
  note: string | null
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

type ImportTaskPreview = {
  title: string
  description: string
  headName: string
  supporterNames: string
  dueDate: string
  steps: string[]
}

type ViewKey = 'dashboard' | 'coo' | 'projects' | 'tasks' | 'meeting'

export default function Home() {
  const [activeView, setActiveView] = useState<ViewKey>('coo')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [tasks, setTasks] = useState<Task[]>([])
  const [steps, setSteps] = useState<TaskStep[]>([])
  const [supporters, setSupporters] = useState<TaskSupporter[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [selectedWorkstreamId, setSelectedWorkstreamId] = useState<string>('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
  const [newDepartmentId, setNewDepartmentId] = useState('')
  const [newHeadId, setNewHeadId] = useState('')
  const [newAssigneeId, setNewAssigneeId] = useState('')
  const [newPriority, setNewPriority] = useState('medium')

  const [meetingTitle, setMeetingTitle] = useState('Biên bản họp vận hành')
  const [meetingRaw, setMeetingRaw] = useState('')
  const [meetingPreview, setMeetingPreview] = useState<ImportTaskPreview[]>([])

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([
      fetchTasks(),
      fetchSteps(),
      fetchSupporters(),
      fetchDepartments(),
      fetchEmployees(),
      fetchProjects(),
    ])
    setLoading(false)
  }

  async function fetchTasks() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      setTasks([])
      return
    }

    setTasks((data || []) as Task[])
  }

  async function fetchSteps() {
    const { data, error } = await supabase
      .from('task_steps')
      .select('*')
      .order('step_order', { ascending: true })

    if (error) {
      console.error(error)
      setSteps([])
      return
    }

    setSteps((data || []) as TaskStep[])
  }

  async function fetchSupporters() {
    const { data, error } = await supabase
      .from('task_supporters')
      .select('*, employees(id, full_name)')

    if (error) {
      console.error(error)
      setSupporters([])
      return
    }

    setSupporters((data || []) as TaskSupporter[])
  }

  async function fetchDepartments() {
    const { data } = await supabase
      .from('departments')
      .select('id, code, name')
      .order('name', { ascending: true })

    const rows = data || []
    setDepartments(rows)

    if (rows.length > 0) {
      setNewDepartmentId((current) => current || rows[0].id)
    }
  }

  async function fetchEmployees() {
    const { data } = await supabase
      .from('employees')
      .select('id, full_name, position')
      .order('full_name', { ascending: true })

    const rows = data || []
    setEmployees(rows)

    if (rows.length > 0) {
      setNewHeadId((current) => current || rows[0].id)
      setNewAssigneeId((current) => current || rows[0].id)
    }
  }

  async function fetchProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, name, code, status, progress_percent')
      .order('name', { ascending: true })

    const rows = data || []
    setProjects(rows)

    if (rows.length > 0) {
      setNewProjectId((current) => current || rows[0].id)
    }
  }

  async function createWorkstream() {
    if (!newTitle.trim()) {
      alert('Nhập tên đầu việc lớn trước.')
      return
    }

    setSaving(true)

    const { error } = await supabase.from('tasks').insert({
      title: newTitle,
      description: newDescription,
      task_level: 'workstream',
      status: 'not_started',
      priority: newPriority,
      progress_percent: 0,
      due_date: newDueDate || null,
      department_id: newDepartmentId || null,
      assignee_id: newAssigneeId || null,
      head_id: newHeadId || null,
      project_id: newProjectId || null,
      issue_status: 'normal',
    })

    if (error) {
      console.error(error)
      alert('Tạo đầu việc lớn bị lỗi.')
    } else {
      setNewTitle('')
      setNewDescription('')
      setNewDueDate('')
      await fetchAll()
    }

    setSaving(false)
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
      alert('Cập nhật trạng thái lỗi.')
      return
    }

    await fetchAll()
  }

  async function updateIssueStatus(taskId: string, issueStatus: string) {
    const { error } = await supabase
      .from('tasks')
      .update({
        issue_status: issueStatus,
      })
      .eq('id', taskId)

    if (error) {
      console.error(error)
      alert('Cập nhật tình trạng lỗi.')
      return
    }

    await fetchAll()
  }

  async function toggleStep(step: TaskStep) {
    const { error } = await supabase
      .from('task_steps')
      .update({
        is_done: !step.is_done,
      })
      .eq('id', step.id)

    if (error) {
      console.error(error)
      alert('Cập nhật bước lỗi.')
      return
    }

    await fetchAll()
  }

  async function createSubtask(parentTaskId: string) {
    const title = prompt('Nhập tên đầu việc con:')
    if (!title) return

    const parent = tasks.find((task) => task.id === parentTaskId)

    const { error } = await supabase.from('tasks').insert({
      title,
      description: '',
      parent_task_id: parentTaskId,
      task_level: 'subtask',
      status: 'not_started',
      priority: 'medium',
      progress_percent: 0,
      due_date: parent?.due_date || null,
      department_id: parent?.department_id || null,
      assignee_id: parent?.assignee_id || null,
      head_id: parent?.head_id || null,
      project_id: parent?.project_id || null,
      issue_status: 'normal',
    })

    if (error) {
      console.error(error)
      alert('Tạo đầu việc con lỗi.')
      return
    }

    await fetchAll()
  }

  async function createStep(taskId: string) {
    const stepTitle = prompt('Nhập bước thực hiện:')
    if (!stepTitle) return

    const currentSteps = steps.filter((step) => step.task_id === taskId)
    const nextOrder = currentSteps.length + 1

    const { error } = await supabase.from('task_steps').insert({
      task_id: taskId,
      step_title: stepTitle,
      step_order: nextOrder,
      is_done: false,
    })

    if (error) {
      console.error(error)
      alert('Tạo bước thực hiện lỗi.')
      return
    }

    await fetchAll()
  }

  async function createSupporter(taskId: string) {
    const employeeName = prompt('Nhập tên người hỗ trợ đúng như trong hệ thống, ví dụ: Quang, Nhi, Vũ')
    if (!employeeName) return

    const employee = employees.find(
      (item) => normalizeText(item.full_name) === normalizeText(employeeName)
    )

    if (!employee) {
      alert('Không tìm thấy nhân sự này.')
      return
    }

    const { error } = await supabase.from('task_supporters').insert({
      task_id: taskId,
      employee_id: employee.id,
      role_note: 'Hỗ trợ thực hiện',
    })

    if (error) {
      console.error(error)
      alert('Thêm người hỗ trợ lỗi hoặc người này đã tồn tại.')
      return
    }

    await fetchAll()
  }

  function parseMeetingText() {
    if (!meetingRaw.trim()) {
      alert('Dán biên bản họp hoặc upload file .txt trước.')
      return
    }

    const lines = meetingRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const preview: ImportTaskPreview[] = []
    let current: ImportTaskPreview | null = null

    lines.forEach((line) => {
      const lower = normalizeText(line)

      const isMainTask =
        lower.startsWith('dau viec') ||
        lower.startsWith('đầu việc') ||
        lower.startsWith('- ') ||
        lower.startsWith('* ') ||
        lower.match(/^\d+\./)

      if (isMainTask) {
        if (current) preview.push(current)

        current = {
          title: line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').replace(/^Đầu việc lớn:/i, '').trim(),
          description: '',
          headName: '',
          supporterNames: '',
          dueDate: '',
          steps: [],
        }

        return
      }

      if (!current) {
        current = {
          title: line,
          description: '',
          headName: '',
          supporterNames: '',
          dueDate: '',
          steps: [],
        }
        return
      }

      if (lower.includes('head') || lower.includes('phu trach') || lower.includes('phụ trách')) {
        current.headName = line.split(':').slice(1).join(':').trim()
        return
      }

      if (lower.includes('ho tro') || lower.includes('hỗ trợ')) {
        current.supporterNames = line.split(':').slice(1).join(':').trim()
        return
      }

      if (lower.includes('deadline') || lower.includes('han') || lower.includes('hạn')) {
        current.dueDate = extractDateFromLine(line)
        return
      }

      if (lower.includes('buoc') || lower.includes('bước') || lower.startsWith('+')) {
        current.steps.push(line.replace(/^\+\s*/, '').replace(/^Bước\s*\d*:/i, '').trim())
        return
      }

      current.description += current.description ? `\n${line}` : line
    })

    if (current) preview.push(current)

    setMeetingPreview(preview)
  }

  async function importMeetingTasks() {
    if (meetingPreview.length === 0) {
      alert('Bấm “Tách đầu việc” trước.')
      return
    }

    setSaving(true)

    const { data: minute, error: minuteError } = await supabase
      .from('meeting_minutes')
      .insert({
        title: meetingTitle || 'Biên bản họp',
        raw_content: meetingRaw,
        summary: `Tự tách ${meetingPreview.length} đầu việc từ biên bản.`,
      })
      .select('*')
      .single()

    if (minuteError) {
      console.error(minuteError)
    }

    for (const item of meetingPreview) {
      const head = findEmployeeByName(employees, item.headName)
      const firstProject = projects[0]
      const firstDepartment = departments[0]

      const { data: insertedTask, error } = await supabase
        .from('tasks')
        .insert({
          title: item.title,
          description: item.description,
          task_level: 'workstream',
          status: 'not_started',
          priority: 'medium',
          progress_percent: 0,
          due_date: item.dueDate || null,
          assignee_id: head?.id || null,
          head_id: head?.id || null,
          project_id: firstProject?.id || null,
          department_id: firstDepartment?.id || null,
          issue_status: 'watch',
          issue_note: minute ? `Import từ biên bản: ${meetingTitle}` : 'Import từ biên bản họp',
        })
        .select('*')
        .single()

      if (error) {
        console.error(error)
        continue
      }

      if (insertedTask && item.steps.length > 0) {
        const stepRows = item.steps.map((stepTitle, index) => ({
          task_id: insertedTask.id,
          step_title: stepTitle,
          step_order: index + 1,
          is_done: false,
        }))

        await supabase.from('task_steps').insert(stepRows)
      }

      if (insertedTask && item.supporterNames) {
        const supporterNames = item.supporterNames
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)

        for (const name of supporterNames) {
          const employee = findEmployeeByName(employees, name)
          if (employee) {
            await supabase.from('task_supporters').insert({
              task_id: insertedTask.id,
              employee_id: employee.id,
              role_note: 'Hỗ trợ từ biên bản họp',
            })
          }
        }
      }
    }

    setMeetingPreview([])
    setMeetingRaw('')
    await fetchAll()
    setSaving(false)
    alert('Đã import đầu việc từ biên bản họp.')
  }

  function handleUploadTextFile(file?: File) {
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setMeetingRaw(String(reader.result || ''))
    }
    reader.readAsText(file)
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
      const current = map.get(step.task_id) || []
      current.push(step)
      map.set(step.task_id, current)
    })
    return map
  }, [steps])

  const supportersByTask = useMemo(() => {
    const map = new Map<string, TaskSupporter[]>()
    supporters.forEach((supporter) => {
      const current = map.get(supporter.task_id) || []
      current.push(supporter)
      map.set(supporter.task_id, current)
    })
    return map
  }, [supporters])

  const workstreams = tasks.filter((task) => {
    const isWorkstream = task.task_level === 'workstream' || !task.parent_task_id
    const matchProject = selectedProjectId === 'all' || task.project_id === selectedProjectId
    return isWorkstream && matchProject
  })

  const selectedWorkstream = workstreams.find((task) => task.id === selectedWorkstreamId) || workstreams[0]
  const selectedWorkstreamSubtasks = selectedWorkstream
    ? tasks.filter((task) => task.parent_task_id === selectedWorkstream.id)
    : []

  const projectCards = projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.project_id === project.id)
    const done = projectTasks.filter((task) => task.status === 'completed').length
    const overdue = projectTasks.filter((task) => isTaskOverdue(task)).length
    const problem = projectTasks.filter((task) => isTaskProblem(task)).length
    const rate = projectTasks.length === 0 ? 0 : Math.round((done / projectTasks.length) * 100)

    return {
      ...project,
      total: projectTasks.length,
      done,
      overdue,
      problem,
      rate,
    }
  })

  const peopleReports = employees.map((employee) => {
    const ownedTasks = tasks.filter((task) => task.assignee_id === employee.id || task.head_id === employee.id)
    const done = ownedTasks.filter((task) => task.status === 'completed').length
    const overdue = ownedTasks.filter((task) => isTaskOverdue(task)).length
    const problem = ownedTasks.filter((task) => isTaskProblem(task)).length
    const rate = ownedTasks.length === 0 ? 0 : Math.round((done / ownedTasks.length) * 100)

    return {
      employee,
      total: ownedTasks.length,
      done,
      overdue,
      problem,
      rate,
      urgentTasks: ownedTasks.filter((task) => isTaskOverdue(task) || isTaskProblem(task)).slice(0, 3),
    }
  })

  const urgentTasks = tasks
    .filter((task) => isTaskOverdue(task) || isTaskProblem(task) || isTaskSlow(task, stepsByTask.get(task.id) || []))
    .slice(0, 12)

  const menu = [
    { key: 'dashboard' as ViewKey, label: 'Thống kê', icon: '📊' },
    { key: 'coo' as ViewKey, label: 'COO Board', icon: '🧭' },
    { key: 'projects' as ViewKey, label: 'Dự án', icon: '📁' },
    { key: 'tasks' as ViewKey, label: 'Công việc', icon: '✅' },
    { key: 'meeting' as ViewKey, label: 'Biên bản họp', icon: '📄' },
  ]

  return (
    <main className="min-h-screen bg-[#F4F6F9] text-[#0F172A]">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        html,
        body {
          font-family: 'Inter', sans-serif;
          background: #f4f6f9;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>

      <aside
        className={`fixed left-0 top-0 z-30 h-screen bg-[#0F172A] text-white transition-all duration-200 ${
          sidebarCollapsed ? 'w-[64px]' : 'w-[240px]'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1B4FD8] font-extrabold">
                V
              </div>
              {!sidebarCollapsed && (
                <div>
                  <h1 className="text-sm font-extrabold">VyVy WorkOS</h1>
                  <p className="text-[11px] text-slate-400">COO Operating System</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              {sidebarCollapsed ? '›' : '‹'}
            </button>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {menu.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold transition ${
                  activeView === item.key
                    ? 'bg-[#1B4FD8] text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            ))}
          </nav>

          <div className="border-t border-white/10 p-3">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <Avatar name="Quang" />
              {!sidebarCollapsed && (
                <div>
                  <p className="text-sm font-bold">Quang</p>
                  <p className="text-[11px] text-slate-400">Admin / OPS</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <section
        className={`min-h-screen transition-all duration-200 ${
          sidebarCollapsed ? 'ml-[64px]' : 'ml-[240px]'
        }`}
      >
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#E2E8F0] bg-white px-6">
          <div>
            <h2 className="text-lg font-extrabold">
              {activeView === 'dashboard' && 'Thống kê vận hành'}
              {activeView === 'coo' && 'COO Board'}
              {activeView === 'projects' && 'Tổng dự án'}
              {activeView === 'tasks' && 'Quản lý công việc'}
              {activeView === 'meeting' && 'Nhập biên bản họp'}
            </h2>
            <p className="text-xs text-[#64748B]">
              Sếp bấm vào là hiểu rõ dự án, nhân sự, việc chậm và việc cần hối thúc.
            </p>
          </div>

          <button
            onClick={fetchAll}
            className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-bold hover:bg-[#F8FAFC]"
          >
            🔄 Làm mới dữ liệu
          </button>
        </header>

        <div className="p-6">
          {loading ? (
            <DashboardSkeleton />
          ) : (
            <>
              {activeView === 'dashboard' && (
                <DashboardView
                  tasks={tasks}
                  urgentTasks={urgentTasks}
                  projectCards={projectCards}
                  peopleReports={peopleReports}
                  employeeMap={employeeMap}
                  projectMap={projectMap}
                  setActiveView={setActiveView}
                  setSelectedProjectId={setSelectedProjectId}
                  setSelectedTask={setSelectedTask}
                  getStatusLabel={getStatusLabel}
                />
              )}

              {activeView === 'coo' && (
                <CooBoard
                  workstreams={workstreams}
                  selectedProjectId={selectedProjectId}
                  setSelectedProjectId={setSelectedProjectId}
                  projects={projects}
                  selectedWorkstream={selectedWorkstream}
                  selectedWorkstreamId={selectedWorkstream?.id || ''}
                  setSelectedWorkstreamId={setSelectedWorkstreamId}
                  subtasks={selectedWorkstreamSubtasks}
                  stepsByTask={stepsByTask}
                  supportersByTask={supportersByTask}
                  employeeMap={employeeMap}
                  departmentMap={departmentMap}
                  projectMap={projectMap}
                  setSelectedTask={setSelectedTask}
                  createSubtask={createSubtask}
                  createStep={createStep}
                  createSupporter={createSupporter}
                  toggleStep={toggleStep}
                  updateTaskStatus={updateTaskStatus}
                  updateIssueStatus={updateIssueStatus}
                  getStatusLabel={getStatusLabel}
                />
              )}

              {activeView === 'projects' && (
                <ProjectsView
                  projectCards={projectCards}
                  tasks={tasks}
                  employeeMap={employeeMap}
                  setActiveView={setActiveView}
                  setSelectedProjectId={setSelectedProjectId}
                  setSelectedTask={setSelectedTask}
                  getStatusLabel={getStatusLabel}
                />
              )}

              {activeView === 'tasks' && (
                <TasksView
                  tasks={tasks}
                  workstreams={workstreams}
                  employeeMap={employeeMap}
                  departmentMap={departmentMap}
                  projectMap={projectMap}
                  setSelectedTask={setSelectedTask}
                  updateTaskStatus={updateTaskStatus}
                  getStatusLabel={getStatusLabel}
                />
              )}

              {activeView === 'meeting' && (
                <MeetingImportView
                  meetingTitle={meetingTitle}
                  setMeetingTitle={setMeetingTitle}
                  meetingRaw={meetingRaw}
                  setMeetingRaw={setMeetingRaw}
                  meetingPreview={meetingPreview}
                  parseMeetingText={parseMeetingText}
                  importMeetingTasks={importMeetingTasks}
                  handleUploadTextFile={handleUploadTextFile}
                  saving={saving}
                />
              )}
            </>
          )}
        </div>
      </section>

      {activeView === 'coo' && (
        <FloatingCreateBox
          projects={projects}
          departments={departments}
          employees={employees}
          newTitle={newTitle}
          setNewTitle={setNewTitle}
          newDescription={newDescription}
          setNewDescription={setNewDescription}
          newDueDate={newDueDate}
          setNewDueDate={setNewDueDate}
          newProjectId={newProjectId}
          setNewProjectId={setNewProjectId}
          newDepartmentId={newDepartmentId}
          setNewDepartmentId={setNewDepartmentId}
          newHeadId={newHeadId}
          setNewHeadId={setNewHeadId}
          newAssigneeId={newAssigneeId}
          setNewAssigneeId={setNewAssigneeId}
          newPriority={newPriority}
          setNewPriority={setNewPriority}
          createWorkstream={createWorkstream}
          saving={saving}
        />
      )}

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          employeeMap={employeeMap}
          departmentMap={departmentMap}
          projectMap={projectMap}
          steps={stepsByTask.get(selectedTask.id) || []}
          supporters={supportersByTask.get(selectedTask.id) || []}
          close={() => setSelectedTask(null)}
          toggleStep={toggleStep}
          createStep={createStep}
          createSupporter={createSupporter}
          updateTaskStatus={updateTaskStatus}
          updateIssueStatus={updateIssueStatus}
          getStatusLabel={getStatusLabel}
        />
      )}
    </main>
  )
}

function DashboardView(props: {
  tasks: Task[]
  urgentTasks: Task[]
  projectCards: any[]
  peopleReports: any[]
  employeeMap: Map<string, Employee>
  projectMap: Map<string, Project>
  setActiveView: (view: ViewKey) => void
  setSelectedProjectId: (id: string) => void
  setSelectedTask: (task: Task) => void
  getStatusLabel: (status: string) => string
}) {
  const total = props.tasks.length
  const done = props.tasks.filter((task) => task.status === 'completed').length
  const doing = props.tasks.filter((task) => task.status === 'in_progress').length
  const pending = props.tasks.filter((task) => task.status === 'pending').length
  const overdue = props.tasks.filter((task) => isTaskOverdue(task)).length
  const rate = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <MetricCard label="Tổng đầu việc" value={total} icon="📋" tone="blue" />
        <MetricCard label="Hoàn thành" value={done} icon="✅" tone="green" />
        <MetricCard label="Đang làm" value={doing} icon="🔵" tone="blue" />
        <MetricCard label="Pending" value={pending} icon="🟣" tone="purple" />
        <MetricCard label="Trễ deadline" value={overdue} icon="🔴" tone="red" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-extrabold">Tổng quan dự án</h3>
              <p className="text-sm text-[#64748B]">
                Bấm vào từng dự án để xem việc chậm, việc có vấn đề và người cần hối thúc.
              </p>
            </div>
            <Gauge value={rate} label="Tỷ lệ hoàn thành" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {props.projectCards.map((project) => (
              <button
                key={project.id}
                onClick={() => {
                  props.setSelectedProjectId(project.id)
                  props.setActiveView('coo')
                }}
                className="rounded-2xl border border-[#E2E8F0] bg-white p-4 text-left transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-extrabold">{project.name}</p>
                  <span className={project.problem + project.overdue > 0 ? 'text-red-600' : 'text-emerald-600'}>
                    {project.problem + project.overdue > 0 ? '⚠️' : '✅'}
                  </span>
                </div>

                <ProgressBar value={project.rate} />

                <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                  <MiniStat label="Tổng" value={project.total} />
                  <MiniStat label="Xong" value={project.done} />
                  <MiniStat label="Chậm" value={project.overdue} danger />
                  <MiniStat label="Vấn đề" value={project.problem} danger />
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-lg font-extrabold">Danh sách cần hối thúc</h3>

          <div className="space-y-3">
            {props.urgentTasks.length === 0 ? (
              <EmptyState title="Không có cảnh báo" description="Hiện chưa có việc trễ hoặc pending." />
            ) : (
              props.urgentTasks.map((task) => {
                const person = props.employeeMap.get(task.assignee_id || task.head_id || '')
                const project = props.projectMap.get(task.project_id || '')

                return (
                  <button
                    key={task.id}
                    onClick={() => props.setSelectedTask(task)}
                    className="w-full rounded-2xl border border-red-100 bg-red-50/70 p-4 text-left transition hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-extrabold">{task.title}</p>
                        <p className="mt-1 text-sm text-[#64748B]">
                          {project?.name || 'Chưa gắn dự án'} · {person?.full_name || 'Chưa gắn người'}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-red-600">
                        {getUrgentReason(task)}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="mb-4 text-lg font-extrabold">Báo cáo theo nhân sự</h3>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b bg-[#F8FAFC] text-xs uppercase text-[#64748B]">
                <th className="p-3">Nhân sự</th>
                <th className="p-3">Tổng việc</th>
                <th className="p-3">Hoàn thành</th>
                <th className="p-3">Trễ</th>
                <th className="p-3">Có vấn đề</th>
                <th className="p-3">Tỷ lệ</th>
                <th className="p-3">Cần hối thúc</th>
              </tr>
            </thead>
            <tbody>
              {props.peopleReports.map((row) => (
                <tr key={row.employee.id} className="border-b hover:bg-[#F8FAFC]">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={row.employee.full_name} />
                      <div>
                        <p className="font-bold">{row.employee.full_name}</p>
                        <p className="text-xs text-[#64748B]">{row.employee.position || 'Nhân sự'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 font-bold">{row.total}</td>
                  <td className="p-3 text-emerald-600 font-bold">{row.done}</td>
                  <td className="p-3 text-red-600 font-bold">{row.overdue}</td>
                  <td className="p-3 text-amber-600 font-bold">{row.problem}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-28">
                        <ProgressBar value={row.rate} />
                      </div>
                      <span className="font-bold">{row.rate}%</span>
                    </div>
                  </td>
                  <td className="p-3">
                    {row.urgentTasks.length === 0 ? (
                      <span className="text-[#94A3B8]">Không có</span>
                    ) : (
                      <span className="font-bold text-red-600">{row.urgentTasks.length} việc</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function CooBoard(props: {
  workstreams: Task[]
  selectedProjectId: string
  setSelectedProjectId: (id: string) => void
  projects: Project[]
  selectedWorkstream?: Task
  selectedWorkstreamId: string
  setSelectedWorkstreamId: (id: string) => void
  subtasks: Task[]
  stepsByTask: Map<string, TaskStep[]>
  supportersByTask: Map<string, TaskSupporter[]>
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  projectMap: Map<string, Project>
  setSelectedTask: (task: Task) => void
  createSubtask: (parentTaskId: string) => void
  createStep: (taskId: string) => void
  createSupporter: (taskId: string) => void
  toggleStep: (step: TaskStep) => void
  updateTaskStatus: (taskId: string, status: string) => void
  updateIssueStatus: (taskId: string, status: string) => void
  getStatusLabel: (status: string) => string
}) {
  const selected = props.selectedWorkstream

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[330px_1fr]">
      <Card>
        <div className="mb-4">
          <h3 className="text-lg font-extrabold">Đầu việc lớn</h3>
          <p className="text-sm text-[#64748B]">Chọn dự án và đầu việc lớn để xem chi tiết.</p>
        </div>

        <select
          className="mb-4 h-11 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#1B4FD8]"
          value={props.selectedProjectId}
          onChange={(e) => props.setSelectedProjectId(e.target.value)}
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
            <EmptyState title="Chưa có đầu việc lớn" description="Tạo mới ở hộp bên phải dưới màn hình." />
          ) : (
            props.workstreams.map((task) => {
              const head = props.employeeMap.get(task.head_id || task.assignee_id || '')
              const active = task.id === selected?.id

              return (
                <button
                  key={task.id}
                  onClick={() => props.setSelectedWorkstreamId(task.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition hover:shadow-md ${
                    active ? 'border-[#1B4FD8] bg-[#E6F1FB]' : 'border-[#E2E8F0] bg-white'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-extrabold">{task.title}</p>
                    <IssueBadge issueStatus={task.issue_status} />
                  </div>
                  <p className="text-sm text-[#64748B]">
                    Head: {head?.full_name || 'Chưa gắn'} · Deadline: {task.due_date || 'Chưa có'}
                  </p>
                  <div className="mt-3">
                    <ProgressBar value={calculateTaskProgress(task, props.stepsByTask.get(task.id) || [])} />
                  </div>
                </button>
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
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-2xl font-extrabold">{selected.title}</h3>
                    <IssueBadge issueStatus={selected.issue_status} />
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
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => props.createSubtask(selected.id)}
                    className="rounded-xl bg-[#1B4FD8] px-4 py-2 text-sm font-bold text-white"
                  >
                    + Đầu việc con
                  </button>
                  <button
                    onClick={() => props.setSelectedTask(selected)}
                    className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold"
                  >
                    Chi tiết
                  </button>
                </div>
              </div>
            </Card>

            <div className="space-y-4">
              {props.subtasks.length === 0 ? (
                <Card>
                  <EmptyState title="Chưa có đầu việc con" description="Bấm + Đầu việc con để tạo." />
                </Card>
              ) : (
                props.subtasks.map((task) => (
                  <SubtaskCard
                    key={task.id}
                    task={task}
                    steps={props.stepsByTask.get(task.id) || []}
                    supporters={props.supportersByTask.get(task.id) || []}
                    employeeMap={props.employeeMap}
                    departmentMap={props.departmentMap}
                    setSelectedTask={props.setSelectedTask}
                    createStep={props.createStep}
                    createSupporter={props.createSupporter}
                    toggleStep={props.toggleStep}
                    updateTaskStatus={props.updateTaskStatus}
                    updateIssueStatus={props.updateIssueStatus}
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

function SubtaskCard(props: {
  task: Task
  steps: TaskStep[]
  supporters: TaskSupporter[]
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  setSelectedTask: (task: Task) => void
  createStep: (taskId: string) => void
  createSupporter: (taskId: string) => void
  toggleStep: (step: TaskStep) => void
  updateTaskStatus: (taskId: string, status: string) => void
  updateIssueStatus: (taskId: string, status: string) => void
  getStatusLabel: (status: string) => string
}) {
  const head = props.employeeMap.get(props.task.head_id || props.task.assignee_id || '')
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
            Head: <b>{head?.full_name || 'Chưa gắn'}</b> · Deadline: <b>{props.task.due_date || 'Chưa có'}</b>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            className="h-10 rounded-xl border border-[#E2E8F0] px-2 text-xs font-bold"
            value={props.task.status}
            onChange={(e) => props.updateTaskStatus(props.task.id, e.target.value)}
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
            onChange={(e) => props.updateIssueStatus(props.task.id, e.target.value)}
          >
            <option value="normal">Bình thường</option>
            <option value="watch">Cần theo dõi</option>
            <option value="slow">Đang chậm</option>
            <option value="problem">Có vấn đề</option>
          </select>

          <button
            onClick={() => props.setSelectedTask(props.task)}
            className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs font-bold hover:bg-[#F8FAFC]"
          >
            Mở chi tiết
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-bold">Tiến độ theo bước</span>
          <span className="font-extrabold text-[#1B4FD8]">{progress}%</span>
        </div>
        <ProgressBar value={progress} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <div className="rounded-2xl bg-[#F8FAFC] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-extrabold">Các bước thực hiện</p>
            <button
              onClick={() => props.createStep(props.task.id)}
              className="rounded-lg bg-white px-3 py-1 text-xs font-bold hover:shadow"
            >
              + Bước
            </button>
          </div>

          <div className="space-y-2">
            {props.steps.length === 0 ? (
              <p className="text-sm text-[#64748B]">Chưa có bước thực hiện.</p>
            ) : (
              props.steps.map((step) => (
                <label
                  key={step.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 hover:shadow-sm"
                >
                  <input
                    type="checkbox"
                    checked={step.is_done}
                    onChange={() => props.toggleStep(step)}
                    className="mt-1"
                  />
                  <div>
                    <p className={`text-sm font-bold ${step.is_done ? 'text-[#94A3B8] line-through' : ''}`}>
                      {step.step_order}. {step.step_title}
                    </p>
                    {step.note && <p className="text-xs text-[#64748B]">{step.note}</p>}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-[#F8FAFC] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-extrabold">Người hỗ trợ</p>
            <button
              onClick={() => props.createSupporter(props.task.id)}
              className="rounded-lg bg-white px-3 py-1 text-xs font-bold hover:shadow"
            >
              + Hỗ trợ
            </button>
          </div>

          <div className="space-y-2">
            {props.supporters.length === 0 ? (
              <p className="text-sm text-[#64748B]">Chưa có người hỗ trợ.</p>
            ) : (
              props.supporters.map((supporter) => (
                <div key={supporter.id} className="flex items-center gap-2 rounded-xl bg-white p-3">
                  <Avatar name={supporter.employees?.full_name || 'NA'} />
                  <div>
                    <p className="text-sm font-bold">{supporter.employees?.full_name || 'Không rõ'}</p>
                    <p className="text-xs text-[#64748B]">{supporter.role_note || 'Hỗ trợ'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {(props.task.issue_note || overdue || slow || problem) && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          <b>Ghi chú COO:</b>{' '}
          {props.task.issue_note || getUrgentReason(props.task)}
        </div>
      )}
    </div>
  )
}

function ProjectsView(props: {
  projectCards: any[]
  tasks: Task[]
  employeeMap: Map<string, Employee>
  setActiveView: (view: ViewKey) => void
  setSelectedProjectId: (id: string) => void
  setSelectedTask: (task: Task) => void
  getStatusLabel: (status: string) => string
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      {props.projectCards.map((project) => {
        const projectTasks = props.tasks.filter((task) => task.project_id === project.id)
        const urgent = projectTasks.filter((task) => isTaskOverdue(task) || isTaskProblem(task)).slice(0, 4)

        return (
          <Card key={project.id}>
            <button
              onClick={() => {
                props.setSelectedProjectId(project.id)
                props.setActiveView('coo')
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
                <p className="text-2xl font-extrabold text-[#1B4FD8]">{project.rate}%</p>
              </div>

              <ProgressBar value={project.rate} />

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Tổng" value={project.total} />
                <MiniStat label="Trễ" value={project.overdue} danger />
                <MiniStat label="Vấn đề" value={project.problem} danger />
              </div>
            </button>

            <div className="mt-5 border-t pt-4">
              <p className="mb-3 text-sm font-extrabold">Việc cần chú ý</p>

              {urgent.length === 0 ? (
                <p className="text-sm text-[#64748B]">Chưa có cảnh báo.</p>
              ) : (
                <div className="space-y-2">
                  {urgent.map((task) => (
                    <button
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
  workstreams: Task[]
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
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
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={head?.full_name || 'NA'} />
                      <span className="font-bold">{head?.full_name || 'Chưa gắn'}</span>
                    </div>
                  </td>
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
                        onChange={(e) => props.updateTaskStatus(task.id, e.target.value)}
                      >
                        <option value="not_started">Chưa bắt đầu</option>
                        <option value="in_progress">Đang làm</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Hoàn thành</option>
                        <option value="overdue">Trễ deadline</option>
                      </select>

                      <button
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

function MeetingImportView(props: {
  meetingTitle: string
  setMeetingTitle: (value: string) => void
  meetingRaw: string
  setMeetingRaw: (value: string) => void
  meetingPreview: ImportTaskPreview[]
  parseMeetingText: () => void
  importMeetingTasks: () => void
  handleUploadTextFile: (file?: File) => void
  saving: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_480px]">
      <Card>
        <h3 className="text-lg font-extrabold">Nhập biên bản họp</h3>
        <p className="mt-1 text-sm text-[#64748B]">
          Dán nội dung họp hoặc upload file .txt. Hệ thống sẽ tách thành đầu việc lớn, người phụ trách, hỗ trợ, deadline và các bước.
        </p>

        <div className="mt-5 space-y-4">
          <Input
            placeholder="Tên biên bản họp"
            value={props.meetingTitle}
            onChange={props.setMeetingTitle}
          />

          <input
            type="file"
            accept=".txt"
            onChange={(e) => props.handleUploadTextFile(e.target.files?.[0])}
            className="block w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm"
          />

          <textarea
            className="min-h-[420px] w-full rounded-2xl border border-[#E2E8F0] p-4 text-sm leading-6 outline-none focus:border-[#1B4FD8]"
            placeholder={`Ví dụ:
Đầu việc lớn: Ra mắt campaign TikTok tháng 6
Head: Vũ
Hỗ trợ: Quang, Nhi
Deadline: 2026-06-20
Bước 1: Lấy số liệu ads
Bước 2: Lên outline content
Bước 3: Gửi sếp duyệt

Đầu việc lớn: Chuẩn hóa báo cáo vận hành
Head: Quang
Hỗ trợ: Thùy Linh
Deadline: 2026-06-15
Bước 1: Gom dữ liệu task
Bước 2: Lọc việc trễ
Bước 3: Báo cáo cho sếp Vy`}
            value={props.meetingRaw}
            onChange={(e) => props.setMeetingRaw(e.target.value)}
          />

          <div className="flex gap-3">
            <button
              onClick={props.parseMeetingText}
              className="rounded-xl bg-[#1B4FD8] px-5 py-3 text-sm font-extrabold text-white"
            >
              Tách đầu việc
            </button>
            <button
              onClick={props.importMeetingTasks}
              disabled={props.saving || props.meetingPreview.length === 0}
              className="rounded-xl bg-[#16A34A] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {props.saving ? 'Đang import...' : 'Thêm vào hệ thống'}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 text-lg font-extrabold">Preview đầu việc sau khi tách</h3>

        {props.meetingPreview.length === 0 ? (
          <EmptyState title="Chưa có preview" description="Bấm Tách đầu việc để xem trước." />
        ) : (
          <div className="space-y-4">
            {props.meetingPreview.map((item, index) => (
              <div key={index} className="rounded-2xl border border-[#E2E8F0] p-4">
                <p className="font-extrabold">
                  {index + 1}. {item.title}
                </p>
                <p className="mt-2 text-sm text-[#64748B]">
                  Head: <b>{item.headName || 'Chưa rõ'}</b> · Hỗ trợ:{' '}
                  <b>{item.supporterNames || 'Chưa rõ'}</b> · Deadline:{' '}
                  <b>{item.dueDate || 'Chưa rõ'}</b>
                </p>

                {item.steps.length > 0 && (
                  <div className="mt-3 rounded-xl bg-[#F8FAFC] p-3">
                    <p className="mb-2 text-xs font-extrabold uppercase text-[#64748B]">
                      Các bước
                    </p>
                    <ul className="space-y-1 text-sm">
                      {item.steps.map((step, stepIndex) => (
                        <li key={stepIndex}>
                          {stepIndex + 1}. {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function FloatingCreateBox(props: {
  projects: Project[]
  departments: Department[]
  employees: Employee[]
  newTitle: string
  setNewTitle: (value: string) => void
  newDescription: string
  setNewDescription: (value: string) => void
  newDueDate: string
  setNewDueDate: (value: string) => void
  newProjectId: string
  setNewProjectId: (value: string) => void
  newDepartmentId: string
  setNewDepartmentId: (value: string) => void
  newHeadId: string
  setNewHeadId: (value: string) => void
  newAssigneeId: string
  setNewAssigneeId: (value: string) => void
  newPriority: string
  setNewPriority: (value: string) => void
  createWorkstream: () => void
  saving: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {open && (
        <div className="mb-4 w-[420px] rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-extrabold">Tạo đầu việc lớn</h3>
            <button onClick={() => setOpen(false)} className="font-bold">×</button>
          </div>

          <div className="space-y-3">
            <Input placeholder="Tên đầu việc lớn" value={props.newTitle} onChange={props.setNewTitle} />
            <Input placeholder="Mô tả" value={props.newDescription} onChange={props.setNewDescription} />

            <input
              type="date"
              className="h-12 w-full rounded-2xl border border-[#E2E8F0] px-4 text-sm outline-none"
              value={props.newDueDate}
              onChange={(e) => props.setNewDueDate(e.target.value)}
            />

            <Select value={props.newProjectId} onChange={props.setNewProjectId}>
              {props.projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </Select>

            <Select value={props.newDepartmentId} onChange={props.setNewDepartmentId}>
              {props.departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </Select>

            <Select value={props.newHeadId} onChange={props.setNewHeadId}>
              {props.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>Head: {employee.full_name}</option>
              ))}
            </Select>

            <Select value={props.newPriority} onChange={props.setNewPriority}>
              <option value="low">Ưu tiên thấp</option>
              <option value="medium">Ưu tiên trung bình</option>
              <option value="high">Ưu tiên cao</option>
            </Select>

            <button
              onClick={props.createWorkstream}
              disabled={props.saving}
              className="w-full rounded-xl bg-[#1B4FD8] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {props.saving ? 'Đang tạo...' : 'Tạo đầu việc lớn'}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="rounded-full bg-[#1B4FD8] px-6 py-4 text-sm font-extrabold text-white shadow-xl"
      >
        + Đầu việc lớn
      </button>
    </div>
  )
}

function TaskDetailDrawer(props: {
  task: Task
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  projectMap: Map<string, Project>
  steps: TaskStep[]
  supporters: TaskSupporter[]
  close: () => void
  toggleStep: (step: TaskStep) => void
  createStep: (taskId: string) => void
  createSupporter: (taskId: string) => void
  updateTaskStatus: (taskId: string, status: string) => void
  updateIssueStatus: (taskId: string, status: string) => void
  getStatusLabel: (status: string) => string
}) {
  const head = props.employeeMap.get(props.task.head_id || props.task.assignee_id || '')
  const department = props.departmentMap.get(props.task.department_id || '')
  const project = props.projectMap.get(props.task.project_id || '')
  const progress = calculateTaskProgress(props.task, props.steps)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button className="flex-1" onClick={props.close} />
      <div className="h-full w-[460px] overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Chi tiết vận hành</h3>
          <button onClick={props.close} className="rounded-xl bg-[#F1F5F9] px-3 py-2 font-bold">
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
          <InfoRow label="Deadline" value={props.task.due_date || 'Chưa có'} />

          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="font-bold">Tiến độ theo bước</span>
              <span className="font-extrabold text-[#1B4FD8]">{progress}%</span>
            </div>
            <ProgressBar value={progress} />
          </div>

          <div>
            <p className="mb-2 text-xs font-extrabold uppercase text-[#94A3B8]">
              Cập nhật trạng thái
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Select value={props.task.status} onChange={(value) => props.updateTaskStatus(props.task.id, value)}>
                <option value="not_started">Chưa bắt đầu</option>
                <option value="in_progress">Đang làm</option>
                <option value="pending">Pending</option>
                <option value="completed">Hoàn thành</option>
                <option value="overdue">Trễ deadline</option>
              </Select>

              <Select value={props.task.issue_status || 'normal'} onChange={(value) => props.updateIssueStatus(props.task.id, value)}>
                <option value="normal">Bình thường</option>
                <option value="watch">Cần theo dõi</option>
                <option value="slow">Đang chậm</option>
                <option value="problem">Có vấn đề</option>
              </Select>
            </div>
          </div>

          <div className="rounded-2xl bg-[#F8FAFC] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-extrabold">Các bước</p>
              <button onClick={() => props.createStep(props.task.id)} className="rounded-lg bg-white px-3 py-1 text-xs font-bold">
                + Bước
              </button>
            </div>

            <div className="space-y-2">
              {props.steps.length === 0 ? (
                <p className="text-sm text-[#64748B]">Chưa có bước.</p>
              ) : (
                props.steps.map((step) => (
                  <label key={step.id} className="flex gap-3 rounded-xl bg-white p-3">
                    <input type="checkbox" checked={step.is_done} onChange={() => props.toggleStep(step)} />
                    <span className={step.is_done ? 'line-through text-[#94A3B8]' : 'font-bold'}>
                      {step.step_order}. {step.step_title}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-[#F8FAFC] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-extrabold">Người hỗ trợ</p>
              <button onClick={() => props.createSupporter(props.task.id)} className="rounded-lg bg-white px-3 py-1 text-xs font-bold">
                + Hỗ trợ
              </button>
            </div>

            <div className="space-y-2">
              {props.supporters.length === 0 ? (
                <p className="text-sm text-[#64748B]">Chưa có người hỗ trợ.</p>
              ) : (
                props.supporters.map((supporter) => (
                  <div key={supporter.id} className="flex items-center gap-3 rounded-xl bg-white p-3">
                    <Avatar name={supporter.employees?.full_name || 'NA'} />
                    <div>
                      <p className="font-bold">{supporter.employees?.full_name || 'Không rõ'}</p>
                      <p className="text-xs text-[#64748B]">{supporter.role_note || 'Hỗ trợ'}</p>
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

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      {children}
    </div>
  )
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
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#64748B]">{props.label}</p>
        <span className={`rounded-xl px-3 py-2 ${toneMap[props.tone]}`}>{props.icon}</span>
      </div>
      <p className="mt-4 text-3xl font-extrabold">{props.value}</p>
    </div>
  )
}

function Gauge({ value, label }: { value: number; label: string }) {
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const dash = (value / 100) * circumference

  return (
    <div className="flex items-center gap-3">
      <svg width="86" height="86" viewBox="0 0 86 86">
        <circle cx="43" cy="43" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="8" />
        <circle
          cx="43"
          cy="43"
          r={radius}
          fill="none"
          stroke="#1B4FD8"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 43 43)"
        />
        <text x="43" y="49" textAnchor="middle" className="fill-[#0F172A] text-lg font-extrabold">
          {value}%
        </text>
      </svg>
      <p className="text-sm font-bold text-[#64748B]">{label}</p>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-[#E2E8F0]">
      <div
        className="h-full rounded-full bg-[#1B4FD8]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
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
      className="h-12 w-full rounded-2xl border border-[#E2E8F0] px-4 text-sm outline-none focus:border-[#1B4FD8]"
      placeholder={props.placeholder}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

function Select(props: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <select
      className="h-12 w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none focus:border-[#1B4FD8]"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
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

function calculateTaskProgress(task: Task, steps: TaskStep[]) {
  if (steps.length > 0) {
    const done = steps.filter((step) => step.is_done).length
    return Math.round((done / steps.length) * 100)
  }

  return task.progress_percent || 0
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

function isTaskProblem(task: Task) {
  return task.issue_status === 'problem' || task.status === 'pending'
}

function isTaskSlow(task: Task, steps: TaskStep[]) {
  if (task.status === 'completed') return false
  if (task.issue_status === 'slow') return true
  if (!task.due_date) return false

  const progress = calculateTaskProgress(task, steps)
  const today = new Date()
  const due = new Date(task.due_date)
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  return diff <= 3 && progress < 70
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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function findEmployeeByName(employees: Employee[], name: string) {
  if (!name) return null
  return employees.find((employee) => normalizeText(employee.full_name).includes(normalizeText(name))) || null
}

function extractDateFromLine(line: string) {
  const isoMatch = line.match(/\d{4}-\d{2}-\d{2}/)
  if (isoMatch) return isoMatch[0]

  const vnMatch = line.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (vnMatch) {
    const day = vnMatch[1].padStart(2, '0')
    const month = vnMatch[2].padStart(2, '0')
    const year = vnMatch[3]
    return `${year}-${month}-${day}`
  }

  return ''
}