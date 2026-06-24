// ============================================================
// DEMO DATA — PHASE 2 ONLY
// Replace with Supabase queries in Phase 3+
// Today reference: 2026-06-24
// ============================================================

import type {
  Person, Project, Meeting, MeetingTaskDraft,
  Task, Deliverable, Reminder, Approval, CEODecisionRequest,
} from '../types'

export const TODAY = '2026-06-24'

// ---- People ----

export const PEOPLE: Person[] = [
  { id: 'p1', name: 'Linh Nguyễn',  role: 'Marketing Manager',     department: 'Marketing',  avatarInitials: 'LN' },
  { id: 'p2', name: 'Hùng Trần',    role: 'Tech Lead',              department: 'Engineering', avatarInitials: 'HT' },
  { id: 'p3', name: 'Mai Phạm',     role: 'Finance Analyst',        department: 'Finance',    avatarInitials: 'MP' },
  { id: 'p4', name: 'Sơn Lê',       role: 'Lead Designer',          department: 'Design',     avatarInitials: 'SL' },
  { id: 'p5', name: 'Nam Vũ',       role: 'Operations Manager',     department: 'Operations', avatarInitials: 'NV' },
  { id: 'p6', name: 'Quang Lương',  role: 'Project Coordinator',    department: 'CEO Office', avatarInitials: 'QL' },
  { id: 'p7', name: 'Thảo Bùi',    role: 'HR Director',            department: 'HR',         avatarInitials: 'TB' },
  { id: 'p8', name: 'Minh Đỗ',     role: 'CFO',                    department: 'Finance',    avatarInitials: 'MD' },
]

// ---- Projects ----

export const PROJECTS: Project[] = [
  { id: 'pr1', name: 'Chiến dịch Q3',          code: 'MKT-Q3',  status: 'at_risk' },
  { id: 'pr2', name: 'Triển khai ERP',          code: 'ERP-01',  status: 'delayed' },
  { id: 'pr3', name: 'Báo cáo tài chính H1',   code: 'FIN-H1',  status: 'at_risk' },
  { id: 'pr4', name: 'Tái cấu trúc vận hành',  code: 'OPS-RC',  status: 'active' },
  { id: 'pr5', name: 'Tuyển dụng Q3',          code: 'HR-Q3',   status: 'active' },
]

// ---- Meetings ----

export const MEETINGS: Meeting[] = [
  {
    id: 'm1',
    title: 'Họp team Marketing — Review chiến dịch Q3',
    date: '2026-06-24',
    time: '09:00',
    status: 'no_minutes',
    attendees: ['p1', 'p4', 'p6'],
    taskDraftCount: 0,
    projectId: 'pr1',
    futureRoute: '/meetings/m1',
  },
  {
    id: 'm2',
    title: 'Họp Board — Review tiến độ ERP',
    date: '2026-06-24',
    time: '14:00',
    status: 'draft_pending',
    attendees: ['p2', 'p5', 'p6', 'p8'],
    taskDraftCount: 4,
    followUpOwner: 'p6',
    minutesUrl: '/minutes/m2',
    projectId: 'pr2',
    futureRoute: '/meetings/m2',
  },
  {
    id: 'm3',
    title: 'Họp Hội đồng Quản trị Q2',
    date: '2026-06-23',
    time: '10:00',
    status: 'minutes_no_tasks',
    attendees: ['p6', 'p8', 'p7', 'p5'],
    taskDraftCount: 0,
    minutesUrl: '/minutes/m3',
    futureRoute: '/meetings/m3',
  },
  {
    id: 'm4',
    title: 'Họp Finance — Chuẩn bị báo cáo H1',
    date: '2026-06-22',
    time: '11:00',
    status: 'follow_up_needed',
    attendees: ['p3', 'p8', 'p6'],
    taskDraftCount: 2,
    followUpOwner: 'p6',
    projectId: 'pr3',
    futureRoute: '/meetings/m4',
  },
  {
    id: 'm5',
    title: 'Stand-up hàng ngày',
    date: '2026-06-24',
    time: '08:30',
    status: 'done',
    attendees: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
    taskDraftCount: 0,
    futureRoute: '/meetings/m5',
  },
]

