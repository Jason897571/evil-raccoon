import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { postJson, type CodeSent } from '../api'
import { useAuth } from '../auth'
import { SiteHeader } from '../components/SiteHeader'
import { useCooldown } from '../useCooldown'
import { safeNext } from './LoginPage'

/** 注册：邮箱收验证码 → 填验证码、设密码（昵称选填）→ 自动登录。 */
export function RegisterPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { ready, user, refresh } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState(params.get('email') ?? '')
  const [step, setStep] = useState<'email' | 'details'>('email')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [name, setName] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [cooldown, setCooldown] = useCooldown()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (ready && user) return <Navigate to={next} replace />

  const loginHref = `/login?${new URLSearchParams({ next })}`

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await postJson<CodeSent>('/api/auth/code', { email: email.trim(), purpose: 'register' })
      setStep('details')
      setDevCode(res.dev_code)
      setCooldown(res.resend_after)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const register = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('两次输入的密码不一样')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await postJson('/api/auth/register', {
        email: email.trim(), code, password, display_name: name.trim() || null,
      })
      await refresh()
      navigate(next, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const errorLine = error && (
    <p className="form-error" role="alert">
      {error}{error.includes('已经注册') && <> <Link className="inline-link" to={loginHref}>去登录</Link></>}
    </p>
  )

  return (
    <>
      <SiteHeader compact />
      <main className="container auth-wrap">
        <h1 className="section-title">注册</h1>
        <p className="muted" style={{ margin: '8px 0 32px' }}>
          已经有账号？<Link className="inline-link" to={loginHref}>直接登录</Link>
        </p>

        {step === 'email' ? (
          <form className="form" onSubmit={sendCode}>
            <label htmlFor="email">邮箱</label>
            <input
              id="email" type="email" autoComplete="email" required autoFocus placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>我们会往这个邮箱发一个验证码，确认邮箱是你的。</p>
            {errorLine}
            <button className="btn btn-primary" disabled={busy || !email.trim()}>{busy ? '发送中…' : '获取验证码'}</button>
          </form>
        ) : (
          <form className="form" onSubmit={register}>
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
            <label htmlFor="new-password">密码</label>
            <input
              id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
              placeholder="至少 8 位" value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <label htmlFor="confirm-password">再输一次密码</label>
            <input
              id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
            />
            <label htmlFor="display-name">昵称（选填）</label>
            <input
              id="display-name" maxLength={40} placeholder={email.split('@')[0]}
              value={name} onChange={(e) => setName(e.target.value)}
            />
            {errorLine}
            <button className="btn btn-primary" disabled={busy || code.length !== 6 || password.length < 8 || !confirm}>
              {busy ? '注册中…' : '注册并登录'}
            </button>
            <button type="button" className="text-btn" disabled={cooldown > 0 || busy} onClick={() => void sendCode()}>
              {cooldown > 0 ? `${cooldown} 秒后可重新获取` : '重新获取验证码'}
            </button>
          </form>
        )}
      </main>
    </>
  )
}
