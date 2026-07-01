'use client'

import React from 'react'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { PageHead } from '@/components/ui/PageHead'
import { useCommandData } from '@/hooks/useCommandData'
import {
  DEADLINE_TYPE_OPTIONS,
  NEEDS_FILE_OPTIONS,
  PRIORITY_OPTIONS,
  type BulkImportPreviewPayload,
  type BulkImportRow,
  type BulkImportSummary,
  type ImportIssue,
  hasImportErrors,
  makeImportSummary,
  needsFile,
  normalizeDeadlineType,
  normalizeKey,
  normalizeNeedsFileLabel,
  normalizePriorityLabel,
  parseDeadline,
  splitPeople,
} from '@/lib/taskImport'

interface ImportResult {
  importBatchId: string
  createdProjects: number
  createdWorkstreams: number
  createdTasks: number
  updatedTasks: number
  skippedDuplicates: number
  createdDeliverables: number
  createdReminders: number
  skippedRows: Array<{ rowNumber: number; title: string; reason: string }>
  projectIds: string[]
  taskIds: string[]
}

export default function TaskInboxPage() {
  const { data, loading, error, refresh } = useCommandData()
  const [preview, setPreview] = React.useState<BulkImportPreviewPayload | null>(null)
  const [rows, setRows] = React.useState<BulkImportRow[]>([])
  const [parsing, setParsing] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const catalog = React.useMemo(() => ({
    owners: preview?.catalog.owners ?? (data?.people ?? []).map((person) => person.full_name),
    projects: preview?.catalog.projects ?? (data?.projects ?? []).map((project) => project.name),
    workstreams: preview?.catalog.workstreams ?? (data?.workstreams ?? []).map((workstream) => workstream.name),
  }), [data?.people, data?.projects, data?.workstreams, preview])

  const ownerOptions = React.useMemo(
    () => Array.from(new Set(catalog.owners)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi')),
    [catalog.owners],
  )

  const projectOptions = React.useMemo(
    () => Array.from(new Set(catalog.projects)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi')),
    [catalog.projects],
  )

  const workstreamOptions = React.useMemo(
    () => Array.from(new Set(catalog.workstreams)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi')),
    [catalog.workstreams],
  )

  const summary = React.useMemo(() => makeImportSummary(rows), [rows])
  const canConfirm = rows.length > 0 && summary.errorRows === 0 && !confirming

  async function handleExcel(file: File) {
    setParsing(true)
    setMessage('')
    setResult(null)

    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/task-import/preview', { method: 'POST', body: form })
      const payload = (await response.json()) as BulkImportPreviewPayload | { error?: string }

      if (!response.ok || ('error' in payload && payload.error)) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Không đọc được file Excel.')
      }

      const nextPreview = payload as BulkImportPreviewPayload
      setPreview(nextPreview)
      setRows(nextPreview.rows)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không đọc được file Excel.')
    } finally {
      setParsing(false)
    }
  }

  function updateRow(id: string, patch: Partial<BulkImportRow>) {
    setRows((current) => {
      const patched = current.map((row) => row.id === id ? rebuildClientRow({ ...row, ...patch }, catalog) : row)
      return rebuildFileDuplicates(patched)
    })
  }

  async function confirmImport() {
    setConfirming(true)
    setMessage('')
    setResult(null)

    try {
      const response = await fetch('/api/task-import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, fileName: preview?.fileName ?? null }),
      })
      const payload = (await response.json()) as ImportResult | { error?: string; rows?: BulkImportRow[]; summary?: BulkImportSummary }

      if (!response.ok || ('error' in payload && payload.error)) {
        if ('rows' in payload && payload.rows) setRows(payload.rows)
        throw new Error('error' in payload && payload.error ? payload.error : 'Không import được dữ liệu.')
      }

      const importResult = payload as ImportResult
      setResult(importResult)
      await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không import được dữ liệu.')
    } finally {
      setConfirming(false)
    }
  }

  function resetPreview() {
    setPreview(null)
    setRows([])
    setResult(null)
    setMessage('')
  }

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-inbox"
        title="Inbox đầu việc"
        desc="Import hàng loạt đầu việc bằng Excel: tải mẫu, upload, rà lỗi trong Preview rồi xác nhận mới đưa vào hệ thống."
      />

      {error ? <DataErrorState message={error} /> : null}
      {message ? <div style={errorBanner}>{message}</div> : null}

      <section style={intakePanel}>
        <div style={uploadIcon}><i className="ti ti-file-spreadsheet" /></div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={intakeTitle}>Mẫu Excel chuẩn cho Dự án → Đầu việc lớn → Đầu việc con</div>
          <div style={intakeDesc}>
            Mỗi dòng là một đầu việc con. App chỉ tạo dữ liệu sau khi bạn kiểm tra Preview và bấm xác nhận.
          </div>
          <div style={hintGrid}>
            <MiniStat label="Dự án hiện có" value={loading ? '...' : String(data?.projects.length ?? 0)} />
            <MiniStat label="Đầu việc con" value={loading ? '...' : String(data?.tasks.length ?? 0)} />
            <MiniStat label="Nhân sự map được" value={loading ? '...' : String(data?.people.length ?? 0)} />
          </div>
        </div>

        <div style={actionStack}>
          <a href="/api/task-import/template" style={ghostLinkStyle}>
            <i className="ti ti-download" />
            Tải mẫu Excel
          </a>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".xlsx,.xlsm,.xltx,.xltm"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleExcel(file)
              event.currentTarget.value = ''
            }}
          />
          <PrimaryButton icon={parsing ? 'ti-loader-2' : 'ti-upload'} onClick={() => inputRef.current?.click()} disabled={parsing}>
            {parsing ? 'Đang đọc file...' : 'Upload Excel'}
          </PrimaryButton>
        </div>
      </section>

      {preview ? (
        <section style={previewShell}>
          <div style={previewHead}>
            <div>
              <div style={eyebrow}>Preview trước khi import</div>
              <div style={sectionTitle}>{preview.fileName}</div>
              <div style={intakeDesc}>Sheet: {preview.sheetName} · Sửa trực tiếp lỗi trong bảng rồi mới xác nhận.</div>
            </div>
            <div style={summaryCards}>
              <MetricCard label="Tổng dòng" value={summary.totalRows} />
              <MetricCard label="Có thể import" value={summary.importableRows} tone="success" />
              <MetricCard label="Lỗi cần sửa" value={summary.errorRows} tone={summary.errorRows ? 'danger' : 'neutral'} />
              <MetricCard label="Cảnh báo" value={summary.warningRows} tone="warning" />
            </div>
          </div>

          <div style={summaryRow}>
            <InfoPill tone="neutral">Dự án mới: {summary.newProjects}</InfoPill>
            <InfoPill tone="neutral">Đầu việc lớn mới: {summary.newWorkstreams}</InfoPill>
            <InfoPill tone={summary.duplicateRows ? 'warning' : 'neutral'}>Có thể trùng: {summary.duplicateRows}</InfoPill>
            <InfoPill tone={summary.recurringRows ? 'warning' : 'neutral'}>Deadline định kỳ: {summary.recurringRows}</InfoPill>
            <InfoPill tone={summary.missingOwners ? 'danger' : 'neutral'}>Lỗi owner: {summary.missingOwners}</InfoPill>
            <InfoPill tone={summary.missingDeadlines ? 'danger' : 'neutral'}>Lỗi deadline: {summary.missingDeadlines}</InfoPill>
          </div>

          <div style={previewTableWrap}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Dự án</Th>
                  <Th>Đầu việc lớn</Th>
                  <Th>Đầu việc con</Th>
                  <Th>Owner</Th>
                  <Th>Phối hợp</Th>
                  <Th>Deadline</Th>
                  <Th>Loại</Th>
                  <Th>Ưu tiên</Th>
                  <Th>File/Báo cáo</Th>
                  <Th>Kết quả cần nộp</Th>
                  <Th>Trùng</Th>
                  <Th>Kiểm tra</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={{ background: rowBackground(row) }}>
                    <Td>{row.rowNumber}</Td>
                    <Td>
                      <input
                        list="project-options"
                        value={row.projectName}
                        onChange={(event) => updateRow(row.id, { projectName: event.target.value })}
                        style={cellInputStyle}
                        placeholder="VD: CHIẾN DỊCH QUÝ 3"
                      />
                      <StateBadge state={row.projectState} />
                    </Td>
                    <Td>
                      <input
                        list="workstream-options"
                        value={row.workstreamName}
                        onChange={(event) => updateRow(row.id, { workstreamName: event.target.value })}
                        style={cellInputStyle}
                        placeholder="VD: Cao điểm 7/7"
                      />
                      <StateBadge state={row.workstreamState} labelNew="Sẽ tạo mới" />
                    </Td>
                    <Td>
                      <textarea
                        value={row.taskTitle}
                        onChange={(event) => updateRow(row.id, { taskTitle: event.target.value })}
                        style={cellTextareaStyle}
                        placeholder="Tên đầu việc con"
                      />
                    </Td>
                    <Td>
                      <input
                        list="owner-options"
                        value={row.ownerName}
                        onChange={(event) => updateRow(row.id, { ownerName: event.target.value })}
                        style={cellInputStyle}
                        placeholder="Tên nhân sự"
                      />
                    </Td>
                    <Td>
                      <input
                        value={row.collaboratorNames}
                        onChange={(event) => updateRow(row.id, { collaboratorNames: event.target.value })}
                        style={cellInputStyle}
                        placeholder="Cách nhau bằng dấu phẩy"
                      />
                    </Td>
                    <Td>
                      <input
                        value={row.deadlineRaw}
                        onChange={(event) => updateRow(row.id, { deadlineRaw: event.target.value })}
                        style={cellInputStyle}
                        placeholder="2026-07-07, 7/7, cả tháng 7"
                      />
                      <div style={dateHintStyle}>{row.parsedDeadline ? `Chốt: ${row.parsedDeadline}` : row.recurringLabel || 'Chưa có ngày chốt'}</div>
                    </Td>
                    <Td>
                      <select
                        value={row.deadlineType}
                        onChange={(event) => updateRow(row.id, { deadlineType: event.target.value })}
                        style={cellSelectStyle}
                      >
                        {DEADLINE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </Td>
                    <Td>
                      <select
                        value={row.priority}
                        onChange={(event) => updateRow(row.id, { priority: event.target.value })}
                        style={cellSelectStyle}
                      >
                        {PRIORITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </Td>
                    <Td>
                      <select
                        value={row.needsFile}
                        onChange={(event) => updateRow(row.id, { needsFile: event.target.value })}
                        style={cellSelectStyle}
                      >
                        {NEEDS_FILE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </Td>
                    <Td>
                      <textarea
                        value={row.expectedResult}
                        onChange={(event) => updateRow(row.id, { expectedResult: event.target.value })}
                        style={cellTextareaStyle}
                        placeholder={needsFile(row.needsFile) ? 'VD: Báo cáo, file, link cần nộp' : 'Không bắt buộc'}
                      />
                    </Td>
                    <Td>
                      {row.duplicateTaskId ? (
                        <select
                          value={row.duplicateAction}
                          onChange={(event) => updateRow(row.id, { duplicateAction: event.target.value as BulkImportRow['duplicateAction'] })}
                          style={cellSelectStyle}
                        >
                          <option value="skip">Bỏ qua</option>
                          <option value="update">Cập nhật</option>
                          <option value="create">Vẫn tạo mới</option>
                        </select>
                      ) : (
                        <span style={okBadge}>Không trùng</span>
                      )}
                    </Td>
                    <Td>
                      <IssueList issues={row.issues} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <datalist id="owner-options">
            {ownerOptions.map((owner) => <option key={owner} value={owner} />)}
          </datalist>
          <datalist id="project-options">
            {projectOptions.map((project) => <option key={project} value={project} />)}
          </datalist>
          <datalist id="workstream-options">
            {workstreamOptions.map((workstream) => <option key={workstream} value={workstream} />)}
          </datalist>

          <div style={confirmBar}>
            <div style={bulkText}>
              {summary.errorRows > 0
                ? `Còn ${summary.errorRows} dòng lỗi, chưa thể import.`
                : 'Dữ liệu đã đủ điều kiện. App sẽ tạo project, đầu việc lớn, đầu việc con và bàn giao nếu cần.'}
            </div>
            <GhostButton icon="ti-x" onClick={resetPreview}>Bỏ preview</GhostButton>
            <PrimaryButton icon={confirming ? 'ti-loader-2' : 'ti-check'} onClick={confirmImport} disabled={!canConfirm}>
              {confirming ? 'Đang import...' : 'Xác nhận import'}
            </PrimaryButton>
          </div>
        </section>
      ) : null}

      {result ? (
        <section style={resultPanel}>
          <div>
            <div style={eyebrow}>Import summary</div>
            <div style={sectionTitle}>Đã ghi batch log: {result.importBatchId}</div>
          </div>
          <div style={summaryCards}>
            <MetricCard label="Project mới" value={result.createdProjects} />
            <MetricCard label="Đầu việc lớn" value={result.createdWorkstreams} />
            <MetricCard label="Task mới" value={result.createdTasks} tone="success" />
            <MetricCard label="Task cập nhật" value={result.updatedTasks} />
            <MetricCard label="Task trùng bỏ qua" value={result.skippedDuplicates} tone="warning" />
            <MetricCard label="Bàn giao" value={result.createdDeliverables} />
            <MetricCard label="Nhắc việc" value={result.createdReminders} />
          </div>
          {result.skippedRows.length ? (
            <div style={skipListStyle}>
              {result.skippedRows.slice(0, 8).map((item) => (
                <div key={`${item.rowNumber}-${item.title}`} style={skipItemStyle}>
                  Dòng {item.rowNumber}: {item.title} · {item.reason}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function rebuildClientRow(row: BulkImportRow, catalog: { owners: string[]; projects: string[]; workstreams: string[] }): BulkImportRow {
  const parsed = parseDeadline(row.deadlineRaw, row.deadlineType)
  const ownerSet = new Set(catalog.owners.map(normalizeKey))
  const projectSet = new Set(catalog.projects.map(normalizeKey))
  const workstreamSet = new Set(catalog.workstreams.map(normalizeKey))
  const collaboratorNames = splitPeople(row.collaboratorNames)
  const unknownCollaborators = collaboratorNames.filter((name) => !ownerSet.has(normalizeKey(name)))
  const issues: ImportIssue[] = [...parsed.issues]
  const projectState = !row.projectName ? 'missing' : projectSet.has(normalizeKey(row.projectName)) ? 'existing' : 'new'
  const workstreamState = !row.workstreamName ? 'missing' : workstreamSet.has(normalizeKey(row.workstreamName)) ? 'existing' : 'new'

  if (!row.projectName.trim()) issues.push({ severity: 'error', code: 'missing_project', message: 'Thiếu dự án.' })
  else if (projectState === 'new') issues.push({ severity: 'warning', code: 'new_project', message: 'Dự án chưa có, sẽ tạo mới khi xác nhận.' })

  if (!row.workstreamName.trim()) issues.push({ severity: 'error', code: 'missing_workstream', message: 'Thiếu đầu việc lớn.' })
  else if (workstreamState === 'new') issues.push({ severity: 'warning', code: 'new_workstream', message: 'Đầu việc lớn chưa có trong dự án, sẽ tạo mới.' })

  if (!row.taskTitle.trim()) issues.push({ severity: 'error', code: 'missing_task', message: 'Thiếu đầu việc con.' })
  if (!row.ownerName.trim()) issues.push({ severity: 'error', code: 'missing_owner', message: 'Thiếu người phụ trách chính.' })
  else if (!ownerSet.has(normalizeKey(row.ownerName))) issues.push({ severity: 'error', code: 'owner_not_found', message: `Chưa có nhân sự "${row.ownerName}" trong app.` })

  if (unknownCollaborators.length) {
    issues.push({
      severity: 'warning',
      code: 'supporter_not_found',
      message: `Người phối hợp chưa có trong app: ${unknownCollaborators.join(', ')}.`,
    })
  }

  if (row.duplicateTaskId) {
    issues.push({ severity: 'warning', code: 'duplicate_existing', message: 'Đầu việc con có thể đã tồn tại trong hệ thống.' })
  }

  return {
    ...row,
    deadlineType: normalizeDeadlineType(row.deadlineType),
    priority: normalizePriorityLabel(row.priority),
    needsFile: normalizeNeedsFileLabel(row.needsFile),
    parsedDeadline: parsed.dueDate,
    parsedStartDate: parsed.startDate,
    parsedEndDate: parsed.endDate,
    deadlineKind: parsed.kind,
    recurringLabel: parsed.label,
    projectState,
    workstreamState,
    unknownCollaborators,
    issues,
  }
}

function rebuildFileDuplicates(rows: BulkImportRow[]) {
  const seen = new Set<string>()
  return rows.map((row) => {
    const key = [
      normalizeKey(row.projectName),
      normalizeKey(row.workstreamName),
      normalizeKey(row.taskTitle),
      normalizeKey(row.ownerName),
      row.parsedDeadline ?? '',
    ].join('|')
    const duplicateInFile = seen.has(key)
    if (!duplicateInFile) seen.add(key)
    const issues = row.issues.filter((issue) => issue.code !== 'duplicate_in_file')
    if (duplicateInFile) {
      issues.push({ severity: 'warning', code: 'duplicate_in_file', message: 'Có thể trùng với một dòng khác trong file.' })
    }
    return { ...row, issues }
  })
}

function rowBackground(row: BulkImportRow) {
  if (hasImportErrors(row)) return 'rgba(239, 68, 68, 0.08)'
  if (row.issues.length) return 'rgba(218, 223, 33, 0.06)'
  return 'transparent'
}

function StateBadge({ state, labelNew = 'Sẽ tạo mới' }: { state: BulkImportRow['projectState']; labelNew?: string }) {
  if (state === 'existing') return <span style={okBadge}>Đã có</span>
  if (state === 'new') return <span style={warningBadge}>{labelNew}</span>
  return <span style={dangerBadge}>Thiếu</span>
}

function IssueList({ issues }: { issues: ImportIssue[] }) {
  if (!issues.length) return <span style={okBadge}>Sẵn sàng</span>
  return (
    <div style={issueListStyle}>
      {issues.slice(0, 4).map((issue, index) => (
        <span key={`${issue.code}-${index}`} style={issue.severity === 'error' ? dangerBadge : warningBadge}>
          {issue.message}
        </span>
      ))}
      {issues.length > 4 ? <span style={mutedText}>+{issues.length - 4} cảnh báo khác</span> : null}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={miniStatStyle}>
      <span>{value}</span>
      <small>{label}</small>
    </div>
  )
}

function MetricCard({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return (
    <div style={metricCardStyle(tone)}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function InfoPill({ children, tone }: { children: React.ReactNode; tone: 'warning' | 'danger' | 'neutral' }) {
  return <div style={infoPillStyle(tone)}>{children}</div>
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={tdStyle}>{children}</td>
}

function GhostButton({ children, icon, onClick }: { children: React.ReactNode; icon: string; onClick?: () => void }) {
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
    <button onClick={onClick} disabled={disabled} style={{ ...primaryBtnStyle, opacity: disabled ? 0.55 : 1 }}>
      <i className={`ti ${icon}`} />
      {children}
    </button>
  )
}

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}

const intakePanel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  flexWrap: 'wrap',
}

const uploadIcon: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 10,
  background: 'rgba(218, 223, 33, 0.14)',
  color: 'var(--lime)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 21,
}

const intakeTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: 'var(--txt)',
}

const intakeDesc: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: 'var(--txt-3)',
  lineHeight: 1.45,
}

const hintGrid: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  marginTop: 12,
}

const miniStatStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 112,
  padding: '8px 10px',
  borderRadius: 10,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  color: 'var(--txt)',
  fontSize: 13,
  fontWeight: 800,
}

const actionStack: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const ghostLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 14px',
  borderRadius: 10,
  border: '1px solid var(--line-2)',
  color: 'var(--txt)',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 700,
}

const errorBanner: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(239, 68, 68, 0.12)',
  color: '#fca5a5',
  fontSize: 13,
  fontWeight: 700,
}

const previewShell: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  overflow: 'hidden',
}

const previewHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 18,
  padding: '16px 18px',
  borderBottom: '1px solid var(--line)',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}

const summaryCards: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const summaryRow: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  padding: '12px 18px',
  borderBottom: '1px solid var(--line)',
}

