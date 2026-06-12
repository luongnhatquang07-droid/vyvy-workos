import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server chưa cấu hình SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { authUserId, email, newPassword } = await req.json()

  if ((!authUserId && !email) || !newPassword) {
    return NextResponse.json({ error: 'Thiếu thông tin người dùng hoặc mật khẩu' }, { status: 400 })
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'Mật khẩu phải ít nhất 6 ký tự' }, { status: 400 })
  }

  // If only email provided, find the auth user ID first
  let targetUserId = authUserId
  if (!targetUserId && email) {
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) {
      return NextResponse.json({ error: 'Không thể tra cứu người dùng: ' + listError.message }, { status: 500 })
    }
    const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (!found) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản với email này' }, { status: 404 })
    }
    targetUserId = found.id
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
    password: newPassword,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
