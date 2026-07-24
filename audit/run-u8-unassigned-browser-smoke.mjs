import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envText = await readFile(path.join(root, '.env.local'), 'utf8')
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=')
      const key = line.slice(0, separator).replace(/^export\s+/, '').trim()
      let value = line.slice(separator + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      return [key, value]
    }),
)

const stagingRef = 'qawvbthxjvuojsdqjavw'
const ref = env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1]
if (
  env.APP_ENV !== 'staging'
  || env.NEXT_PUBLIC_APP_ENV !== 'staging'
  || ref !== stagingRef
  || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || !env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error('REFUSED_NON_STAGING_OR_MISSING_KEYS')
}

const baseUrl = 'http://localhost:3000'
const outputDir = path.join(root, 'audit', 'screenshots', 'UNASSIGNED-STATUS')
await mkdir(outputDir, { recursive: true })

const service = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const anon = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

// Authenticate as the dedicated staging admin without exposing the email, magic
// link, token hash, access token, refresh token, person id, or task UUID in logs.
const profileResult = await service
  .from('profiles')
  .select('auth_user_id')
  .eq('display_name', 'STAGING_QA_ADMIN')
  .eq('status', 'active')
  .maybeSingle()
if (profileResult.error || !profileResult.data?.auth_user_id) {
  throw new Error('QA_PROFILE_LOOKUP_FAILED')
}

const userResult = await service.auth.admin.getUserById(profileResult.data.auth_user_id)
const email = userResult.data.user?.email
if (userResult.error || !email) throw new Error('QA_AUTH_USER_LOOKUP_FAILED')

const linkResult = await service.auth.admin.generateLink({ type: 'magiclink', email })
const tokenHash = linkResult.data.properties?.hashed_token
if (linkResult.error || !tokenHash) throw new Error('QA_SESSION_LINK_FAILED')

const sessionResult = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: 'magiclink',
})
if (sessionResult.error || !sessionResult.data.session) {
  throw new Error('QA_SESSION_VERIFY_FAILED')
}

let ssrCookies = []
const ssrClient = createServerClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    cookies: {
      getAll: () => ssrCookies,
      setAll: (cookies) => {
        ssrCookies = cookies
      },
    },
  },
)
const setSessionResult = await ssrClient.auth.setSession({
  access_token: sessionResult.data.session.access_token,
  refresh_token: sessionResult.data.session.refresh_token,
})
if (setSessionResult.error || ssrCookies.length === 0) {
  throw new Error('QA_SSR_COOKIE_FAILED')
}

const projectResult = await service
  .from('projects')
  .select('id')
  .eq('name', 'STAGING_QA_PROJECT')
  .is('deleted_at', null)
  .maybeSingle()
if (projectResult.error || !projectResult.data?.id) {
  throw new Error('QA_PROJECT_LOOKUP_FAILED')
}

const workstreamResult = await service
  .from('workstreams')
  .select('id')
  .eq('project_id', projectResult.data.id)
  .eq('name', 'STAGING_QA_WORKSTREAM')
  .is('deleted_at', null)
  .maybeSingle()
if (workstreamResult.error || !workstreamResult.data?.id) {
  throw new Error('QA_WORKSTREAM_LOOKUP_FAILED')
}

const runKey = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const fixturePrefix = `[TEST] U8 ${runKey}`
const assignmentTaskName = `${fixturePrefix} assignment`
const bypassTaskName = `${fixturePrefix} bypass`
const fixtureIds = new Set()
const projectUrl = `${baseUrl}/projects?projectId=${encodeURIComponent(projectResult.data.id)}`

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
await context.addCookies(
  ssrCookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    url: baseUrl,
  })),
)
const page = await context.newPage()

let phase = 'BOOTSTRAP'
let smokeError = null
let cleanupPassed = false

function fail(code) {
  throw new Error(code)
}