// ---- Meeting task drafts ----

export const TASK_DRAFTS: MeetingTaskDraft[] = [
  { id: 'td1', meetingId: 'm2', title: 'Cập nhật roadmap ERP module 3', assigneeId: 'p2', projectId: 'pr2', suggestedDeadline: '2026-06-27', imported: false, futureRoute: '/task-inbox/td1' },
  { id: 'td2', meetingId: 'm2', title: 'Họp vendor về timeline tích hợp', assigneeId: 'p6', projectId: 'pr2', suggestedDeadline: '2026-06-26', imported: false, futureRoute: '/task-inbox/td2' },
  { id: 'td3', meetingId: 'm2', title: 'Gửi báo cáo rủi ro ERP lên CEO', assigneeId: 'p6', projectId: 'pr2', suggestedDeadline: '2026-06-25', imported: false, futureRoute: '/task-inbox/td3' },
  { id: 'td4', meetingId: 'm2', title: 'Review lại cost estimate ERP', assigneeId: 'p8', projectId: 'pr2', suggestedDeadline: '2026-06-28', imported: false, futureRoute: '/task-inbox/td4' },
  { id: 'td5', meetingId: 'm4', title: 'Thu thập số liệu chi phí H1 từ phòng ban', assigneeId: 'p3', projectId: 'pr3', suggestedDeadline: '2026-06-25', imported: false, futureRoute: '/task-inbox/td5' },
  { id: 'td6', meetingId: 'm4', title: 'Hoàn thiện bảng so sánh H1 vs. Budget', assigneeId: 'p8', projectId: 'pr3', suggestedDeadline: '2026-06-26', imported: false, futureRoute: '/task-inbox/td6' },
]

// ---- Tasks ----

export const TASKS: Task[] = [
  {
    id: 't1',
    title: 'Nộp báo cáo tài chính Q2 lên kiểm toán',
    ownerId: 'p3',
    projectId: 'pr3',
    dueDate: '2026-06-20',
    status: 'overdue',
    priority: 'critical',
    deliverableId: 'd1',
    futureRoute: '/follow-ups/t1',
  },
  {
    id: 't2',
    title: 'Cập nhật roadmap ERP giai đoạn 2',
    ownerId: 'p2',
    projectId: 'pr2',
    dueDate: '2026-06-22',
    status: 'overdue',
    priority: 'high',
    futureRoute: '/follow-ups/t2',
  },
  {
    id: 't3',
    title: 'Gửi proposal chiến dịch Q3 cho CEO',
    ownerId: 'p1',
    projectId: 'pr1',
    dueDate: '2026-06-24',
    status: 'due_today',
    priority: 'high',
    deliverableId: 'd2',
    futureRoute: '/follow-ups/t3',
  },
  {
    id: 't4',
    title: 'Hoàn thiện hợp đồng vendor ERP',
    ownerId: 'p5',
    projectId: 'pr2',
    dueDate: '2026-06-24',
    status: 'waiting',
    priority: 'high',
    waitingFor: 'CEO ký duyệt',
    futureRoute: '/follow-ups/t4',
  },
  {
    id: 't5',
    title: 'Hoàn thành design brief chiến dịch Q3',
    ownerId: 'p4',
    projectId: 'pr1',
    dueDate: '2026-06-25',
    status: 'due_soon',
    priority: 'medium',
    futureRoute: '/follow-ups/t5',
  },
  {
    id: 't6',
    title: 'Chuẩn bị kế hoạch tuyển dụng kỹ sư Q3',
    ownerId: 'p7',
    projectId: 'pr5',
    dueDate: '2026-06-26',
    status: 'in_progress',
    priority: 'medium',
    pendingApproval: true,
    futureRoute: '/follow-ups/t6',
  },
  {
    id: 't7',
    title: 'Kiểm tra audit nội bộ vận hành Q2',
    ownerId: 'p5',
    projectId: 'pr4',
    dueDate: '2026-06-30',
    status: 'in_progress',
    priority: 'medium',
    futureRoute: '/follow-ups/t7',
  },
  {
    id: 't8',
    title: 'Thu chi phí phát sinh từ các phòng ban',
    ownerId: 'p3',
    projectId: 'pr3',
    dueDate: '2026-06-23',
    status: 'overdue',
    priority: 'high',
    futureRoute: '/follow-ups/t8',
  },
]

