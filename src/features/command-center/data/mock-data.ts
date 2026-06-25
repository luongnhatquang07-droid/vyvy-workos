// DEMO DATA — PHASE 2 ONLY — không kết nối Supabase
import type {
  Person, Project, Meeting, Task, Deliverable, DeliverableCheck,
  Reminder, ChaseItem, Commitment, Approval, CEODecisionRequest, ActivityLogEntry,
} from '../types'

export const TODAY = '2026-06-25'

export const PEOPLE: Person[] = [
  { id: 'p1', name: 'Minh Đức',   role: 'Designer/Dev',        department: 'Product',   avatarInitials: 'MĐ' },
  { id: 'p2', name: 'Ngọc Vy',    role: 'Designer',            department: 'Design',    avatarInitials: 'NV' },
  { id: 'p3', name: 'Thu Hà',     role: 'Marketing Manager',   department: 'Marketing', avatarInitials: 'TH' },
  { id: 'p4', name: 'Lan Phương', role: 'Operations Manager',  department: 'Operations',avatarInitials: 'LP' },
  { id: 'p5', name: 'Quang Anh',  role: 'Project Coordinator', department: 'CEO Office',avatarInitials: 'QA' },
]

export const PROJECTS: Project[] = [
  { id: 'pr1', name: 'Website Redesign',   code: 'WS', health: 'WARNING' },
  { id: 'pr2', name: 'App Mobile',         code: 'AM', health: 'AT_RISK' },
  { id: 'pr3', name: 'Chiến dịch Hè 2026',code: 'CH', health: 'ON_TRACK' },
  { id: 'pr4', name: 'Rebrand bao bì',     code: 'RB', health: 'ON_TRACK' },
  { id: 'pr5', name: 'CRM nội bộ',        code: 'CR', health: 'NO_DATA' },
]

export const MEETINGS: Meeting[] = [
  {
    id: 'm1', title: 'Kickoff App Mobile', date: '2026-06-25', time: '09:00',
    status: 'draft_pending', attendees: ['p1','p2','p3','p5'],
    taskDraftCount: 3, decisionCount: 2, importedTaskCount: 0,
    projectId: 'pr2', futureRoute: '/meetings/m1',
  },
  {
    id: 'm2', title: 'Sync Marketing tuần', date: '2026-06-25', time: '14:00',
    status: 'follow_up_needed', attendees: ['p3','p5'],
    taskDraftCount: 0, decisionCount: 3, importedTaskCount: 2,
    projectId: 'pr3', futureRoute: '/meetings/m2',
  },
  {
    id: 'm3', title: 'Họp NCC Q3', date: '2026-06-24', time: '15:00',
    status: 'no_minutes', attendees: ['p4','p5'],
    taskDraftCount: 0, decisionCount: 2, importedTaskCount: 0,
    futureRoute: '/meetings/m3',
  },
]

export const TASKS: Task[] = [
  {
    id: 't1', title: 'Final landing page', ownerId: 'p1', projectId: 'pr1',
    dueDate: '2026-06-23', status: 'IN_PROGRESS', urgency: 'CRITICAL',
    deliverableId: 'd1', kind: 'COLLECT_FILE', futureRoute: '/tasks/t1',
  },
  {
    id: 't2', title: 'Duyệt hợp đồng NCC Q3', ownerId: 'p4',
    dueDate: '2026-06-24', status: 'PENDING_APPROVAL', urgency: 'HIGH',
    kind: 'APPROVE', futureRoute: '/tasks/t2',
  },
  {
    id: 't3', title: 'Gửi báo cáo tuần Marketing', ownerId: 'p3', projectId: 'pr3',
    dueDate: '2026-06-25', status: 'NOT_STARTED', urgency: 'HIGH',
    deliverableId: 'd2', kind: 'COLLECT_REPORT', futureRoute: '/tasks/t3',
  },
  {
    id: 't4', title: 'Nhập 3 đầu việc từ họp NCC', ownerId: 'p5',
    dueDate: '2026-06-25', status: 'NOT_STARTED', urgency: 'MEDIUM',
    kind: 'IMPORT', futureRoute: '/tasks/t4',
  },
  {
    id: 't5', title: 'Chuẩn bị tài liệu họp Kickoff 09:00', ownerId: 'p5', projectId: 'pr2',
    dueDate: '2026-06-25', status: 'NOT_STARTED', urgency: 'HIGH',
    kind: 'MEETING', futureRoute: '/tasks/t5',
  },
  {
    id: 't6', title: 'File thiết kế bao bì (final)', ownerId: 'p2', projectId: 'pr4',
    dueDate: '2026-06-24', status: 'IN_PROGRESS', urgency: 'HIGH',
    deliverableId: 'd3', kind: 'COLLECT_FILE', futureRoute: '/tasks/t6',
  },
]

