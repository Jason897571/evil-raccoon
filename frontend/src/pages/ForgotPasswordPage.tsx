import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { postJson, type CodeSent } from '../api'
import { useAuth } from '../auth'
import { SiteHeader } from '../components/SiteHeader'
import { useCooldown } from '../useCooldown'
import { safeNext } from './LoginPage'

/** 忘记密码：邮箱收验证码 → 设新密码 → 自动登录。登录页和个人设置都会链到这里。 */
export function ForgotPasswordPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { user, refresh } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState(params.get('email') ?? user?.email ?? '')
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [cooldown, setCooldown] = useCooldown()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await postJson<CodeSent>('/api/auth/code', { email: email.trim(), purpose: 'reset' })
      setStep('reset')
      setDevCode(res.dev_code)
      setCooldown(res.resend_after)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const reset = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('两次输入的新密码不一样')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await postJson('/api/auth/password-reset', { email: email.trim(), code, new_password: password })
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
        <h1 className="section-title">重设密码</h1>
        <p className="muted" style={{ margin: '8px 0 32px' }}>
          给你的邮箱发一个验证码，验证通过后设新密码。重设后其他设备上的登录会失效。
        </p>

        {step === 'email' ? (
          <form className="form" onSubmit={sendCode}>
            <label htmlFor="email">邮箱</label>
            <input
              id="email" type="email" autoComplete="email" required autoFocus placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} disabled={Boolean(user)}
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary" disabled={busy || !email.trim()}>{busy ? '发送中…' : '获取验证码'}</button>
          </form>
        ) : (
          <form className="form" onSubmit={reset}>
            <p className="muted" style={{ margin: 0 }}>
              验证码已发到 <b style={{ color: 'var(--text)' }}>{email}</b>，10 分钟内有效。
              {!user && (
                <button type="button" className="text-btn" onClick={() => { setStep('email'); setCode(''); setError(null) }}>换个邮箱</button>
              )}
            </p>
            {devCode && <p className="dev-hint">开发模式没配发信邮箱，验证码是 <b>{devCode}</b></p>}
            <label htmlFor="code">验证码</label>
            <input
              id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
              placeholder="6 位数字" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <label htmlFor="new-password">新密码</label>
            <input
              id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
              placeholder="至少 8 位" value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <label htmlFor="confirm-password">再输一次</label>
            <input
              id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary" disabled={busy || code.length !== 6 || password.length < 8 || !confirm}>
              {busy ? '提交中…' : '重设密码并登录'}
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