async function waitForProjects() {
  await page.getByRole('heading', { name: 'STAGING_QA_PROJECT', level: 2 }).waitFor({
    state: 'visible',
    timeout: 30000,
  })
}

async function gotoProjects(tab = 'overview', extra = '') {
  await page.goto(`${projectUrl}&tab=${tab}${extra}`, { waitUntil: 'domcontentloaded' })
  await waitForProjects()
}

async function getSelectedProjectProgress() {
  const heading = page.getByRole('heading', { name: 'STAGING_QA_PROJECT', level: 2 })
  const titleRowText = await heading.locator('xpath=..').innerText()
  const values = titleRowText.match(/\d{1,3}%/g) ?? []
  if (values.length !== 1) fail('PROJECT_PROGRESS_SELECTOR_FAILED')
  return values[0]
}

async function waitForWorkspaceMutation(method) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/workspace-items')
      && response.request().method() === method,
    { timeout: 30000 },
  )
}

async function createUnassignedSubtask(name) {
  const createButton = page.getByRole('button', { name: /Tạo đầu việc con$/ })
  if (await createButton.count() !== 1) fail('CREATE_SUBTASK_BUTTON_SELECTOR_FAILED')
  await createButton.click()

  const nameInput = page.getByLabel('Tên', { exact: true })
  await nameInput.waitFor({ state: 'visible' })
  await nameInput.fill(name)

  const ownerSelect = page.getByLabel(/^Người phụ trách/)
  const dueDateInput = page.getByLabel(/^Deadline/)
  if (await ownerSelect.count() !== 1 || await dueDateInput.count() !== 1) {
    fail('CREATE_ASSIGNMENT_FIELDS_SELECTOR_FAILED')
  }
  if (await ownerSelect.inputValue() !== '' || await dueDateInput.inputValue() !== '') {
    fail('CREATE_ASSIGNMENT_FIELDS_NOT_EMPTY')
  }
  const warning = page.getByText(
    "Đầu việc chưa có người phụ trách và deadline. Sẽ được đặt trạng thái 'Chưa giao việc'.",
    { exact: true },
  )
  if (await warning.count() !== 1) fail('CREATE_UNASSIGNED_WARNING_FAILED')

  await page.screenshot({
    path: path.join(outputDir, 'U8-01-create-form-unassigned.png'),
    fullPage: true,
  })

  const saveButton = page.getByRole('button', { name: /Lưu$/ })
  if (await saveButton.count() !== 1) fail('CREATE_SAVE_SELECTOR_FAILED')
  const createResponsePromise = waitForWorkspaceMutation('POST')
  await saveButton.click()
  const createResponse = await createResponsePromise
  if (!createResponse.ok()) fail(`CREATE_SUBTASK_HTTP_${createResponse.status()}`)
  const payload = await createResponse.json()
  if (typeof payload?.id !== 'string' || payload.status !== 'UNASSIGNED') {
    fail('CREATE_SUBTASK_UNEXPECTED_RESPONSE')
  }
  fixtureIds.add(payload.id)
  return payload.id
}

async function getKanbanCard(taskId, expectedStatus) {
  await gotoProjects('kanban')
  const column = page.locator(`[data-kanban-status="${expectedStatus}"]`)
  const card = column.locator(`[data-kanban-card="${taskId}"]`)
  await card.waitFor({ state: 'visible', timeout: 30000 })
  return card
}

async function openTaskEditDrawer(card, phasePrefix) {
  phase = `${phasePrefix}_OPEN_DETAIL`
  const openButton = card.getByRole('button', { name: 'Mở chi tiết', exact: true })
  if (await openButton.count() !== 1) fail('OPEN_TASK_DETAIL_SELECTOR_FAILED')
  await openButton.click()
  const detail = page.getByLabel('Kanban task detail')
  await detail.waitFor({ state: 'visible' })
  phase = `${phasePrefix}_OPEN_EDIT`
  const editButton = detail.getByRole('button', { name: /Sửa$/ })
  if (await editButton.count() !== 1) fail('OPEN_TASK_EDIT_SELECTOR_FAILED')
  await editButton.click()
  const drawer = page.getByRole('dialog', { name: 'Sửa đầu việc con' })
  await drawer.waitFor({ state: 'visible' })
  return drawer
}