// ---- Deliverables ----

export const DELIVERABLES: Deliverable[] = [
  {
    id: 'd1',
    title: 'Báo cáo tài chính Q2 (bản chính thức)',
    taskId: 't1',
    ownerId: 'p3',
    projectId: 'pr3',
    dueDate: '2026-06-20',
    status: 'missing',
    type: 'report',
    futureRoute: '/deliverables/d1',
  },
  {
    id: 'd2',
    title: 'Proposal chiến dịch Q3 (slide + ngân sách)',
    taskId: 't3',
    ownerId: 'p1',
    projectId: 'pr1',
    dueDate: '2026-06-24',
    status: 'draft',
    type: 'presentation',
    futureRoute: '/deliverables/d2',
  },
  {
    id: 'd3',
    title: 'Chi phí phát sinh H1 (bảng tổng hợp)',
    ownerId: 'p3',
    projectId: 'pr3',
    dueDate: '2026-06-23',
    status: 'missing',
    type: 'data',
    futureRoute: '/deliverables/d3',
  },
  {
    id: 'd4',
    title: 'Technical spec ERP module 3',
    ownerId: 'p2',
    projectId: 'pr2',
    dueDate: '2026-06-25',
    status: 'draft',
    type: 'file',
    futureRoute: '/deliverables/d4',
  },
]

// ---- Reminders ----

export const REMINDERS: Reminder[] = [
  {
    id: 'r1',
    personId: 'p3',
    taskId: 't1',
    deliverableId: 'd1',
    content: 'Nộp báo cáo tài chính Q2 (đã quá hạn 4 ngày)',
    dueDate: '2026-06-20',
    reminderCount: 3,
    lastReminderDate: '2026-06-23',
    response: 'acknowledged',
    responseNote: '"Đang hoàn thiện số liệu cuối"',
    futureRoute: '/follow-ups/r1',
  },
  {
    id: 'r2',
    personId: 'p1',
    taskId: 't3',
    deliverableId: 'd2',
    content: 'Gửi proposal chiến dịch Q3 — hết hạn hôm nay',
    dueDate: '2026-06-24',
    reminderCount: 1,
    lastReminderDate: '2026-06-24',
    response: 'in_progress',
    responseNote: '"Đang chỉnh slide cuối, gửi buổi chiều"',
    futureRoute: '/follow-ups/r2',
  },
  {
    id: 'r3',
    personId: 'p2',
    taskId: 't2',
    content: 'Cập nhật roadmap ERP giai đoạn 2 (quá hạn 2 ngày)',
    dueDate: '2026-06-22',
    reminderCount: 2,
    lastReminderDate: '2026-06-23',
    response: 'no_response',
    futureRoute: '/follow-ups/r3',
  },
  {
    id: 'r4',
    personId: 'p3',
    deliverableId: 'd3',
    content: 'Gửi bảng chi phí phát sinh H1 (quá hạn 1 ngày)',
    dueDate: '2026-06-23',
    reminderCount: 2,
    lastReminderDate: '2026-06-24',
    response: 'no_response',
    futureRoute: '/follow-ups/r4',
  },
]

// ---- Approvals ----

