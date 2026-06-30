'use client'

import React from 'react'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { PageHead } from '@/components/ui/PageHead'
import { useCommandData } from '@/hooks/useCommandData'
import type {
  CommandCenterPersonRow,
  CommandCenterProjectRow,
  CommandCenterTaskRow,
} from '@/lib/database.types'

const FILTER_CHIPS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'no_owner', label: 'Thiếu người nhận' },
  { key: 'no_deadline', label: 'Thiếu deadline' },
  { key: 'ready', label: 'Sẵn sàng nhập' },
] as const

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  BLOCKED: { label: 'Bị chặn', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' },
  IN_PROGRESS: { label: 'Đang làm', bg: 'var(--color-waiting-bg)', color: 'var(--color-waiting)' },
  WAITING: { label: 'Đang chờ', bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  NOT_STARTED: { label: 'Chưa bắt đầu', bg: 'var(--surface-3)', color: 'var(--txt-2)' },
  COMPLETED: { label: 'Hoàn thành', bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  REVISION_REQUIRED: { label: 'Cần sửa', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' },
}

type FilterKey = (typeof FILTER_CHIPS)[number]['key']

interface PreviewRow {
  id: string
  stt: string
  group: string
  title: string
  owner: string
  collaborators: string
  mentionedDeadline: string
  inputDeadline: string
  needsDeadline: string
  status: string
  priority: string
  expectedResult: string
  note: string
  source: string
  warnings: string[]
}

interface PreviewPayload {
  fileName: string
  sheetName: string
  headers: string[]
  rows: PreviewRow[]
  summary: {
    totalRows: number
    missingOwners: number
    missingDeadlines: number
    duplicates: number
  }
  catalog: {
    owners: string[]
    statuses: string[]
    priorities: string[]
  }
}

interface DisplayRow {
  id: string
  title: string
  projectName: string
  owner: string
  deadline: string
  status: string
  priority: string
  source: string
  ready: boolean
  missingOwner: boolean
  missingDeadline: boolean
  imported: boolean
}

interface MissingFieldRow {
  id: string
  title: string
  group: string
  ownerMissing: boolean
  deadlineMissing: boolean
}

export default function TaskInboxPage() {
  const { data, loading, error, refresh } = useCommandData()
  const tasks: CommandCenterTaskRow[] = data?.tasks ?? []
  const people = Object.fromEntries(
    ((data?.people ?? []) as CommandCenterPersonRow[]).map((person) => [person.id, person]),
  )
  const projects = Object.fromEntries(
    ((data?.projects ?? []) as CommandCenterProjectRow[]).map((project) => [project.id, project]),
  )

  const [activeFilter, setActiveFilter] = React.useState<FilterKey>('all')
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [preview, setPreview] = React.useState<PreviewPayload | null>(null)
  const [previewRows, setPreviewRows] = React.useState<PreviewRow[]>([])
  const [parsing, setParsing] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [importError, setImportError] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const ownerOptions = React.useMemo(() => {
    const fromPeople = Object.values(people).map((person) => person.full_name)
    const fromPreview = preview?.catalog.owners ?? []
    return Array.from(new Set([...fromPeople, ...fromPreview])).filter(Boolean).sort()
  }, [people, preview?.catalog.owners])

  const statusOptions = React.useMemo(
    () => Array.from(new Set([...(preview?.catalog.statuses ?? []), 'Chưa bắt đầu', 'Đang làm', 'Chờ duyệt', 'Hoàn thành', 'Tạm dừng', 'Đang trễ'])).filter(Boolean),
    [preview?.catalog.statuses],
  )

  const priorityOptions = React.useMemo(
    () => Array.from(new Set([...(preview?.catalog.priorities ?? []), 'Cao', 'Trung bình', 'Thấp'])).filter(Boolean),
    [preview?.catalog.priorities],
  )

  const rowsNeedingCompletion = React.useMemo<MissingFieldRow[]>(
    () =>
      previewRows
        .map((row) => ({
          id: row.id,
          title: row.title,
          group: row.group,
          ownerMissing: row.warnings.includes('Thiáº¿u ngÆ°á»i phá»¥ trÃ¡ch'),
          deadlineMissing: row.warnings.includes('Thiáº¿u deadline nháº­p'),
        }))
        .filter((row) => row.ownerMissing || row.deadlineMissing),
    [previewRows],
  )

  const incompleteRows = React.useMemo(
    () => previewRows.filter((row) => isOwnerMissing(row) || isDeadlineMissing(row)),
    [previewRows],
  )
  const canConfirmImport = incompleteRows.length === 0 && previewRows.length > 0

  const baseRows: DisplayRow[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    projectName: task.project_id ? projects[task.project_id]?.name ?? 'Không rõ dự án' : 'Không rõ dự án',
    owner: task.owner_id ? people[task.owner_id]?.full_name ?? 'Chưa có' : 'Chưa có',
    deadline: task.due_date ?? '',
    status: STATUS_CFG[task.status]?.label ?? 'Chưa bắt đầu',
    priority: task.priority,
    source: 'Từ hệ thống',
    ready: Boolean(task.owner_id && task.due_date),
    missingOwner: !task.owner_id,
    missingDeadline: !task.due_date,
    imported: false,
  }))

  const allRows = baseRows

  const filteredRows = allRows.filter((row) => {
    if (activeFilter === 'no_owner') return row.missingOwner
    if (activeFilter === 'no_deadline') return row.missingDeadline
    if (activeFilter === 'ready') return row.ready
    return true
  })

  function toggleRow(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds((current) => {
      if (current.size === filteredRows.length) return new Set()
      return new Set(filteredRows.map((task) => task.id))
    })
  }

  async function handleExcel(file: File) {
    setParsing(true)
    setImportError('')

    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/task-import/preview', { method: 'POST', body: form })
      const payload = (await response.json()) as PreviewPayload | { error?: string }

      if (!response.ok || ('error' in payload && payload.error)) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Không đọc được file Excel.')
      }

      const result = payload as PreviewPayload
      setPreview(result)
      setPreviewRows(result.rows.map(normalizePreviewRow))
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Không đọc được file Excel.')
    } finally {
      setParsing(false)
    }
  }

  function updatePreviewRow(id: string, patch: Partial<PreviewRow>) {
    setPreviewRows((current) =>
      current.map((row) => (row.id === id ? rebuildWarnings(normalizePreviewRow({ ...row, ...patch })) : row)),
    )
  }

  async function confirmImport() {
    const cleanRows = previewRows.map((row) => rebuildWarnings(normalizePreviewRow(row)))
    const incompleteCleanRows = cleanRows.filter((row) => isOwnerMissing(row) || isDeadlineMissing(row))
    if (incompleteCleanRows.length > 0) {
      setImportError('Con dau viec chua du owner hoac deadline. Hay cap nhat xong roi xac nhan nhap.')
      setPreviewRows(cleanRows)
      return
    }
    const invalidRows = cleanRows.filter((row) =>
      row.warnings.some((warning) => warning === 'Thiáº¿u ngÆ°á»i phá»¥ trÃ¡ch' || warning === 'Thiáº¿u deadline nháº­p'),
    )
    if (invalidRows.length > 0) {
      setImportError('CÃ²n Ä‘áº§u viá»‡c chÆ°a Ä‘á»§ owner hoáº·c deadline. HÃ£y cáº­p nháº­t xong rá»“i hÃ£y xÃ¡c nháº­n nháº­p.')
      setPreviewRows(cleanRows)
      return
    }
    setConfirming(true)
    setImportError('')
    try {
      const response = await fetch('/api/task-import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: cleanRows }),
      })
      const payload = (await response.json()) as { imported?: number; error?: string }
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? 'Không nhập được dữ liệu vào database.')
      }
      await refresh()
      setPreview(null)
      setPreviewRows([])
      setSelectedIds(new Set())
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Không nhập được dữ liệu vào database.')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-inbox"
        title="Inbox đầu việc"
        desc="Nhận file đầu việc theo mẫu công ty, rà owner/deadline trước rồi xác nhận mới nhập vào app."
      />

      {error ? <DataErrorState message={error} /> : null}

      <div style={intakePanel}>
        <div style={uploadIcon}>
          <i className="ti ti-file-import" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={intakeTitle}>Import Excel công ty</div>
          <div style={intakeDesc}>
            App sẽ đọc đúng các cột như Nhóm, Đầu việc, Người phụ trách, Deadline nhập, Trạng thái, Ưu tiên, Kết quả cần có và chỉ thêm vào app sau khi bạn xác nhận.
          </div>
        </div>
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
        <PrimaryButton icon={parsing ? 'ti-loader-2' : 'ti-upload'} onClick={() => inputRef.current?.click()}>
          {parsing ? 'Đang đọc file...' : 'Tải file Excel'}
        </PrimaryButton>
      </div>

      {importError ? <div style={errorBanner}>{importError}</div> : null}

      {preview ? (
        <section style={previewShell}>
          <div style={previewHead}>
            <div>
              <div style={eyebrow}>Bản xem trước trước khi nhập</div>
              <div style={sectionTitle}>{preview.fileName}</div>
              <div style={intakeDesc}>Sheet: {preview.sheetName} · Chỉ khi bấm xác nhận mới đưa vào app.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <MetricBadge label="Tổng dòng" value={previewRows.length} />
              <MetricBadge label="Thiếu owner" value={previewRows.filter((row) => !row.owner).length} danger />
              <MetricBadge label="Thiếu deadline" value={previewRows.filter((row) => needsDeadlineInput(row) && !row.inputDeadline).length} danger />
            </div>
          </div>

          <div style={summaryRow}>
            <InfoPill tone="warning">Cần xác nhận: {preview.summary.totalRows} đầu việc</InfoPill>
            <InfoPill tone="danger">Có thể trùng: {previewRows.filter((row) => row.warnings.includes('Có thể trùng đầu việc')).length}</InfoPill>
            <InfoPill tone="neutral">Owner option: {ownerOptions.length}</InfoPill>
          </div>

          {!canConfirmImport ? (
            <div style={actionPanelStyle}>
              <div style={actionPanelHeadStyle}>
                <div>
                  <div style={sectionTitle}>Cần cập nhật trước khi đưa vào app</div>
                  <div style={intakeDesc}>
                    Các dòng chưa đủ owner hoặc deadline sẽ được giữ trạng thái <strong>Chưa bắt đầu</strong> cho tới khi bạn chốt xong.
                  </div>
                </div>
                <InfoPill tone="danger">Còn {rowsNeedingCompletion.length} dòng chờ bổ sung</InfoPill>
              </div>

              <div style={actionGridStyle}>
                {rowsNeedingCompletion.map((row) => {
                  const currentRow = previewRows.find((item) => item.id === row.id)
                  if (!currentRow) return null

                  return (
                    <div key={row.id} style={actionCardStyle}>
                      <div style={nameStack}>
                        <span style={nameText}>{row.title}</span>
                        <span style={mutedText}>{row.group || 'Chưa gắn nhóm'}</span>
                      </div>

                      <div style={actionFieldGridStyle}>
                        <label style={fieldLabelStyle}>
                          Người phụ trách
                          <input
                            list="owner-options"
                            value={currentRow.owner}
                            onChange={(e) => updatePreviewRow(row.id, { owner: e.target.value })}
                            placeholder="Nhập hoặc chọn owner"
                            style={cellInputStyle}
                          />
                        </label>

                        <label style={fieldLabelStyle}>
                          Deadline nhập
                          <input
                            type="date"
                            value={toDateInputValue(currentRow.inputDeadline)}
                            onChange={(e) => updatePreviewRow(row.id, { inputDeadline: e.target.value })}
                            style={cellInputStyle}
                          />
                        </label>

                        <div style={fieldLabelStyle}>
                          Trạng thái khi nhập
                          <div style={statusPreviewStyle}>
                            <span style={{ ...pillStyle, background: STATUS_CFG.NOT_STARTED.bg, color: STATUS_CFG.NOT_STARTED.color }}>
                              {STATUS_CFG.NOT_STARTED.label}
                            </span>
                            <span style={mutedText}>Sau khi chốt deadline, app mới cho đi tiếp các trạng thái khác.</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div style={previewTableWrap}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Nhóm</Th>
                  <Th>Đầu việc</Th>
                  <Th>Người phụ trách</Th>
                  <Th>Deadline họp</Th>
                  <Th>Deadline nhập</Th>
                  <Th>Trạng thái</Th>
                  <Th>Ưu tiên</Th>
                  <Th>Cảnh báo</Th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.id} style={{ background: row.warnings.length ? 'rgba(196,123,43,.07)' : 'transparent' }}>
                    <Td>{row.group || '-'}</Td>
                    <Td>
                      <div style={nameStack}>
                        <input
                          value={row.title}
                          onChange={(e) => updatePreviewRow(row.id, { title: e.target.value })}
                          style={cellInputStyle}
                        />
                        <span style={mutedText}>{row.expectedResult || 'Chưa có kết quả cần có'}</span>
                      </div>
                    </Td>
                    <Td>
                      <input
                        list="owner-options"
                        value={row.owner}
                        onChange={(e) => updatePreviewRow(row.id, { owner: e.target.value })}
                        placeholder="Chọn hoặc nhập owner"
                        style={cellInputStyle}
                      />
                    </Td>
                    <Td>{row.mentionedDeadline || 'Không nêu'}</Td>
                    <Td>
                      <input
                        value={row.inputDeadline}
                        onChange={(e) => updatePreviewRow(row.id, { inputDeadline: e.target.value })}
                        placeholder="YYYY-MM-DD hoặc mốc nhập"
                        style={cellInputStyle}
                      />
                    </Td>
                    <Td>
                      <select value={row.status} onChange={(e) => updatePreviewRow(row.id, { status: e.target.value })} style={cellSelectStyle}>
                        {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </Td>
                    <Td>
                      <select value={row.priority} onChange={(e) => updatePreviewRow(row.id, { priority: e.target.value })} style={cellSelectStyle}>
                        {priorityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {row.warnings.length === 0 ? (
                          <span style={okBadge}>Ổn để nhập</span>
                        ) : (
                          row.warnings.map((warning) => (
                            <span key={warning} style={warningBadge}>{warning}</span>
                          ))
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <datalist id="owner-options">
            {ownerOptions.map((owner) => <option key={owner} value={owner} />)}
          </datalist>

          <div style={confirmBar}>
            <div style={bulkText}>
              App chỉ nhập vào khi bạn bấm xác nhận. Các dòng đang thiếu owner/deadline vẫn được giữ lại để bạn sửa tiếp tại đây.
            </div>
            <GhostButton icon="ti-x" onClick={() => { setPreview(null); setPreviewRows([]) }}>Bỏ bản xem trước</GhostButton>
            <PrimaryButton icon={confirming ? 'ti-loader-2' : 'ti-check'} onClick={confirmImport}>
              {confirming ? 'Đang lưu database...' : 'Xác nhận nhập vào app'}
            </PrimaryButton>
          </div>
        </section>
      ) : null}

      <div style={chipRow}>
        {FILTER_CHIPS.map((chip) => {
          const count =
            chip.key === 'all'
              ? allRows.length
              : chip.key === 'no_owner'
                ? allRows.filter((task) => task.missingOwner).length
                : chip.key === 'no_deadline'
                  ? allRows.filter((task) => task.missingDeadline).length
                  : allRows.filter((task) => task.ready).length
          const active = chip.key === activeFilter

          return (
            <button key={chip.key} onClick={() => setActiveFilter(chip.key)} style={chipStyle(active)}>
              {chip.label} {count > 0 ? `(${count})` : ''}
            </button>
          )
        })}
      </div>

      <section style={sectionCard}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>
                <input
                  type="checkbox"
                  checked={filteredRows.length > 0 && selectedIds.size === filteredRows.length}
                  onChange={toggleAll}
                />
              </Th>
              <Th>Đầu việc</Th>
              <Th>Nhóm / Dự án</Th>
              <Th>Người nhận</Th>
              <Th>Deadline</Th>
              <Th>Trạng thái</Th>
              <Th>Nguồn</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <Td colSpan={7}>Đang tải...</Td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <Td colSpan={7}>Chưa có đầu việc nào trong bộ lọc này.</Td>
              </tr>
            ) : (
              filteredRows.map((task) => {
                const status = mapLocalStatus(task.status)

                return (
                  <tr key={task.id} style={{ background: selectedIds.has(task.id) ? 'rgba(218,223,33,.08)' : 'transparent' }}>
                    <Td>
                      <input type="checkbox" checked={selectedIds.has(task.id)} onChange={() => toggleRow(task.id)} />
                    </Td>
                    <Td>
                      <div style={nameStack}>
                        <span style={nameText}>{task.title}</span>
                        <span style={mutedText}>{task.priority}</span>
                      </div>
                    </Td>
                    <Td>{task.projectName}</Td>
                    <Td>{task.owner || 'Chưa có'}</Td>
                    <Td>{task.deadline || 'Chưa có'}</Td>
                    <Td>
                      <span style={{ ...pillStyle, background: status.bg, color: status.color }}>{status.label}</span>
                    </Td>
                    <Td>
                      <div style={nameStack}>
                        <span style={mutedText}>{task.source}</span>
                        {task.imported ? <span style={okBadge}>Đã xác nhận</span> : null}
                      </div>
                    </Td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {selectedIds.size > 0 && (
          <div style={bulkBar}>
            <span style={bulkText}>{selectedIds.size} đã chọn</span>
            <GhostButton icon="ti-edit">Sửa hàng loạt</GhostButton>
            <PrimaryButton icon="ti-download">Đưa vào luồng xử lý</PrimaryButton>
          </div>
        )}
      </section>

      <div style={noteStyle}>
        Luồng đúng theo file công ty: tải Excel → app đọc cột → bạn rà và sửa → xác nhận → mới thêm vào danh sách đầu việc trong app.
      </div>
    </div>
  )
}

function needsDeadlineInput(row: PreviewRow) {
  return row.needsDeadline.toLowerCase().includes('cần nhập')
}

function normalizePreviewRow(row: PreviewRow): PreviewRow {
  const nextStatus = row.status.trim() || 'Chưa bắt đầu'
  const shouldResetStatus = !row.inputDeadline.trim() || !row.owner.trim()

  return {
    ...row,
    status: shouldResetStatus ? 'Chưa bắt đầu' : nextStatus,
  }
}

function isOwnerMissing(row: PreviewRow) {
  const normalized = row.owner.trim().toLowerCase()
  return !normalized || normalized === 'chua chot' || normalized === 'chÆ°a chá»‘t'
}

function isDeadlineMissing(row: PreviewRow) {
  return needsDeadlineInput(row) && !row.inputDeadline.trim()
}

function rebuildWarnings(row: PreviewRow): PreviewRow {
  const warnings: string[] = []
  if (!row.owner.trim() || row.owner.trim().toLowerCase() === 'chưa chốt') warnings.push('Thiếu người phụ trách')
  if (needsDeadlineInput(row) && !row.inputDeadline.trim()) warnings.push('Thiếu deadline nhập')
  if (row.mentionedDeadline.trim() && !row.inputDeadline.trim()) warnings.push('Có deadline trong họp nhưng chưa chốt ngày nhập')
  return { ...row, warnings }
}

function mapLocalStatus(status: string) {
  const normalized = status.toUpperCase().replaceAll(' ', '_')
  return STATUS_CFG[normalized] ?? { label: status || 'Chưa bắt đầu', bg: 'var(--surface-3)', color: 'var(--txt-2)' }
}

function toDateInputValue(value: string) {
  const trimmed = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : ''
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>
}

function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return <td colSpan={colSpan} style={tdStyle}>{children}</td>
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
  style,
  onClick,
}: {
  children: React.ReactNode
  icon: string
  style?: React.CSSProperties
  onClick?: () => void
}) {
  return (
    <button onClick={onClick} style={{ ...primaryBtnStyle, ...style }}>
      <i className={`ti ${icon}`} />
      {children}
    </button>
  )
}

function MetricBadge({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div style={metricBadgeStyle(danger)}>
      <span>{value}</span>
      <span style={{ opacity: 0.8 }}>{label}</span>
    </div>
  )
}

function InfoPill({ children, tone }: { children: React.ReactNode; tone: 'warning' | 'danger' | 'neutral' }) {
  return <div style={infoPillStyle(tone)}>{children}</div>
}

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}

const intakePanel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
}

const uploadIcon: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 10,
  background: 'rgba(218, 223, 33, 0.22)',
  color: 'var(--color-lime-d)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
}

const intakeTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--txt)',
}

const intakeDesc: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: 'var(--txt-3)',
  lineHeight: 1.45,
}

const errorBanner: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(184,64,64,0.08)',
  color: 'var(--color-danger)',
  fontSize: 12.5,
  fontWeight: 600,
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
  gap: 16,
  padding: '16px 18px',
  borderBottom: '1px solid var(--line)',
  alignItems: 'flex-start',
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

const actionPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: '16px 18px',
  borderBottom: '1px solid var(--line)',
  background: 'rgba(218, 223, 33, 0.05)',
}

const actionPanelHeadStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}

const actionGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 12,
}

const actionCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 14,
  borderRadius: 12,
  border: '1px solid rgba(218, 223, 33, 0.22)',
  background: 'var(--surface)',
}

const actionFieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--txt-2)',
}

const statusPreviewStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minHeight: 42,
  justifyContent: 'center',
}

const chipRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 12.5,
  fontWeight: 600,
  padding: '6px 13px',
  borderRadius: 20,
  border: `1px solid ${active ? 'var(--lime)' : 'var(--line-2)'}`,
  background: active ? 'var(--lime)' : 'transparent',
  color: active ? 'var(--lime-ink)' : 'var(--txt-2)',
})

const sectionCard: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  overflow: 'hidden',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  color: 'var(--txt-3)',
  fontWeight: 700,
  padding: '10px 12px',
  borderBottom: '1px solid var(--line)',
  background: 'var(--surface-2)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '12px',
  borderBottom: '1px solid var(--line)',
  verticalAlign: 'top',
  color: 'var(--txt-2)',
}

const nameStack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const nameText: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  color: 'var(--txt)',
}

const mutedText: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--txt-3)',
}

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  fontWeight: 700,
  padding: '2px 9px',
  borderRadius: 20,
}

const bulkBar: React.CSSProperties = {
  padding: '10px 16px',
  borderTop: '1px solid var(--line)',
  background: 'var(--surface-2)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
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

const noteStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--txt-3)',
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '8px 14px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  border: '1px solid var(--line-2)',
  color: 'var(--txt)',
  background: 'transparent',
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '8px 14px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--lime-ink)',
  background: 'var(--lime)',
}

const cellInputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 160,
  borderRadius: 8,
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--txt)',
  padding: '7px 9px',
}

const cellSelectStyle: React.CSSProperties = {
  minWidth: 140,
  borderRadius: 8,
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--txt)',
  padding: '7px 9px',
}

const warningBadge: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  padding: '3px 8px',
  borderRadius: 999,
  background: 'var(--color-warning-bg)',
  color: 'var(--color-warning)',
  fontSize: 11,
  fontWeight: 700,
}

const okBadge: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  padding: '3px 8px',
  borderRadius: 999,
  background: 'var(--color-success-bg)',
  color: 'var(--color-success)',
  fontSize: 11,
  fontWeight: 700,
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

const metricBadgeStyle = (danger: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  flexDirection: 'column',
  gap: 3,
  padding: '8px 10px',
  borderRadius: 10,
  minWidth: 82,
  background: danger ? 'var(--color-danger-bg)' : 'var(--surface-2)',
  color: danger ? 'var(--color-danger)' : 'var(--txt)',
  fontSize: 12,
  fontWeight: 700,
})

const infoPillStyle = (tone: 'warning' | 'danger' | 'neutral'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  background:
    tone === 'warning'
      ? 'var(--color-warning-bg)'
      : tone === 'danger'
        ? 'var(--color-danger-bg)'
        : 'var(--surface-2)',
  color:
    tone === 'warning'
      ? 'var(--color-warning)'
      : tone === 'danger'
        ? 'var(--color-danger)'
        : 'var(--txt-2)',
})
