// ─── VyVy WorkOS — App Config ────────────────────────────────────────────────
// Solo Pilot Mode: một mình Quang/Admin test toàn bộ hệ thống trước khi
// mở cho công ty. Tắt = false để quay lại phân quyền multi-user bình thường.
// ĐỂ TẮT: đổi dòng dưới thành `export const SOLO_PILOT_MODE = false`
// ─────────────────────────────────────────────────────────────────────────────

export const SOLO_PILOT_MODE = true

// ─── Solo Pilot Login ─────────────────────────────────────────────────────────
// Login ID của Quang/Admin (không cần @domain, app tự ghép vyvy-workos.local)
export const SOLO_PILOT_LOGIN_ID = 'luongnhatquang07'

// Mật khẩu đọc từ .env.local (NEXT_PUBLIC_SOLO_PILOT_PASSWORD).
// KHÔNG hard-code ở đây — giữ trong .env.local, không commit lên git.
// Trước khi production: xóa biến env + set SOLO_PILOT_MODE = false
export const SOLO_PILOT_PASSWORD =
  typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_SOLO_PILOT_PASSWORD ?? '')
    : ''

// ─── Ghi chú an toàn ─────────────────────────────────────────────────────────
// Khi SOLO_PILOT_MODE = true:
// • Login page hiện nút "Vào bằng luongnhatquang07 — Solo Pilot"
// • Topbar hiện badge "Solo Pilot"
// • DeadlineBlock cho phép admin tự test cả 2 vai: xin gia hạn + duyệt
// • Notex/Excel import có nút "Gán tất cả item thiếu owner về Quang/Admin"
//
// Khi SOLO_PILOT_MODE = false:
// • Nút Solo Pilot biến mất — chỉ login thật
// • Owner KHÔNG tự duyệt yêu cầu gia hạn của chính mình
// • Phân quyền multi-user hoàn toàn bình thường
// • Badge biến mất
