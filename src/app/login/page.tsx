'use client'

import React, { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? 'unknown'
const SUPABASE_REF = getSupabaseRef(process.env.NEXT_PUBLIC_SUPABASE_URL)
const USERNAME_DOMAIN = 'vyvystore.vn'

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') ?? '/command-center'

  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  function toEmail(input: string): string {
    const normalized = input.trim().normalize('NFKC').toLowerCase()
    return normalized.includes('@') ? normalized : `${normalized}@${USERNAME_DOMAIN}`
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)

    const sb = createClient()
    const { error: authError } = await sb.auth.signInWithPassword({
      email: toEmail(username),
      password,
    })

    setLoading(false)

    if (authError) {
      setError(await resolveLoginErrorMessage(username, authError.message))
      return
    }

    router.push(nextPath)
    router.refresh()
  }

  return (
    <LoginShell>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>
            Tên đăng nhập
          </label>
          <input
            type="text"
            required
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="justinbiemap"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>
            Mật khẩu
          </label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            style={inputStyle}
          />
        </div>

        <div style={envInfoStyle}>
          Env: {APP_ENV} · Ref: {SUPABASE_REF}
        </div>

        {error && (
          <div style={{
            fontSize: 13,
            color: 'var(--color-danger)',
            background: 'rgba(184,64,64,0.08)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px',
            border: '1px solid rgba(184,64,64,0.2)',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 4,
            padding: '10px 0',
            fontSize: 14,
            fontWeight: 600,
            background: loading ? 'var(--color-border)' : 'var(--color-charcoal)',
            color: loading ? 'var(--color-text-muted)' : '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </LoginShell>
  )
}

async function resolveLoginErrorMessage(username: string, authMessage: string) {
  const genericMessage =
    authMessage === 'Invalid login credentials'
      ? 'Tên đăng nhập hoặc mật khẩu không đúng.'
      : authMessage

  if (APP_ENV === 'production') return genericMessage

  try {
    const response = await fetch('/api/auth/login-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username }),
    })
    const data = (await response.json()) as {
      detailAllowed?: boolean
      accountExists?: boolean | null
      env?: string
    }

    if (data.detailAllowed && data.accountExists === false) {
      const env = data.env ?? APP_ENV
      return `Không tìm thấy tài khoản trên môi trường ${env}. Kiểm tra tên đăng nhập hoặc dùng tài khoản ${env}.`
    }
  } catch {
    // Diagnostics are best-effort only; keep login failure safe and stable.
  }

  return genericMessage
}

function getSupabaseRef(url?: string) {
  const match = url?.match(/^https:\/\/([^.]+)\.supabase\.co/)
  return match?.[1] ?? 'unknown'
}

function LoginShell({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)',
        padding: '40px 36px',
        width: '100%',
        maxWidth: 400,
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--color-charcoal)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-lime)',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: 'var(--font-serif)',
          }}>
            v
          </div>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500, color: 'var(--color-text)' }}>
            VyVy WorkOS
          </span>
        </div>

        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500, margin: '0 0 6px', color: 'var(--color-text)' }}>
          Đăng nhập
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 24px' }}>
          Truy cập hệ thống điều hành VyVy.
        </p>

        {children}

        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>
          Liên hệ Quang để được cấp tài khoản.
        </p>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 12px',
  fontSize: 14,
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  outline: 'none',
  fontFamily: 'inherit',
}

const envInfoStyle: React.CSSProperties = {
  marginTop: -4,
  fontSize: 12,
  lineHeight: 1.4,
  color: 'var(--color-text-muted)',
}
