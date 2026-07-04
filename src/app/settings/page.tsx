'use client'

import React from 'react'
import { PageHead } from '@/components/ui/PageHead'

export default function SettingsPage() {
  const [saved, setSaved] = React.useState(false)
  const [toggles, setToggles] = React.useState({
    followUp: true,
    overdue: true,
    approvals: true,
    meetings: true,
  })

  function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-settings"
        title="Cài đặt hệ thống"
        desc="Chỉnh workspace, nhịp nhắc việc và cấu hình thông báo cá nhân."
      />

      <form onSubmit={handleSave} style={formGrid}>
        <section style={cardStyle}>
          <SectionHead title="Workspace" sub="Thông tin nền tảng đang dùng chung" />
          <div style={fieldGrid}>
            <Field label="Tên workspace">
              <input defaultValue="VyVy WorkOS" style={inputStyle} />
            </Field>
            <Field label="Múi giờ">
              <select defaultValue="Asia/Ho_Chi_Minh" style={inputStyle}>
                <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh / Vietnam time (UTC+7)</option>
                <option value="UTC">UTC</option>
              </select>
            </Field>
            <Field label="Ngôn ngữ">
              <select defaultValue="vi" style={inputStyle}>
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>
        </section>

        <section style={cardStyle}>
          <SectionHead title="Tài khoản đang dùng" sub="Thông tin đăng nhập và quyền hiện tại" />
          <div style={fieldGrid}>
            <Field label="Tài khoản">
              <input defaultValue="luongnhatquang07" disabled style={disabledInput} />
            </Field>
            <Field label="Tên hiển thị">
              <input defaultValue="Quang" disabled style={disabledInput} />
            </Field>
            <Field label="Vai trò">
              <input defaultValue="Admin" disabled style={disabledInput} />
            </Field>
          </div>
        </section>

        <section style={cardStyle}>
          <SectionHead title="Thông báo" sub="Bật hoặc tắt những nhịp nhắc chính" />
          <div style={toggleList}>
            <ToggleRow
              label="Nhắc người chưa phản hồi"
              value={toggles.followUp}
              onChange={() => setToggles((prev) => ({ ...prev, followUp: !prev.followUp }))}
            />
            <ToggleRow
              label="Nhắc việc quá hạn"
              value={toggles.overdue}
              onChange={() => setToggles((prev) => ({ ...prev, overdue: !prev.overdue }))}
            />
            <ToggleRow
              label="Yêu cầu phê duyệt mới"
              value={toggles.approvals}
              onChange={() => setToggles((prev) => ({ ...prev, approvals: !prev.approvals }))}
            />
            <ToggleRow
              label="Nhắc trước giờ họp"
              value={toggles.meetings}
              onChange={() => setToggles((prev) => ({ ...prev, meetings: !prev.meetings }))}
            />
          </div>
        </section>

        <div style={actionRow}>
          <button type="submit" style={saveButton}>
            {saved ? 'Đã lưu' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </div>
  )
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={sectionHead}>
      <div style={sectionTitle}>{title}</div>
      <div style={sectionSub}>{sub}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  )
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: () => void
}) {
  return (
    <div style={toggleRow}>
      <span style={toggleLabel}>{label}</span>
      <button
        type="button"
        onClick={onChange}
        aria-pressed={value}
        style={toggleButton(value)}
      >
        <span style={toggleKnob(value)} />
      </button>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
  maxWidth: 920,
}

const formGrid: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-xl)',
  boxShadow: 'var(--shadow-sm)',
  padding: 20,
}

const sectionHead: React.CSSProperties = {
  marginBottom: 18,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const sectionSub: React.CSSProperties = {
  marginTop: 5,
  fontSize: 12,
  color: 'var(--color-text-muted)',
}

const fieldGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 16,
}

const fieldWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const fieldLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text)',
  fontSize: 13,
}

const disabledInput: React.CSSProperties = {
  ...inputStyle,
  opacity: 0.75,
}

const toggleList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const toggleRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 0',
  borderBottom: '1px solid var(--color-border)',
}

const toggleLabel: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--color-text)',
}

const toggleButton = (on: boolean): React.CSSProperties => ({
  width: 42,
  height: 24,
  borderRadius: 'var(--radius-full)',
  background: on ? 'var(--color-charcoal)' : 'var(--color-border-strong)',
  position: 'relative',
  border: 'none',
  padding: 0,
})

const toggleKnob = (on: boolean): React.CSSProperties => ({
  position: 'absolute',
  top: 3,
  left: on ? 21 : 3,
  width: 18,
  height: 18,
  borderRadius: 'var(--radius-full)',
  background: '#fff',
  transition: 'left 140ms ease',
})

const actionRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
}

const saveButton: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-charcoal)',
  color: 'var(--color-ivory)',
  fontSize: 13,
  fontWeight: 700,
}
