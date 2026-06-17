import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { loginIdentifierToAuthEmail } from '@/lib/internal-auth'

type EmployeeRecord = {
  id: string
  email?: string | null
  auth_user_id?: string | null
}

type AuthUpdatePayload = {
  email?: string
  password?: string
  email_confirm?: boolean
}

type AuthUpdateResult = {
  error: { message?: string } | null
}

type AuthAdminClient = {
  auth: {
    admin: {
      updateUserById: (userId: string, payload: AuthUpdatePayload) => Promise<AuthUpdateResult>
    }
  }
}

async function updateAuthEmail(
  supabaseAdmin: AuthAdminClient,
  userId: string,
  email: string,
  password?: string
) {
  const payload: Record<string, unknown> = { email }
  if (password) payload.password = password

  const first = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ...payload,
    email_confirm: true,
  })
  if (!first.error) return first

  return supabaseAdmin.auth.admin.updateUserById(userId, payload)
}

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
  const employeeId = String(body.employeeId || '')
  const fullName = String(body.fullName || '').trim()
  const login = String(body.login || '').trim()
  const newPassword = String(body.newPassword || '')
  const role = String(body.role || 'employee')
  const position = String(body.position || '').trim()
  const departmentId = body.departmentId ? String(body.departmentId) : null

  if (!employeeId || !fullName) {
    return NextResponse.json({ error: 'Thiếu nhân sự hoặc họ tên' }, { status: 400 })
  }

  const { data: employee, error: empFetchError } = await supabaseAdmin
    .from('employees')
    .select('*')
    .eq('id', employeeId)
    .maybeSingle()

  if (empFetchError || !employee) {
    return NextResponse.json({ error: empFetchError?.message || 'Không tìm thấy nhân sự' }, { status: 404 })
  }

  const currentEmployee = employee as EmployeeRecord
  const authEmail = login ? loginIdentifierToAuthEmail(login) : ''
  if (login && !authEmail) {
    return NextResponse.json({ error: 'Tài khoản đăng nhập không hợp lệ' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    full_name: fullName,
    position: position || null,
    department_id: departmentId,
    role,
  }

  if (authEmail) {
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) {
      return NextResponse.json({ error: 'Không tra cứu được tài khoản Auth: ' + listError.message }, { status: 500 })
    }

    const users = listData.users || []
    const oldEmail = currentEmployee.email || ''
    const authUser =
      (currentEmployee.auth_user_id ? users.find((user) => user.id === currentEmployee.auth_user_id) : null) ||
      (oldEmail ? users.find((user) => user.email?.toLowerCase() === oldEmail.toLowerCase()) : null)

    if (authUser) {
      if (authUser.email?.toLowerCase() !== authEmail.toLowerCase() || newPassword) {
        const { error: authUpdateError } = await updateAuthEmail(
          supabaseAdmin,
          authUser.id,
          authEmail,
          newPassword || undefined
        )
        if (authUpdateError) {
          return NextResponse.json({ error: 'Không cập nhật được tài khoản Auth: ' + authUpdateError.message }, { status: 400 })
        }
      }
      patch.email = authEmail
      if ('auth_user_id' in currentEmployee) patch.auth_user_id = authUser.id
    } else {
      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json({
          error: 'Nhân sự này chưa có tài khoản đăng nhập. Nhập mật khẩu mới tối thiểu 6 ký tự để tạo tài khoản.',
        }, { status: 400 })
      }

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password: newPassword,
        email_confirm: true,
      })
      if (createError || !created.user?.id) {
        return NextResponse.json({ error: createError?.message || 'Không tạo được tài khoản Auth' }, { status: 400 })
      }

      patch.email = authEmail
      if ('auth_user_id' in currentEmployee) patch.auth_user_id = created.user.id
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('employees')
    .update(patch)
    .eq('id', employeeId)

  if (updateError) {
    return NextResponse.json({ error: 'Không lưu được hồ sơ nhân sự: ' + updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
