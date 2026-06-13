'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Tab = 'login' | 'signup'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const errorParam = searchParams.get('error')

  useEffect(() => {
    if (errorParam === 'no_employee') {
      setError('Tài khoản này chưa được thêm vào danh sách nhân viên. Liên hệ Admin để được cấp quyền.')
    } else if (errorParam === 'inactive') {
      setError('Tài khoản đã bị vô hiệu hoá. Liên hệ Admin.')
    }
  }, [errorParam])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) {
      setError('Email hoặc mật khẩu không đúng. Vui lòng thử lại.')
      return
    }
    router.push('/')
    router.refresh()
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    // Use server route so email_confirm: true is set — no confirmation email needed
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName: fullName.trim(), role: 'admin', position: 'Admin' }),
    })
    const json = await res.json()

    if (!res.ok || json.error) {
      setLoading(false)
      setError(json.error || 'Tạo tài khoản thất bại.')
      return
    }

    // Auto sign in after creation
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInErr) {
      setSuccess('Đã tạo tài khoản! Đăng nhập ngay.')
      setTab('login')
      return
    }
    router.push('/')
    router.refresh()
  }

  async function handleFixAdmin() {
    setLoading(true)
    setError('')
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr || !signInData.session) {
      setError('Email hoặc mật khẩu không đúng.')
      setLoading(false)
      return
    }
    const res = await fetch('/api/fix-admin', {
      method: 'POST',
      headers: { Authorization: `Bearer ${signInData.session.access_token}` },
    })
    const json = await res.json()
    setLoading(false)
    if (json.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError('Không tìm thấy hồ sơ nhân viên. Hãy nhờ Admin thêm email của bạn vào hệ thống.')
    }
  }

  const inputCls = "h-12 w-full rounded-xl border border-[#d9d3c5] bg-[#faf7f0] px-4 text-sm text-[#191919] outline-none focus:border-[#aeb300] focus:bg-white placeholder:text-[#b4ab99]"
  const labelCls = "mb-1.5 block text-sm font-bold text-[#191919]"

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f1ede4] px-4">
      <div className="pointer-events-none absolute -top-20 -left-20 h-80 w-80 rounded-full bg-[#dadf21]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-[#191919]/5 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#191919] font-display text-2xl text-[#f1ede4] shadow-xl shadow-[#191919]/25">
            V
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl text-[#191919]">VyVy WorkOS</h1>
            <p className="font-spec mt-2 text-[10px] text-[#6f6b5e]">The Haute Couture of Care</p>
            <p className="font-serif-brand mt-2 text-base italic text-[#6f6b5e]">Không có từ nào đẹp hơn sự thật.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#d9d3c5] bg-white shadow-[0_4px_32px_-8px_rgba(38,34,25,0.12)]">
          <div className="flex border-b border-[#d9d3c5]">
            <button type="button" onClick={() => { setTab('login'); setError(''); setSuccess('') }}
              className={`flex-1 py-3.5 text-sm font-extrabold transition-colors ${tab === 'login' ? 'border-b-2 border-[#191919] text-[#191919]' : 'text-[#6f6b5e] hover:text-[#191919]'}`}>
              Đăng nhập
            </button>
            <button type="button" onClick={() => { setTab('signup'); setError(''); setSuccess('') }}
              className={`flex-1 py-3.5 text-sm font-extrabold transition-colors ${tab === 'signup' ? 'border-b-2 border-[#191919] text-[#191919]' : 'text-[#6f6b5e] hover:text-[#191919]'}`}>
              Tạo tài khoản
            </button>
          </div>

          <div className="p-8">
            {tab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" required autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="email@vyvyhaircare.com" />
                </div>
                <div>
                  <label className={labelCls}>Mật khẩu</label>
                  <input type="password" required autoComplete="current-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
                </div>
                {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
                {success && <div className="rounded-xl border border-[#d9d3c5] bg-[#f6f9d4] px-4 py-3 text-sm font-bold text-[#6f7400]">{success}</div>}
                <button type="submit" disabled={loading}
                  className="h-12 w-full rounded-xl bg-[#191919] text-sm font-extrabold text-[#dadf21] shadow-md shadow-[#191919]/20 hover:bg-[#1d1c18] disabled:opacity-50">
                  {loading ? 'Đang đăng nhập...' : 'Đăng nhập →'}
                </button>
                {errorParam === 'no_employee' && (
                  <button type="button" disabled={loading || !email || !password} onClick={handleFixAdmin}
                    className="h-10 w-full rounded-xl border border-[#191919] bg-transparent text-xs font-bold text-[#191919] hover:bg-[#191919]/5 disabled:opacity-40">
                    Khôi phục quyền Admin
                  </button>
                )}
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="rounded-xl border border-[#d9d3c5] bg-[#faf7f0] px-4 py-3 text-xs font-bold text-[#6f6b5e]">
                  Dùng để tạo tài khoản Admin đầu tiên. Sau khi setup xong, Admin sẽ cấp tài khoản cho nhân viên.
                </div>
                <div>
                  <label className={labelCls}>Họ và tên</label>
                  <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                    className={inputCls} placeholder="Nguyễn Văn A" />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" required autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="email@vyvyhaircare.com" />
                </div>
                <div>
                  <label className={labelCls}>Mật khẩu</label>
                  <input type="password" required minLength={6} autoComplete="new-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="Tối thiểu 6 ký tự" />
                </div>
                {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
                <button type="submit" disabled={loading}
                  className="h-12 w-full rounded-xl bg-[#191919] text-sm font-extrabold text-[#dadf21] shadow-md shadow-[#191919]/20 hover:bg-[#1d1c18] disabled:opacity-50">
                  {loading ? 'Đang tạo...' : 'Tạo tài khoản Admin →'}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#b4ab99]">
          © {new Date().getFullYear()} VyVyHaircare · Internal Operations Platform
        </p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