export const DELIVERABLES: Deliverable[] = [
  {
    id: 'd1', title: 'Bản final landing page', taskId: 't1', ownerId: 'p1', projectId: 'pr1',
    dueDate: '2026-06-23', status: 'REVISION_REQUIRED', type: 'file', futureRoute: '/deliverables/d1',
  },
  {
    id: 'd2', title: 'Báo cáo tuần Marketing', taskId: 't3', ownerId: 'p3', projectId: 'pr3',
    dueDate: '2026-06-25', status: 'NOT_SUBMITTED', type: 'report', futureRoute: '/deliverables/d2',
  },
  {
    id: 'd3', title: 'File thiết kế bao bì (final)', taskId: 't6', ownerId: 'p2', projectId: 'pr4',
    dueDate: '2026-06-24', status: 'REQUIRED', type: 'file', futureRoute: '/deliverables/d3',
  },
]

export const DELIVERABLE_CHECKS: DeliverableCheck[] = [
  {
    taskId: 't1',
    taskTitle: 'Final landing page',
    ownerName: 'Minh Đức',
    gateOpen: false,
    items: [
      { label: 'File thiết kế', present: true, required: true },
      { label: 'Link demo', present: true, required: true },
      { label: 'Báo cáo kết quả', present: false, required: true },
      { label: 'Hình ảnh', present: true, required: false },
      { label: 'Số liệu đo lường', present: false, required: true },
      { label: 'Người duyệt', present: true, required: true },
    ],
  },
]

export const REMINDERS: Reminder[] = [
  {
    id: 'r1', personId: 'p1', taskId: 't1', deliverableId: 'd1',
    content: 'Nộp bản final landing page (đã quá hạn 2 ngày)',
    dueDate: '2026-06-23', reminderCount: 2, lastReminderDate: '2026-06-24',
    response: 'NO_RESPONSE', futureRoute: '/follow-ups/r1',
  },
  {
    id: 'r2', personId: 'p2', taskId: 't6', deliverableId: 'd3',
    content: 'File thiết kế bao bì bản final',
    dueDate: '2026-06-24', reminderCount: 2, lastReminderDate: '2026-06-24',
    response: 'NO_RESPONSE', futureRoute: '/follow-ups/r2',
  },
  {
    id: 'r3', personId: 'p3', taskId: 't3', deliverableId: 'd2',
    content: 'Báo cáo tuần Marketing — hạn hôm nay',
    dueDate: '2026-06-25', reminderCount: 1, lastReminderDate: '2026-06-25',
    response: 'PROMISED', responseNote: 'Đã hứa nộp chiều nay',
    futureRoute: '/follow-ups/r3',
  },
  {
    id: 'r4', personId: 'p4',
    content: 'Ngân sách phòng T7 — chờ phản hồi',
    dueDate: '2026-06-25', reminderCount: 1, lastReminderDate: '2026-06-25',
    response: 'WAITING_RESPONSE', futureRoute: '/follow-ups/r4',
  },
]

export const CHASE_ITEMS: ChaseItem[] = [
  {
    personId: 'p1', owedItem: 'landing page', deliverableType: 'file',
    deadline: '2026-06-23', remindCount: 2, response: 'NO_RESPONSE',
    escalationStep: 'REMIND_2', suggestEscalate: false,
  },
  {
    personId: 'p2', owedItem: 'file thiết kế', deliverableType: 'file',
    deadline: '2026-06-24', remindCount: 2, response: 'NO_RESPONSE',
    escalationStep: 'CALL', suggestEscalate: true,
  },
  {
    personId: 'p3', owedItem: 'báo cáo tuần',
    deadline: '2026-06-25', remindCount: 1, response: 'PROMISED',
    escalationStep: 'REMIND_1', suggestEscalate: false,
  },
  {
    personId: 'p4', owedItem: 'ngân sách T7',
    deadline: '2026-06-25', remindCount: 1, response: 'WAITING_RESPONSE',
    escalationStep: 'REMIND_1', suggestEscalate: false,
  },
]

