'use client'
/* Internal Design System Preview — Not a production module */
import React from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { Tooltip } from '@/components/ui/Tooltip'
import { Switch } from '@/components/ui/Switch'
import { Divider } from '@/components/ui/Divider'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Checkbox, Radio } from '@/components/ui/Checkbox'
import { Pagination } from '@/components/ui/Pagination'
import { Drawer } from '@/components/feedback/Drawer'
import { Modal, ConfirmDialog } from '@/components/feedback/Modal'
import { Popover } from '@/components/feedback/Popover'
import { useToast } from '@/components/feedback/Toast'
import { StatusDot } from '@/components/data-display/StatusDot'
import { Skeleton, SkeletonText } from '@/components/data-display/Skeleton'
import { LoadingSpinner } from '@/components/data-display/LoadingSpinner'
import { ProgressBar, CircularProgress } from '@/components/data-display/Progress'
import { EmptyState, ErrorState } from '@/components/data-display/EmptyState'
import { DataTable, TableToolbar, type Column } from '@/components/data-display/DataTable'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 4 }}>{title}</h2>
        <div style={{ height: 2, width: 48, background: 'var(--color-lime)' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
        {children}
      </div>
    </section>
  )
}

type DemoRow = { id: string; name: string; role: string; status: string }
const DEMO_ROWS: DemoRow[] = [
  { id: '1', name: 'Nguyễn Quang', role: 'Project Coordinator', status: 'Đang hoạt động' },
  { id: '2', name: 'Trần Thị Mai',  role: 'Designer',            status: 'Bận' },
  { id: '3', name: 'Lê Văn Hùng',  role: 'Developer',            status: 'Đang hoạt động' },
]
const DEMO_COLS: Column<DemoRow>[] = [
  { key: 'name',   header: 'Tên' },
  { key: 'role',   header: 'Vai trò' },
  { key: 'status', header: 'Trạng thái', render: row => (
    <StatusDot color={row.status === 'Đang hoạt động' ? 'success' : 'warning'} label={row.status} />
  )},
]
/* DEMO DATA — PHASE 1 ONLY */

