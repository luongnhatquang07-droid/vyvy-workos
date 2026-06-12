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

  const body = await req.json()
  const { email, password, fullName, role, departmentId, position } = body

  if (!email || !password || !fullName) {
    return NextResponse.json({ error: 'Thiếu email, password hoặc họ tên' }, { status: 400 })
  }

  // Tạo auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const userId = authData.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Không lấy được user ID' }, { status: 500 })
  }

  // Kiểm tra bảng có cột auth_user_id không
  const { data: colCheck } = await supabaseAdmin
    .from('employees')
    .select('auth_user_id')
    .limit(1)

  const hasAuthUserId = colCheck !== null

  // Build insert record dựa trên schema thực tế
  const record: Record<string, unknown> = {
    full_name: fullName,
    email: email,
    role: role || 'employee',
    status: 'active',
    position: position || null,
    department_id: departmentId || null,
  }

  if (hasAuthUserId) {
    record.auth_user_id = userId
  }

  const { error: empError } = await supabaseAdmin.from('employees').insert(record)

  if (empError) {
    // Xóa auth user nếu không tạo được employee
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Lỗi tạo hồ sơ nhân viên: ' + empError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