const previewTableWrap: React.CSSProperties = {
  overflowX: 'auto',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 1500,
  borderCollapse: 'collapse',
  fontSize: 13,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 11,
  textTransform: 'uppercase',
  color: 'var(--txt-3)',
  fontWeight: 800,
  padding: '10px 12px',
  borderBottom: '1px solid var(--line)',
  background: 'var(--surface-2)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: '1px solid var(--line)',
  verticalAlign: 'top',
  color: 'var(--txt-2)',
}

const cellInputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 170,
  borderRadius: 8,
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--txt)',
  padding: '8px 9px',
}

const cellTextareaStyle: React.CSSProperties = {
  ...cellInputStyle,
  minHeight: 58,
  resize: 'vertical',
  lineHeight: 1.4,
}

const cellSelectStyle: React.CSSProperties = {
  minWidth: 132,
  borderRadius: 8,
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--txt)',
  padding: '8px 9px',
}

const dateHintStyle: React.CSSProperties = {
  marginTop: 5,
  fontSize: 11.5,
  color: 'var(--txt-3)',
}

const okBadge: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  padding: '3px 8px',
  borderRadius: 999,
  background: 'rgba(34, 197, 94, 0.14)',
  color: '#86efac',
  fontSize: 11,
  fontWeight: 800,
  marginTop: 5,
}