async function saveTaskEdit(drawer) {
  const saveButton = drawer.getByRole('button', { name: /Lưu$/ })
  if (await saveButton.count() !== 1) fail('EDIT_SAVE_SELECTOR_FAILED')
  const patchResponsePromise = waitForWorkspaceMutation('PATCH')
  await saveButton.click()
  const patchResponse = await patchResponsePromise
  if (!patchResponse.ok()) fail(`EDIT_TASK_HTTP_${patchResponse.status()}`)
}

async function chooseQaAdminOwner(ownerSelect) {
  const option = await ownerSelect.locator('option').evaluateAll((options) => {
    const preferred = options.find((item) => item.textContent?.trim().startsWith('STAGING_QA_ADMIN'))
    const fallback = options.find((item) => item.getAttribute('value'))
    return preferred?.getAttribute('value') ?? fallback?.getAttribute('value') ?? ''
  })
  if (!option) fail('ASSIGNABLE_OWNER_FIXTURE_MISSING')
  await ownerSelect.selectOption(option)
}

function futureDate(days = 7) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

async function readCommandCenterUnassignedCount() {
  const card = page.getByRole('button', { name: 'Xem Chưa giao việc' })
  await card.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(900)
  const text = await card.innerText()
  const count = Number(text.match(/\d+/)?.[0])
  if (!Number.isInteger(count)) fail('COMMAND_CENTER_KPI_COUNT_FAILED')
  return { card, count }
}

async function cleanupFixtureTasks() {
  const lookup = await service
    .from('tasks')
    .select('id')
    .like('title', `${fixturePrefix}%`)
    .is('deleted_at', null)
  if (lookup.error) return false
  for (const row of lookup.data ?? []) fixtureIds.add(row.id)

  let deleted = true
  for (const id of fixtureIds) {
    const response = await context.request.delete(`${baseUrl}/api/workspace-items`, {
      data: { type: 'task', id },
    })
    if (!response.ok()) deleted = false
  }

  const remaining = await service
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .like('title', `${fixturePrefix}%`)
    .is('deleted_at', null)
  return deleted && !remaining.error && remaining.count === 0
}

