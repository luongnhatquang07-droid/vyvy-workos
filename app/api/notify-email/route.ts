import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

// Graceful no-op khi chưa cấu hình RESEND_API_KEY
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM = 'VyVy WorkOS <workos@vyvystore.vn>'

export type NotifyEmailPayload = {
  type:
    | 'task_assigned'       // được giao việc mới
    | 'step_submitted'      // bước được nộp (notify approver)
    | 'step_approved'       // bước được duyệt (notify owner)
    | 'step_revision'       // bước bị trả lại (notify owner)
    | 'task_approved'       // phân công được cấp trên duyệt
    | 'task_rejected'       // phân công bị trả lại
  to: string               // email người nhận
  toName: string
  taskTitle: string
  projectName?: string
  stepTitle?: string
  actorName?: string       // người thực hiện hành động
  revisionNote?: string    // lý do trả lại
  appUrl?: string
}

function buildHtml(payload: NotifyEmailPayload): { subject: string; html: string } {
  const url = payload.appUrl || 'https://vyvy-workos.vercel.app'
  const ivory = '#F1EDE4'
  const olive = '#2D331A'
  const lime = '#DADF21'
  const wrap = (content: string) => `
    <div style="background:${ivory};font-family:'Helvetica Neue',Arial,sans-serif;padding:32px 0;min-height:100vh">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e0d9cb">
        <div style="background:${olive};padding:20px 28px;display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;background:${ivory};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;color:${olive};font-size:16px">V</div>
          <div>
            <div style="color:${ivory};font-weight:800;font-size:14px;letter-spacing:0.04em">VyVy WorkOS</div>
            <div style="color:rgba(241,237,228,0.5);font-size:10px">The Haute Couture of Care</div>
          </div>
        </div>
        <div style="padding:28px">${content}</div>
        <div style="padding:16px 28px;border-top:1px solid #e0d9cb;text-align:center">
          <a href="${url}" style="display:inline-block;background:${lime};color:${olive};font-weight:800;font-size:13px;padding:10px 24px;border-radius:10px;text-decoration:none">Mở VyVy WorkOS →</a>
        </div>
        <div style="padding:12px 28px;text-align:center;font-size:11px;color:#a09890">
          Đây là thông báo tự động từ VyVy WorkOS. Vui lòng không reply email này.
        </div>
      </div>
    </div>`

  const hi = `<p style="color:#5c564a;font-size:14px;margin:0 0 16px">Xin chào <b style="color:#2D331A">${payload.toName}</b>,</p>`
  const taskBlock = `<div style="background:#F1EDE4;border-radius:10px;padding:14px 16px;margin:16px 0">
    <div style="font-size:11px;font-weight:800;color:#a09890;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">${payload.projectName ? payload.projectName + ' /' : ''} Đầu việc</div>
    <div style="font-size:15px;font-weight:700;color:#2D331A">${payload.taskTitle}</div>
    ${payload.stepTitle ? `<div style="margin-top:6px;font-size:12px;color:#5c564a">📋 Bước: <b>${payload.stepTitle}</b></div>` : ''}
  </div>`

  switch (payload.type) {
    case 'task_assigned':
      return {
        subject: `[WorkOS] Bạn được giao việc: ${payload.taskTitle}`,
        html: wrap(`${hi}
          <p style="color:#2D331A;font-size:16px;font-weight:800;margin:0 0 8px">📌 Bạn có việc mới được giao</p>
          ${payload.actorName ? `<p style="color:#5c564a;font-size:13px;margin:0 0 4px">Người giao: <b>${payload.actorName}</b></p>` : ''}
          ${taskBlock}
          <p style="color:#5c564a;font-size:13px">Vào WorkOS để xem chi tiết và bắt đầu thực hiện.</p>`),
      }
    case 'step_submitted':
      return {
        subject: `[WorkOS] Bước chờ duyệt: ${payload.stepTitle || payload.taskTitle}`,
        html: wrap(`${hi}
          <p style="color:#2D331A;font-size:16px;font-weight:800;margin:0 0 8px">⏳ Có bước đang chờ bạn duyệt</p>
          ${payload.actorName ? `<p style="color:#5c564a;font-size:13px;margin:0 0 4px">Người nộp: <b>${payload.actorName}</b></p>` : ''}
          ${taskBlock}
          <p style="color:#5c564a;font-size:13px">Vào WorkOS để xem kết quả và duyệt bước.</p>`),
      }
    case 'step_approved':
      return {
        subject: `[WorkOS] Bước được duyệt ✓: ${payload.stepTitle || payload.taskTitle}`,
        html: wrap(`${hi}
          <p style="color:#16a34a;font-size:16px;font-weight:800;margin:0 0 8px">✅ Bước của bạn đã được duyệt</p>
          ${payload.actorName ? `<p style="color:#5c564a;font-size:13px;margin:0 0 4px">Người duyệt: <b>${payload.actorName}</b></p>` : ''}
          ${taskBlock}`),
      }
    case 'step_revision':
      return {
        subject: `[WorkOS] Bước cần làm lại: ${payload.stepTitle || payload.taskTitle}`,
        html: wrap(`${hi}
          <p style="color:#dc2626;font-size:16px;font-weight:800;margin:0 0 8px">🔴 Bước bị trả lại — cần làm lại</p>
          ${payload.actorName ? `<p style="color:#5c564a;font-size:13px;margin:0 0 4px">Người trả lại: <b>${payload.actorName}</b></p>` : ''}
          ${taskBlock}
          ${payload.revisionNote ? `<div style="background:#fef2f2;border-left:3px solid #dc2626;padding:10px 14px;border-radius:0 8px 8px 0;margin:8px 0"><div style="font-size:11px;font-weight:800;color:#dc2626;margin-bottom:4px">GHI CHÚ TỪ NGƯỜI DUYỆT</div><div style="font-size:13px;color:#2D331A">${payload.revisionNote}</div></div>` : ''}
          <p style="color:#5c564a;font-size:13px">Vào WorkOS để xem chi tiết và nộp lại bước.</p>`),
      }
    case 'task_approved':
      return {
        subject: `[WorkOS] Phân công được duyệt: ${payload.taskTitle}`,
        html: wrap(`${hi}
          <p style="color:#2D331A;font-size:16px;font-weight:800;margin:0 0 8px">✅ Phân công của bạn đã được duyệt</p>
          ${taskBlock}
          <p style="color:#5c564a;font-size:13px">Vào WorkOS để bắt đầu thực hiện đầu việc.</p>`),
      }
    case 'task_rejected':
      return {
        subject: `[WorkOS] Phân công bị trả lại: ${payload.taskTitle}`,
        html: wrap(`${hi}
          <p style="color:#dc2626;font-size:16px;font-weight:800;margin:0 0 8px">❌ Phân công bị trả lại</p>
          ${taskBlock}
          <p style="color:#5c564a;font-size:13px">Liên hệ cấp trên để biết thêm chi tiết.</p>`),
      }
    default:
      return { subject: '[WorkOS] Thông báo mới', html: wrap(`${hi}${taskBlock}`) }
  }
}

export async function POST(req: NextRequest) {
  if (!resend) {
    // Chưa cấu hình key — log warning nhưng không fail (tránh block flow chính)
    console.warn('[notify-email] RESEND_API_KEY chưa được cấu hình, bỏ qua gửi email')
    return NextResponse.json({ skipped: true })
  }

  const payload: NotifyEmailPayload = await req.json()

  if (!payload.to || !payload.type || !payload.taskTitle) {
    return NextResponse.json({ error: 'Thiếu trường bắt buộc: to, type, taskTitle' }, { status: 400 })
  }

  const { subject, html } = buildHtml(payload)

  const { error } = await resend.emails.send({ from: FROM, to: payload.to, subject, html })

  if (error) {
    console.error('[notify-email] Resend error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