const warningBadge: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  padding: '3px 8px',
  borderRadius: 999,
  background: 'rgba(218, 223, 33, 0.14)',
  color: 'var(--lime)',
  fontSize: 11,
  fontWeight: 800,
}

const dangerBadge: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  padding: '3px 8px',
  borderRadius: 999,
  background: 'rgba(239, 68, 68, 0.14)',
  color: '#fca5a5',
  fontSize: 11,
  fontWeight: 800,
}

const issueListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  minWidth: 190,
}

const mutedText: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--txt-3)',
}

const confirmBar: React.CSSProperties = {
  padding: '12px 16px',
  borderTop: '1px solid var(--line)',
  background: 'var(--surface-2)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
}

const bulkText: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--txt)',
  flex: 1,
  minWidth: 240,
}

const resultPanel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
}

const skipListStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
}

const skipItemStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  background: 'var(--surface-2)',
  color: 'var(--txt-2)',
  fontSize: 12.5,
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 14px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  border: '1px solid var(--line-2)',
  color: 'var(--txt)',
  background: 'transparent',
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 14px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 800,
  color: 'var(--lime-ink)',
  background: 'var(--lime)',
  border: '1px solid transparent',
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: 'uppercase',
  color: 'var(--txt-3)',
}

const sectionTitle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 17,
  fontWeight: 800,
  color: 'var(--txt)',
}

const metricCardStyle = (tone: 'neutral' | 'success' | 'warning' | 'danger'): React.CSSProperties => ({
  display: 'inline-flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 92,
  padding: '9px 11px',
  borderRadius: 10,
  background:
    tone === 'success'
      ? 'rgba(34, 197, 94, 0.12)'
      : tone === 'warning'
        ? 'rgba(218, 223, 33, 0.12)'
        : tone === 'danger'
          ? 'rgba(239, 68, 68, 0.12)'
          : 'var(--surface-2)',
  color:
    tone === 'success'
      ? '#86efac'
      : tone === 'warning'
        ? 'var(--lime)'
        : tone === 'danger'
          ? '#fca5a5'
          : 'var(--txt)',
  fontSize: 12,
})

const infoPillStyle = (tone: 'warning' | 'danger' | 'neutral'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background:
    tone === 'warning'
      ? 'rgba(218, 223, 33, 0.14)'
      : tone === 'danger'
        ? 'rgba(239, 68, 68, 0.14)'
        : 'var(--surface-2)',
  color:
    tone === 'warning'
      ? 'var(--lime)'
      : tone === 'danger'
        ? '#fca5a5'
        : 'var(--txt-2)',
})
