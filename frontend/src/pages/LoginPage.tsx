import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { postJson, type CodeSent } from '../api'
import { useAuth } from '../auth'
import { SiteHeader } from '../components/SiteHeader'
import { useCooldown } from '../useCooldown'

/** 只允许站内跳转，防止 ?next= 被拿来跳到外站。 */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

type Mode = 'code' | 'password'

export function LoginPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { ready, user, refresh } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('code')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [cooldown, setCooldown] = useCooldown()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (ready && user) return <Navigate to={next} replace />

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
  }

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await postJson<CodeSent>('/api/auth/code', { email: email.trim() })
      setStep('code')
      setDevCode(res.dev_code)
      setCooldown(res.resend_after)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submit = (path: string, body: object) => async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await postJson(path, body)
      await refresh()
      navigate(next, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const forgotHref = `/forgot-password?${new URLSearchParams({ ...(email.trim() && { email: email.trim() }), next })}`

  const emailInput = (
    <>
      <label htmlFor="email">邮箱</label>
      <input
        id="email" type="email" autoComplete="email" required autoFocus placeholder="you@example.com"
        value={email} onChange={(e) => setEmail(e.target.value)}
      />
    </>
  )

  return (
    <>
      <SiteHeader compact />
      <main className="container auth-wrap">
        <h1 className="section-title">登录 / 注册</h1>
        <p className="muted" style={{ margin: '8px 0 24px' }}>
          {mode === 'code'
            ? '输入邮箱，收到验证码就能登录。第一次登录会自动注册。'
            : '在「个人设置」里设过密码的账号，可以直接用密码登录。'}
        </p>

        <div className="tabs auth-tabs" role="tablist" aria-label="登录方式">
          <button type="button" role="tab" className="tab" aria-selected={mode === 'code'} onClick={() => switchMode('code')}>
            验证码登录
          </button>
          <button type="button" role="tab" className="tab" aria-selected={mode === 'password'} onClick={() => switchMode('password')}>
            密码登录
          </button>
        </div>

        {mode === 'password' ? (
          <form className="form" onSubmit={submit('/api/auth/password-login', { email: email.trim(), password })}>
            {emailInput}
            <div className="form-row">
              <label htmlFor="password">密码</label>
              <Link className="text-link" to={forgotHref}>忘记密码？</Link>
            </div>
            <input
              id="password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary" disabled={busy || !email.trim() || !password}>{busy ? '登录中…' : '登录'}</button>
          </form>
        ) : step === 'email' ? (
          <form className="form" onSubmit={sendCode}>
            {emailInput}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary" disabled={busy || !email.trim()}>{busy ? '发送中…' : '获取验证码'}</button>
          </form>
        ) : (
          <form className="form" onSubmit={submit('/api/auth/login', { email: email.trim(), code: code.trim() })}>
            <p className="muted" style={{ margin: 0 }}>
              验证码已发到 <b style={{ color: 'var(--text)' }}>{email}</b>，10 分钟内有效。
              <button type="button" className="text-btn" onClick={() => { setStep('email'); setCode(''); setError(null) }}>换个邮箱</button>
            </p>
            {devCode && <p className="dev-hint">开发模式没配发信邮箱，验证码是 <b>{devCode}</b></p>}
            <label htmlFor="code">验证码</label>
            <input
              id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
              placeholder="6 位数字" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? '登录中…' : '登录'}</button>
            <button type="button" className="text-btn" disabled={cooldown > 0 || busy} onClick={() => void sendCode()}>
              {cooldown > 0 ? `${cooldown} 秒后可重新获取` : '重新获取验证码'}
            </button>
          </form>
        )}
      </main>
    </>
  )
}
