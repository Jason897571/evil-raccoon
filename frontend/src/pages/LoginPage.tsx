import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { postJson, type CodeSent } from '../api'
import { useAuth } from '../auth'
import { SiteHeader } from '../components/SiteHeader'

/** 只允许站内跳转，防止 ?next= 被拿来跳到外站。 */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

export function LoginPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { ready, user, refresh } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  if (ready && user) return <Navigate to={next} replace />

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

  const login = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await postJson('/api/auth/login', { email: email.trim(), code: code.trim() })
      await refresh()
      navigate(next, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <SiteHeader compact />
      <main className="container auth-wrap">
        <h1 className="section-title">登录 / 注册</h1>
        <p className="muted" style={{ margin: '8px 0 32px' }}>输入邮箱，收到验证码就能登录。第一次登录会自动注册。</p>

        {step === 'email' ? (
          <form className="form" onSubmit={sendCode}>
            <label htmlFor="email">邮箱</label>
            <input
              id="email" type="email" autoComplete="email" required autoFocus placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary" disabled={busy || !email.trim()}>{busy ? '发送中…' : '获取验证码'}</button>
          </form>
        ) : (
          <form className="form" onSubmit={login}>
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
