'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Tab = 'login' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

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

    const { data, error: signupError } = await supabase.auth.signUp({ email, password })

    if (signupError) {
      setLoading(false)
      setError(signupError.message)
      return
    }

    const userId = data.user?.id
    if (userId && fullName.trim()) {
      await supabase.from('employees').insert({
        full_name: fullName.trim(),
        auth_user_id: userId,
        role: 'admin',
        status: 'active',
        position: 'Admin',
      })
    }

    setLoading(false)

    if (data.session) {
      router.push('/')
      router.refresh()
    } else {
      setSuccess('Đã tạo tài khoản! Kiểm tra email để xác nhận rồi đăng nhập lại.')
      setTab('login')
    }
  }

  const inputCls = "h-12 w-full rounded-xl border border-[#e0d9cb] bg-[#faf7f0] px-4 text-sm text-[#262219] outline-none focus:border-[#aeb300] focus:bg-white placeholder:text-[#b4ab99]"
  const labelCls = "mb-1.5 block text-sm font-bold text-[#262219]"

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f1ede4] px-4">
      {/* Warm decorative blobs */}
      <div className="pointer-events-none absolute -top-20 -left-20 h-80 w-80 rounded-full bg-[#dadf21]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-[#262219]/5 blur-3xl" />

      <div className="relative w-full max-w-sm">
        {/* Logo + brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#262219] text-2xl font-extrabold text-[#dadf21] shadow-xl shadow-[#262219]/25">
            V
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold tracking-tight text-[#262219]">VyVy WorkOS</h1>
            <p className="mt-1 text-sm text-[#5c564a]">COO Operating System · VyVyHaircare</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#e0d9cb] bg-white shadow-[0_4px_32px_-8px_rgba(38,34,25,0.12)]">
          <div className="flex border-b border-[#e0d9cb]">
            <button
              type="button"
              onClick={() => { setTab('login'); setError(''); setSuccess('') }}
              className={`flex-1 py-3.5 text-sm font-extrabold transition-colors ${
                tab === 'login'
                  ? 'border-b-2 border-[#262219] text-[#262219]'
                  : 'text-[#5c564a] hover:text-[#262219]'
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => { setTab('signup'); setError(''); setSuccess('') }}
              className={`flex-1 py-3.5 text-sm font-extrabold transition-colors ${
                tab === 'signup'
                  ? 'border-b-2 border-[#262219] text-[#262219]'
                  : 'text-[#5c564a] hover:text-[#262219]'
              }`}
            >
              Tạo tài khoản
            </button>
          </div>

          <div className="p-8">
            {tab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" required autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    className={inputCls} placeholder="email@vyvyhaircare.com" />
                </div>
                <div>
                  <label className={labelCls}>Mật khẩu</label>
                  <input type="password" required autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className={inputCls} placeholder="••••••••" />
                </div>
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
                )}
                {success && (
                  <div className="rounded-xl border border-[#e0d9cb] bg-[#f6f9d4] px-4 py-3 text-sm font-bold text-[#6f7400]">{success}</div>
                )}
                <button type="submit" disabled={loading}
                  className="h-12 w-full rounded-xl bg-[#262219] text-sm font-extrabold text-[#dadf21] shadow-md shadow-[#262219]/20 hover:bg-[#1a1710] disabled:opacity-50"
                >
                  {loading ? 'Đang đăng nhập...' : 'Đăng nhập →'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="rounded-xl border border-[#e0d9cb] bg-[#faf7f0] px-4 py-3 text-xs font-bold text-[#5c564a]">
                  Dùng để tạo tài khoản Admin đầu tiên. Sau khi setup xong, Admin sẽ cấp tài khoản cho nhân viên.
                </div>
                <div>
                  <label className={labelCls}>Họ và tên</label>
                  <input type="text" required value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputCls} placeholder="Nguyễn Văn A" />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" required autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    className={inputCls} placeholder="email@vyvyhaircare.com" />
                </div>
                <div>
                  <label className={labelCls}>Mật khẩu</label>
                  <input type="password" required minLength={6} autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className={inputCls} placeholder="Tối thiểu 6 ký tự" />
                </div>
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
                )}
                <button type="submit" disabled={loading}
                  className="h-12 w-full rounded-xl bg-[#262219] text-sm font-extrabold text-[#dadf21] shadow-md shadow-[#262219]/20 hover:bg-[#1a1710] disabled:opacity-50"
                >
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