try {
  phase = 'BASELINE_COMMAND_CENTER'
  await page.goto(`${baseUrl}/command-center`, { waitUntil: 'domcontentloaded' })
  const baselineKpi = await readCommandCenterUnassignedCount()
  if (baselineKpi.count > 4) fail('UNASSIGNED_PANEL_CAPACITY_PRECONDITION_FAILED')

  phase = 'BASELINE_PROJECTS_OPEN'
  await gotoProjects('overview')
  phase = 'BASELINE_PROJECTS_PROGRESS'
  const progressBefore = await getSelectedProjectProgress()

  phase = 'CREATE_ASSIGNMENT_TASK'
  const assignmentTaskId = await createUnassignedSubtask(assignmentTaskName)
  phase = 'CREATE_ASSIGNMENT_DB_SHAPE'
  const assignmentCreateDb = await service
    .from('tasks')
    .select('status,owner_id,due_date')
    .eq('id', assignmentTaskId)
    .maybeSingle()
  if (
    assignmentCreateDb.error
    || assignmentCreateDb.data?.status !== 'UNASSIGNED'
    || assignmentCreateDb.data.owner_id !== null
    || assignmentCreateDb.data.due_date !== null
  ) {
    fail('CREATE_ASSIGNMENT_DB_SHAPE_FAILED')
  }
  await waitForProjects()
  const progressAfterCreate = await getSelectedProjectProgress()
  if (progressAfterCreate !== progressBefore) fail('UNASSIGNED_CHANGED_PROJECT_PROGRESS')
  await page.screenshot({
    path: path.join(outputDir, 'U8-02-progress-excludes-unassigned.png'),
    fullPage: true,
  })

  phase = 'KANBAN_UNASSIGNED_OPEN'
  let assignmentCard = await getKanbanCard(assignmentTaskId, 'UNASSIGNED')
  phase = 'KANBAN_UNASSIGNED_OWNER_BADGE'
  if (await assignmentCard.getByText('Chưa có người phụ trách', { exact: true }).count() !== 1) {
    fail('UNASSIGNED_OWNER_BADGE_FAILED')
  }
  phase = 'KANBAN_UNASSIGNED_DEADLINE_BADGE'
  const initialDeadlineBadgeCount = await assignmentCard
    .getByText('Chưa có deadline', { exact: true })
    .count()
  if (initialDeadlineBadgeCount !== 1) {
    phase = initialDeadlineBadgeCount === 0
      ? 'KANBAN_UNASSIGNED_DEADLINE_BADGE_MISSING'
      : 'KANBAN_UNASSIGNED_DEADLINE_BADGE_DUPLICATED'
    fail('UNASSIGNED_DEADLINE_BADGE_FAILED')
  }
  await page.screenshot({
    path: path.join(outputDir, 'U8-03-kanban-unassigned-two-badges.png'),
    fullPage: true,
  })

  phase = 'COMMAND_CENTER'
  await page.goto(`${baseUrl}/command-center`, { waitUntil: 'domcontentloaded' })
  const currentKpi = await readCommandCenterUnassignedCount()
  if (currentKpi.count !== baselineKpi.count + 1) fail('COMMAND_CENTER_KPI_DELTA_FAILED')
  if (
    await page.getByRole('heading', { name: 'Việc chưa giao', level: 2 }).count() !== 1
    || await page.getByRole('button', { name: `Mở chi tiết ${assignmentTaskName}` }).count() !== 1
    || await page.getByText('Thiếu owner + deadline', { exact: true }).count() < 1
  ) {
    fail('COMMAND_CENTER_PANEL_FAILED')
  }
  await page.screenshot({
    path: path.join(outputDir, 'U8-04-command-center-kpi-panel.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: `Mở chi tiết ${assignmentTaskName}` }).click()
  const taskDrawer = page.getByRole('dialog')
  await taskDrawer.waitFor({ state: 'visible' })
  await taskDrawer.getByRole('button', { name: 'Đóng' }).click()

  phase = 'PROJECT_FILTERS'
  await currentKpi.card.click()
  await page.waitForURL(/\/projects\?filter=unassigned/)
  await waitForProjects()
  const routedQuickChip = page.getByRole('button', {
    name: /^Chưa giao việc \(\d+\)$/,
  })
  if (await routedQuickChip.count() !== 1) fail('UNASSIGNED_KPI_ROUTE_FILTER_FAILED')

  // The KPI is global while the Projects chip is scoped to the selected project.
  // Re-open the deterministic QA project without losing the route filter before
  // asserting that this fixture is included.
  await gotoProjects('overview', '&filter=unassigned')
  const quickChip = page.getByRole('button', { name: /^Chưa giao việc \(\d+\)$/ })
  if (await quickChip.count() !== 1) fail('UNASSIGNED_QUICK_CHIP_FAILED')
  const projectQuickCount = Number((await quickChip.innerText()).match(/\d+/)?.[0])
  if (!Number.isInteger(projectQuickCount) || projectQuickCount < 1) {
    fail('UNASSIGNED_PROJECT_QUICK_COUNT_FAILED')
  }
  await page.getByRole('button', { name: 'Kanban', exact: true }).click()
  await page
    .locator('[data-kanban-status="UNASSIGNED"]')
    .locator(`[data-kanban-card="${assignmentTaskId}"]`)
    .waitFor({ state: 'visible' })
  await page.screenshot({
    path: path.join(outputDir, 'U8-05-projects-quick-filter.png'),
    fullPage: true,
  })
  await quickChip.click()
  const statusFilter = page.getByRole('combobox', { name: 'Lọc trạng thái' })
  await statusFilter.selectOption('UNASSIGNED')
  if (await statusFilter.inputValue() !== 'UNASSIGNED') fail('UNASSIGNED_STATUS_FILTER_FAILED')
  await page.waitForFunction(() => (
    document.querySelectorAll(
      '[data-kanban-status]:not([data-kanban-status="UNASSIGNED"]) [data-kanban-card]',
    ).length === 0
  ))
  const cardsOutsideUnassigned = page.locator(
    '[data-kanban-status]:not([data-kanban-status="UNASSIGNED"]) [data-kanban-card]',
  )
  if (await cardsOutsideUnassigned.count() !== 0) fail('UNASSIGNED_STATUS_FILTER_LEAK_FAILED')
  await page.screenshot({
    path: path.join(outputDir, 'U8-06-projects-status-filter.png'),
    fullPage: true,
  })

  phase = 'DEADLINE_ONLY_OPEN_DRAWER'
  assignmentCard = await getKanbanCard(assignmentTaskId, 'UNASSIGNED')
  let editDrawer = await openTaskEditDrawer(assignmentCard, 'DEADLINE_ONLY')
  phase = 'DEADLINE_ONLY_SAVE'
  const deadlineInput = editDrawer.getByLabel(/^Deadline/)
  if (await deadlineInput.count() !== 1) fail('EDIT_DEADLINE_SELECTOR_FAILED')
  await deadlineInput.fill(futureDate())
  await saveTaskEdit(editDrawer)
  phase = 'DEADLINE_ONLY_RELOAD'
  assignmentCard = await getKanbanCard(assignmentTaskId, 'UNASSIGNED')
  phase = 'DEADLINE_ONLY_BADGES'
  if (
    await assignmentCard.getByText('Chưa có người phụ trách', { exact: true }).count() !== 1
    || await assignmentCard.getByText('Chưa có deadline', { exact: true }).count() !== 0
  ) {
    fail('DEADLINE_ONLY_BADGES_FAILED')
  }
  await page.screenshot({
    path: path.join(outputDir, 'U8-07-deadline-only-still-unassigned.png'),
    fullPage: true,
  })

  phase = 'OWNER_AUTO_TRANSITION'
  editDrawer = await openTaskEditDrawer(assignmentCard, 'OWNER_AUTO_TRANSITION')
  const ownerSelect = editDrawer.getByLabel(/^Người phụ trách/)
  if (await ownerSelect.count() !== 1) fail('EDIT_OWNER_SELECTOR_FAILED')
  await chooseQaAdminOwner(ownerSelect)
  await saveTaskEdit(editDrawer)
  assignmentCard = await getKanbanCard(assignmentTaskId, 'NOT_STARTED')
  if (
    await assignmentCard.getByText('Chưa có người phụ trách', { exact: true }).count() !== 0
    || await assignmentCard.getByText('Chưa có deadline', { exact: true }).count() !== 0
  ) {
    fail('OWNER_AUTO_TRANSITION_BADGES_FAILED')
  }
  const assignmentDb = await service
    .from('tasks')
    .select('status,owner_id,due_date')
    .eq('id', assignmentTaskId)
    .maybeSingle()
  if (
    assignmentDb.error
    || assignmentDb.data?.status !== 'NOT_STARTED'
    || !assignmentDb.data.owner_id
    || !assignmentDb.data.due_date
  ) {
    fail('OWNER_AUTO_TRANSITION_DB_FAILED')
  }
  await page.screenshot({
    path: path.join(outputDir, 'U8-08-owner-auto-transition-not-started.png'),
    fullPage: true,
  })

  phase = 'CREATE_BYPASS_TASK'
  await gotoProjects('overview')
  const bypassTaskId = await createUnassignedSubtask(bypassTaskName)
  let bypassCard = await getKanbanCard(bypassTaskId, 'UNASSIGNED')

  phase = 'BYPASS_CANCEL'
  let statusSelect = bypassCard.getByRole('combobox', { name: 'Chuyển trạng thái' })
  await statusSelect.selectOption('COMPLETED')
  let confirmDialog = page.getByRole('dialog', {
    name: 'Đánh dấu hoàn thành (bỏ qua yêu cầu)?',
  })
  await confirmDialog.waitFor({ state: 'visible' })
  const expectedConfirmBody = `Đầu việc ${bypassTaskName} chưa có người phụ trách và deadline. Sẽ BỎ QUA yêu cầu file/báo cáo và các bước bắt buộc. Chỉ dùng cho việc vặt không cần bàn giao. Hành động này được ghi lại trong audit trail.`
  if (await confirmDialog.getByText(expectedConfirmBody, { exact: true }).count() !== 1) {
    fail('BYPASS_CONFIRM_COPY_FAILED')
  }
  await page.screenshot({
    path: path.join(outputDir, 'U8-09-bypass-confirm.png'),
    fullPage: true,
  })
  await confirmDialog.getByRole('button', { name: 'Hủy', exact: true }).click()
  if (await statusSelect.inputValue() !== 'UNASSIGNED') fail('BYPASS_CANCEL_CHANGED_STATUS')

  phase = 'BYPASS_CONFIRM'
  await statusSelect.selectOption('COMPLETED')
  confirmDialog = page.getByRole('dialog', {
    name: 'Đánh dấu hoàn thành (bỏ qua yêu cầu)?',
  })
  const completionResponsePromise = waitForWorkspaceMutation('PATCH')
  await confirmDialog
    .getByRole('button', { name: 'Đánh dấu hoàn thành', exact: true })
    .click()
  const completionResponse = await completionResponsePromise
  if (!completionResponse.ok()) fail(`BYPASS_COMPLETE_HTTP_${completionResponse.status()}`)
  bypassCard = page
    .locator('[data-kanban-status="COMPLETED"]')
    .locator(`[data-kanban-card="${bypassTaskId}"]`)
  await bypassCard.waitFor({ state: 'visible', timeout: 30000 })

  const auditResult = await service
    .from('audit_logs')
    .select('action,before_data,after_data')
    .eq('entity_type', 'task')
    .eq('entity_id', bypassTaskId)
    .eq('action', 'complete_unassigned_bypass')
    .maybeSingle()
  if (
    auditResult.error
    || auditResult.data?.action !== 'complete_unassigned_bypass'
    || auditResult.data.before_data?.status !== 'UNASSIGNED'
    || auditResult.data.before_data?.was_missing_owner !== true
    || auditResult.data.before_data?.was_missing_deadline !== true
    || auditResult.data.after_data?.status !== 'COMPLETED'
    || !auditResult.data.after_data?.completed_at
  ) {
    fail('BYPASS_AUDIT_SHAPE_FAILED')
  }
  await page.screenshot({
    path: path.join(outputDir, 'U8-10-bypass-completed.png'),
    fullPage: true,
  })
} catch {
  // Deliberately discard raw browser/DB errors because they can contain task UUIDs,
  // account identifiers, request URLs, or other staging-only values.
  smokeError = `U8_BROWSER_SMOKE_FAILED_${phase}`
} finally {
  cleanupPassed = await cleanupFixtureTasks().catch(() => false)
  await context.close()
  await browser.close()
}

if (!cleanupPassed) throw new Error('U8_FIXTURE_CLEANUP_FAILED')
if (smokeError) throw new Error(smokeError)
console.log('U8_BROWSER_SMOKE_PASS')
