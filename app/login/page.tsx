'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loginIdentifierToAuthEmail } from '@/lib/internal-auth'

type Tab = 'login' | 'signup'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('login')
  const [loginId, setLoginId] = useState('')
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
    const authEmail = loginIdentifierToAuthEmail(loginId)
    const { error: authError } = await supabase.auth.signInWithPassword({ email: authEmail, password })
    setLoading(false)
    if (authError) {
      setError('Tài khoản hoặc mật khẩu không đúng. Vui lòng thử lại.')
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
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginId, password, fullName: fullName.trim(), role: 'admin', position: 'Admin' }),
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      setLoading(false)
      setError(json.error || 'Tạo tài khoản thất bại.')
      return
    }
    const authEmail = loginIdentifierToAuthEmail(loginId)
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password })
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
    const authEmail = loginIdentifierToAuthEmail(loginId)
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password })
    if (signInErr || !signInData.session) {
      setError('Tài khoản hoặc mật khẩu không đúng.')
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
      setError('Không tìm thấy hồ sơ nhân viên. Hãy nhờ Admin thêm tài khoản của bạn vào hệ thống.')
    }
  }

  const inputCls = `w-full h-12 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors`

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg-base)] px-4">
      {/* Glow blobs */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[var(--accent)]/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-80 w-80 rounded-full bg-[var(--info)]/5 blur-3xl" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] font-display text-2xl text-[var(--on-accent)] shadow-[0_4px_20px_-6px_rgba(218,223,33,0.5)]">
            V
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl text-[var(--text-primary)]">VyVy WorkOS</h1>
            <p className="font-spec mt-2 text-[10px] text-[var(--text-muted)]">The Haute Couture of Care</p>
            <p className="font-serif-brand mt-2 text-sm italic text-[var(--text-muted)]">Không có từ nào đẹp hơn sự thật.</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8)]">
          {/* Tabs */}
          <div className="flex border-b border-[var(--border)]">
            {(['login', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setError(''); setSuccess('') }}
                className={`flex-1 py-3.5 text-sm font-bold transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {t === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </button>
            ))}
          </div>

          <div className="p-8">
            {tab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Tài khoản</label>
                  <input type="text" required autoComplete="username" value={loginId}
                    onChange={(e) => setLoginId(e.target.value)} className={inputCls} placeholder="quang / nhung / admin" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Mật khẩu</label>
                  <input type="password" required autoComplete="current-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
                </div>

                {error && (
                  <div className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-[var(--radius)] border border-[var(--success)]/30 bg-[var(--success-soft)] px-4 py-3 text-sm font-semibold text-[var(--success)]">
                    {success}
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="btn-accent h-12 w-full rounded-[var(--radius)] text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Đang đăng nhập...
                    </>
                  ) : 'Đăng nhập →'}
                </button>

                {errorParam === 'no_employee' && (
                  <button type="button" disabled={loading || !loginId || !password} onClick={handleFixAdmin}
                    className="h-10 w-full rounded-[var(--radius)] border border-[var(--border-strong)] bg-transparent text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 transition-colors">
                    Khôi phục quyền Admin
                  </button>
                )}

                <p className="text-center text-xs text-[var(--text-muted)]">
                  Quên mật khẩu? Liên hệ Admin.
                </p>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="rounded-[var(--radius)] border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-4 py-3 text-xs font-semibold text-[var(--accent)]">
                  Dùng để tạo tài khoản Admin đầu tiên. Sau khi setup xong, Admin sẽ cấp tài khoản cho nhân viên.
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Họ và tên</label>
                  <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                    className={inputCls} placeholder="Nguyễn Văn A" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Tài khoản đăng nhập</label>
                  <input type="text" required value={loginId} onChange={(e) => setLoginId(e.target.value)}
                    className={inputCls} placeholder="quang / nhung / admin" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Mật khẩu</label>
                  <input type="password" required minLength={6} autoComplete="new-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="Tối thiểu 6 ký tự" />
                </div>
                {error && (
                  <div className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error}</div>
                )}
                <button type="submit" disabled={loading}
                  className="btn-accent h-12 w-full rounded-[var(--radius)] text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Đang tạo...
                    </>
                  ) : 'Tạo tài khoản Admin →'}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
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