export const APPROVALS: Approval[] = [
  {
    id: 'ap1',
    title: 'Ngân sách chiến dịch Q3 Marketing',
    description: 'Phê duyệt ngân sách 450 triệu cho chiến dịch Q3, bao gồm digital ads, sự kiện và KOL.',
    requesterId: 'p1',
    approverId: 'p8',
    projectId: 'pr1',
    submittedDate: '2026-06-21',
    deadline: '2026-06-25',
    status: 'pending',
    daysWaiting: 3,
    futureRoute: '/approvals/ap1',
  },
  {
    id: 'ap2',
    title: 'Kế hoạch tuyển dụng kỹ sư Q3',
    description: 'Phê duyệt kế hoạch tuyển 8 kỹ sư backend + 3 fullstack trong Q3 2026.',
    requesterId: 'p7',
    approverId: 'p6',
    projectId: 'pr5',
    submittedDate: '2026-06-23',
    deadline: '2026-06-27',
    status: 'pending',
    daysWaiting: 1,
    futureRoute: '/approvals/ap2',
  },
  {
    id: 'ap3',
    title: 'Purchase order thiết bị server ERP',
    description: 'Mua 4 server vật lý và 2 rack cabinet phục vụ ERP on-premise, tổng 1.2 tỷ.',
    requesterId: 'p2',
    approverId: 'p8',
    projectId: 'pr2',
    submittedDate: '2026-06-19',
    deadline: '2026-06-24',
    status: 'overdue',
    daysWaiting: 5,
    futureRoute: '/approvals/ap3',
  },
]

// ---- CEO Decision Requests ----

export const CEO_REQUESTS: CEODecisionRequest[] = [
  {
    id: 'ceo1',
    title: 'ERP triển khai trễ 3 tuần — cần quyết định',
    projectId: 'pr2',
    severity: 'critical',
    issue: 'Vendor ERP thông báo trễ bàn giao module 3 và 4, ảnh hưởng Go-live Q3.',
    impact: 'Go-live ERP sẽ trễ từ 01/09 sang 22/09 nếu không có biện pháp.',
    consequence: 'Nếu không quyết định trước 27/06, toàn bộ lịch training bị huỷ, phát sinh chi phí reschedule.',
    proposedAction: 'Họp khẩn với vendor 26/06; nếu không giải quyết, kích hoạt penalty clause hợp đồng.',
    createdDate: '2026-06-24',
    escalatedBy: 'p6',
    futureRoute: '/ceo-reports',
  },
  {
    id: 'ceo2',
    title: 'Báo cáo tài chính Q2 chưa nộp kiểm toán',
    projectId: 'pr3',
    severity: 'critical',
    issue: 'Báo cáo tài chính Q2 đã quá hạn 4 ngày, kiểm toán viên đang chờ.',
    impact: 'Rủi ro vi phạm điều khoản hợp đồng kiểm toán, có thể bị phạt hoặc huỷ hợp đồng năm nay.',
    consequence: 'Nếu chưa nộp trước 27/06, kiểm toán viên sẽ gửi thư cảnh báo chính thức.',
    proposedAction: 'CEO trực tiếp yêu cầu CFO ưu tiên xử lý ngay hôm nay.',
    createdDate: '2026-06-24',
    escalatedBy: 'p6',
    futureRoute: '/ceo-reports',
  },
  {
    id: 'ceo3',
    title: 'Ngân sách Q3 Marketing chờ phê duyệt 3 ngày',
    projectId: 'pr1',
    severity: 'warning',
    issue: 'Proposal chiến dịch Q3 đã gửi 3 ngày chưa được CFO phê duyệt.',
    impact: 'Nếu không chốt trước 25/06, đơn vị booking KOL sẽ huỷ slot.',
    consequence: 'Mất slot KOL trong tháng 7, chiến dịch Q3 bị ảnh hưởng reach.',
    proposedAction: 'CEO nhắc CFO ưu tiên review trong hôm nay.',
    createdDate: '2026-06-23',
    escalatedBy: 'p6',
    futureRoute: '/ceo-reports',
  },
]