export const COMMITMENTS: Commitment[] = [
  { personId: 'p3', promisedWhat: 'Nộp báo cáo tuần chiều nay', promisedDate: '2026-06-25', delivered: false, sourceMeetingId: 'm2', sourceMeetingTitle: 'Sync Marketing tuần' },
  { personId: 'p4', promisedWhat: 'Duyệt tài liệu NCC 26/06', promisedDate: '2026-06-26', delivered: false },
]

export const APPROVALS: Approval[] = [
  {
    id: 'ap1', title: 'Hợp đồng NCC Q3', description: 'Phê duyệt hợp đồng nhà cung cấp Q3.',
    requesterId: 'p4', approverId: 'p5', submittedDate: '2026-06-23',
    deadline: '2026-06-24', status: 'overdue', daysWaiting: 2, futureRoute: '/approvals/ap1',
  },
  {
    id: 'ap2', title: 'Bộ icon thương hiệu', description: 'Duyệt bộ icon final.',
    requesterId: 'p2', approverId: 'p5', submittedDate: '2026-06-25',
    deadline: '2026-06-25', status: 'pending', daysWaiting: 0, futureRoute: '/approvals/ap2',
  },
  {
    id: 'ap3', title: 'Ngân sách quảng cáo T7', description: 'Duyệt ngân sách 120tr cho tháng 7.',
    requesterId: 'p3', approverId: 'p5', submittedDate: '2026-06-24',
    deadline: '2026-06-26', status: 'pending', daysWaiting: 1, futureRoute: '/approvals/ap3',
  },
]

export const CEO_REQUESTS: CEODecisionRequest[] = [
  {
    id: 'ceo1', title: 'App Mobile chậm tiến độ — cần hướng xử lý', projectId: 'pr2',
    severity: 'critical',
    issue: 'Scope rộng, nhân sự dev mỏng. Mới đạt 18% trong khi còn ~4 tuần đến MVP.',
    impact: 'Nếu chậm tiếp sẽ ảnh hưởng kế hoạch ra mắt tháng 8.',
    consequence: 'Hạn quyết định: hôm nay. Nếu không chốt, lịch team bị ảnh hưởng.',
    proposedAction: 'Chọn B + C: cắt 2 tính năng phụ và bổ sung 1 dev hợp đồng 4 tuần.',
    createdDate: '2026-06-25', escalatedBy: 'p5', futureRoute: '/ceo-reports',
  },
  {
    id: 'ceo2', title: 'Vượt ngân sách thiết kế 12%', projectId: 'pr1',
    severity: 'warning',
    issue: 'Chi phí thiết kế cao hơn estimate do yêu cầu revision nhiều hơn dự kiến.',
    impact: 'Vượt 12% ngân sách thiết kế toàn dự án.',
    consequence: 'Cần phê duyệt bổ sung trước 27/06.',
    proposedAction: 'Duyệt bổ sung 12% để giữ chất lượng bộ nhận diện mới.',
    createdDate: '2026-06-24', escalatedBy: 'p5', futureRoute: '/ceo-reports',
  },
]

export const ACTIVITY_LOG: ActivityLogEntry[] = [
  { id: 'al1', time: '08:40', text: 'Thu Hà đã xem nhắc và hứa nộp báo cáo tuần chiều nay (25/06)', personName: 'Thu Hà', dotColor: 'green' },
  { id: 'al2', time: '08:12', text: 'Bạn gửi Messenger → Thu Hà (mẫu "Nhắc lần 1")', personName: 'Thu Hà', dotColor: 'blue' },
  { id: 'al3', time: 'Hôm qua 17:00', text: 'Escalate → Trưởng phòng Design về việc của Ngọc Vy', personName: 'Ngọc Vy', dotColor: 'violet' },
  { id: 'al4', time: 'Hôm qua 16:30', text: 'Bạn gửi Messenger → Minh Đức (mẫu "Quá hạn") · chưa phản hồi', personName: 'Minh Đức', dotColor: 'amber' },
  { id: 'al5', time: 'Hôm qua 14:00', text: 'Lan Phương hứa nộp tài liệu NCC 26/06 — chưa tới hạn', personName: 'Lan Phương', dotColor: 'gray' },
]