export default function DesignSystemPage() {
  const { toast } = useToast()
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [modalOpen, setModalOpen] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [sw, setSw] = React.useState(false)
  const [page, setPage] = React.useState(1)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-10)' }}>
      {/* Header */}
      <div style={{
        background: 'var(--color-charcoal)', color: '#fff',
        padding: 'var(--space-4) var(--space-6)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-lime)', marginBottom: 4 }}>INTERNAL</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)', color: '#fff', margin: 0 }}>Design System Preview</h1>
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>Not a production module</span>
      </div>

      {/* Colors */}
      <Section title="Bảng màu">
        {[
          ['Ivory',    '#F1EDE4'],
          ['Charcoal', '#191919'],
          ['Olive',    '#2D331A'],
          ['Lime',     '#DADF21'],
          ['Success',  '#4A8C5C'],
          ['Warning',  '#C47B2B'],
          ['Danger',   '#B84040'],
          ['Waiting',  '#6B8A99'],
          ['Muted',    '#8C8278'],
        ].map(([name, hex]) => (
          <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 'var(--radius-md)',
              background: hex,
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }} />
            <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{name}</span>
            <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{hex}</span>
          </div>
        ))}
      </Section>

      <Divider />

      {/* Typography */}
      <Section title="Typography">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%' }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-3xl)', fontWeight: 700 }}>Heading 3XL — Serif Bold</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Heading 2XL — Serif Bold</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Heading XL — Serif Bold</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)', fontWeight: 600 }}>Label LG — Sans Semibold</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 400 }}>Body — Sans Regular. Nền tảng điều hành dự án.</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Small muted — 13px</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Mono label — ui-monospace · 11px</div>
        </div>
      </Section>

      <Divider />

      {/* Buttons */}
      <Section title="Buttons">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="primary" loading>Loading</Button>
        <Button variant="primary" disabled>Disabled</Button>
        <Button variant="primary" size="sm">Small</Button>
        <Button variant="primary" size="lg">Large</Button>
      </Section>

      <Divider />

      {/* Badges */}
      <Section title="Badge & Status">
        <Badge>Default</Badge>
        <Badge variant="success">Hoàn thành</Badge>
        <Badge variant="warning">Cần chú ý</Badge>
        <Badge variant="danger">Trễ hạn</Badge>
        <Badge variant="waiting">Đang chờ</Badge>
        <Badge variant="lime">Active</Badge>
        <StatusDot color="success" label="Đang hoạt động" />
        <StatusDot color="warning" label="Bận" />
        <StatusDot color="danger" label="Lỗi" />
        <StatusDot color="waiting" label="Đang chờ" />
        <StatusDot color="muted" label="Không hoạt động" />
      </Section>

      <Divider />

      {/* Inputs */}
      <Section title="Inputs">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: '100%', maxWidth: 400 }}>
          <Input label="Tên dự án" placeholder="Nhập tên..." />
          <Input label="Email" placeholder="email@example.com" type="email" suffix="@" />
          <Input label="Lỗi" error="Trường này là bắt buộc" placeholder="Nhập..." />
          <Input label="Với gợi ý" helpText="Tối đa 100 ký tự" placeholder="Nhập..." />
          <Select label="Vai trò" options={[
            { value: '', label: 'Chọn vai trò...' },
            { value: 'coord', label: 'Project Coordinator' },
            { value: 'dev', label: 'Developer' },
          ]} />
          <Textarea label="Mô tả" placeholder="Nhập mô tả..." rows={3} />
          <Checkbox label="Nhớ thông tin đăng nhập" />
          <Radio label="Tuỳ chọn A" name="demo" />
          <Radio label="Tuỳ chọn B" name="demo" />
          <Switch label="Bật thông báo" checked={sw} onChange={setSw} />
        </div>
      </Section>

      <Divider />

      {/* Cards */}
      <Section title="Card">
        <Card style={{ width: 240 }} hoverable>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>Card Title</h3>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Nội dung card. Hover để thấy shadow.</p>
        </Card>
        <Card style={{ width: 240 }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <Avatar name="Nguyễn Quang" size={40} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Nguyễn Quang</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Project Coordinator</div>
            </div>
          </div>
          <Badge variant="success">Đang hoạt động</Badge>
        </Card>
      </Section>

      <Divider />

      {/* Tabs */}
      <Section title="Tabs">
        <div style={{ width: '100%' }}>
          <Tabs tabs={[
            { key: 'all', label: 'Tất cả', content: <div style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Nội dung tab Tất cả.</div> },
            { key: 'active', label: 'Đang hoạt động', content: <div style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Nội dung tab Đang hoạt động.</div> },
            { key: 'done', label: 'Hoàn thành', content: <div style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Nội dung tab Hoàn thành.</div> },
          ]} />
        </div>
      </Section>

      <Divider />

      {/* Tooltip */}
      <Section title="Tooltip">
        <Tooltip content="Đây là tooltip phía trên">
          <Button variant="secondary" size="sm">Hover top</Button>
        </Tooltip>
        <Tooltip content="Tooltip phía phải" placement="right">
          <Button variant="secondary" size="sm">Hover right</Button>
        </Tooltip>
        <Tooltip content="Tooltip phía dưới" placement="bottom">
          <Button variant="secondary" size="sm">Hover bottom</Button>
        </Tooltip>
      </Section>

      <Divider />

      {/* Progress */}
      <Section title="Progress">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <ProgressBar value={72} showValue label="Tiến độ dự án" />
          <ProgressBar value={45} color="var(--color-warning)" showValue label="Tải việc nhóm" />
          <ProgressBar value={90} color="var(--color-success)" showValue label="Hoàn thành sprint" />
          <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
            <CircularProgress value={72} size={56} label="72%" />
            <CircularProgress value={45} size={56} color="var(--color-warning)" label="45%" />
            <CircularProgress value={90} size={56} color="var(--color-success)" label="90%" />
          </div>
        </div>
      </Section>

      <Divider />

      {/* Skeleton */}
      <Section title="Skeleton & Loading">
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Skeleton height={24} width={160} borderRadius="var(--radius-md)" />
          <SkeletonText lines={3} />
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <Skeleton width={40} height={40} borderRadius="50%" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Skeleton height={14} width="70%" />
              <Skeleton height={11} width="45%" />
            </div>
          </div>
        </div>
        <LoadingSpinner size={36} label="Đang tải..." />
      </Section>

      <Divider />

      {/* Table */}
      <Section title="Data Table">
        <div style={{ width: '100%', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <TableToolbar title="Nhân sự">
            <Button variant="secondary" size="sm">Lọc</Button>
            <Button variant="primary" size="sm">+ Thêm</Button>
          </TableToolbar>
          <DataTable columns={DEMO_COLS} rows={DEMO_ROWS} />
        </div>
      </Section>

      <Divider />

      {/* Empty / Error */}
      <Section title="Empty & Error States">
        <div style={{ width: 320, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
          <EmptyState icon="○" title="Chưa có dữ liệu" description="Thêm đầu việc đầu tiên để bắt đầu." action={<Button variant="primary" size="sm">+ Tạo mới</Button>} />
        </div>
        <div style={{ width: 320, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
          <ErrorState title="Không tải được dữ liệu" description="Kiểm tra kết nối và thử lại." action={<Button variant="secondary" size="sm">Thử lại</Button>} />
        </div>
      </Section>

      <Divider />

      {/* Overlay */}
      <Section title="Overlay — Toast / Drawer / Modal">
        <Button variant="secondary" onClick={() => toast('Thao tác thành công!', 'success')}>Toast Success</Button>
        <Button variant="secondary" onClick={() => toast('Cảnh báo quan trọng.', 'warning')}>Toast Warning</Button>
        <Button variant="secondary" onClick={() => toast('Đã xảy ra lỗi.', 'error')}>Toast Error</Button>
        <Button variant="secondary" onClick={() => toast('Chức năng này sẽ được triển khai ở giai đoạn sau.', 'info')}>Toast Info</Button>
        <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Mở Drawer</Button>
        <Button variant="secondary" onClick={() => setModalOpen(true)}>Mở Modal</Button>
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>Confirm Dialog</Button>
        <Popover
          trigger={<Button variant="secondary">Popover</Button>}
          content={
            <div style={{ fontSize: 'var(--text-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>Popover content</div>
              <p style={{ color: 'var(--color-text-muted)' }}>Thông tin bổ sung hiển thị dưới dạng popover.</p>
            </div>
          }
        />
      </Section>

      {/* Pagination */}
      <Section title="Pagination">
        <Pagination page={page} totalPages={12} onChange={setPage} />
      </Section>

      {/* Overlays */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Drawer bên phải"
        footer={<><Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)}>Huỷ</Button><Button variant="primary" size="sm">Lưu</Button></>}
      >
        <SkeletonText lines={5} />
        <div style={{ marginTop: 'var(--space-6)' }}><SkeletonText lines={3} /></div>
      </Drawer>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Modal tiêu chuẩn"
        footer={<><Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Huỷ</Button><Button variant="primary" size="sm">Xác nhận</Button></>}
      >
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', lineHeight: 'var(--leading-normal)' }}>
          Đây là nội dung modal. Nhấn Escape hoặc click ngoài để đóng.
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => toast('Đã xác nhận hành động.', 'success')}
        title="Xác nhận hành động"
        message="Bạn có chắc chắn muốn thực hiện thao tác này không? Hành động sẽ không thể hoàn tác."
        confirmLabel="Xoá"
        danger
      />
    </div>
  )
}
