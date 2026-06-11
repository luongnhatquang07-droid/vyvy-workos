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

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4F6F9] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0F172A] text-2xl font-extrabold text-white">
            V
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-[#0F172A]">VyVy WorkOS</h1>
            <p className="mt-1 text-sm text-[#64748B]">COO Operating System · VyVyHaircare</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
          <div className="flex border-b border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => { setTab('login'); setError(''); setSuccess('') }}
              className={`flex-1 py-3.5 text-sm font-extrabold transition-colors ${
                tab === 'login'
                  ? 'border-b-2 border-[#1B4FD8] text-[#1B4FD8]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => { setTab('signup'); setError(''); setSuccess('') }}
              className={`flex-1 py-3.5 text-sm font-extrabold transition-colors ${
                tab === 'signup'
                  ? 'border-b-2 border-[#1B4FD8] text-[#1B4FD8]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Tạo tài khoản
            </button>
          </div>

          <div className="p-8">
            {tab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-[#0F172A]">Email</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-sm outline-none focus:border-[#1B4FD8] focus:bg-white"
                    placeholder="email@vyvyhaircare.com"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-[#0F172A]">Mật khẩu</label>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-sm outline-none focus:border-[#1B4FD8] focus:bg-white"
                    placeholder="••••••••"
                  />
                </div>
                {error && (
                  <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
                )}
                {success && (
                  <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{success}</div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full rounded-xl bg-[#1B4FD8] text-sm font-extrabold text-white disabled:opacity-60"
                >
                  {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                  Dùng để tạo tài khoản Admin đầu tiên. Sau khi setup xong, Admin sẽ cấp tài khoản cho nhân viên.
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-[#0F172A]">Họ và tên</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-sm outline-none focus:border-[#1B4FD8] focus:bg-white"
                    placeholder="Nguyễn Văn A"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-[#0F172A]">Email</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-sm outline-none focus:border-[#1B4FD8] focus:bg-white"
                    placeholder="email@vyvyhaircare.com"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-[#0F172A]">Mật khẩu</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-sm outline-none focus:border-[#1B4FD8] focus:bg-white"
                    placeholder="Tối thiểu 6 ký tự"
                  />
                </div>
                {error && (
                  <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full rounded-xl bg-[#0F172A] text-sm font-extrabold text-white disabled:opacity-60"
                >
                  {loading ? 'Đang tạo...' : 'Tạo tài khoản Admin'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
