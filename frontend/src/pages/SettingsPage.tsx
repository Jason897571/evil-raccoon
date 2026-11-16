import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { formatTime, patchJson, postJson, putJson } from '../api'
import { useAuth } from '../auth'
import { SiteHeader } from '../components/SiteHeader'

type Msg = { ok: boolean; text: string } | null

export function SettingsPage() {
  const { user, refresh } = useAuth()
  const [name, setName] = useState(user?.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<Msg>(null)
  const [revoking, setRevoking] = useState(false)
  const [sessionMsg, setSessionMsg] = useState<Msg>(null)

  if (!user) return null // RequireAuth 保证已登录

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setProfileMsg(null)
    try {
      await patchJson('/api/auth/me', { display_name: name.trim() || null })
      await refresh()
      setProfileMsg({ ok: true, text: '已保存' })
    } catch (err) {
      setProfileMsg({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const logoutOthers = async () => {
    setRevoking(true)
    setSessionMsg(null)
    try {
      const { revoked } = await postJson<{ revoked: number }>('/api/auth/logout-others')
      setSessionMsg({ ok: true, text: revoked ? `已退出其他 ${revoked} 处登录` : '没有其他设备在登录' })
    } catch (err) {
      setSessionMsg({ ok: false, text: (err as Error).message })
    } finally {
      setRevoking(false)
    }
  }

  return (
    <>
      <SiteHeader compact />
      <main className="container narrow settings">
        <h1 className="section-title" style={{ marginBottom: 32 }}>个人设置</h1>

        <form className="card settings-card" onSubmit={saveProfile}>
          <h2 className="px">账号资料</h2>
          <div className="field">
            <label htmlFor="email">邮箱</label>
            <input id="email" value={user.email} disabled />
            <span className="hint">登录用的邮箱，不能修改。</span>
          </div>
          <div className="field">
            <label htmlFor="display-name">昵称</label>
            <input
              id="display-name"
              value={name}
              maxLength={40}
              placeholder={user.email.split('@')[0]}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="hint">显示在顶栏，发电时会自动填上。留空就用邮箱前缀。</span>
          </div>
          <div className="settings-meta muted">注册于 {formatTime(user.created_at)}{user.is_admin && ' · 管理员'}</div>
          <div className="settings-actions">
            <button className="btn btn-primary" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
            {profileMsg && <span className={profileMsg.ok ? 'ok-text' : 'form-error'} role="status">{profileMsg.text}</span>}
          </div>
        </form>

        <PasswordCard hasPassword={user.has_password} onChanged={refresh} />

        <section className="card settings-card">
          <h2 className="px">登录设备</h2>
          <p>在别的电脑或手机上登录过、又不想让它继续保持登录，可以一键退出。当前这个浏览器不受影响。</p>
          <div className="settings-actions">
            <button className="btn btn-ghost" disabled={revoking} onClick={() => void logoutOthers()}>
              {revoking ? '处理中…' : '退出其他设备'}
            </button>
            {sessionMsg && <span className={sessionMsg.ok ? 'ok-text' : 'form-error'} role="status">{sessionMsg.text}</span>}
          </div>
        </section>
      </main>
    </>
  )
}

function PasswordCard({ hasPassword, onChanged }: { hasPassword: boolean; onChanged: () => Promise<void> }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setMsg({ ok: false, text: '两次输入的新密码不一样' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await putJson('/api/auth/password', { current_password: hasPassword ? current : null, new_password: password })
      await onChanged()
      setCurrent('')
      setPassword('')
      setConfirm('')
      setMsg({ ok: true, text: hasPassword ? '密码已修改，其他设备需要重新登录' : '密码已设置，以后可以用密码登录' })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card settings-card" onSubmit={save}>
      <h2 className="px">登录密码</h2>
      <p>
        {hasPassword
          ? '已设置密码，登录时可以选「密码登录」。验证码登录也一直可以用。'
          : '还没设密码，现在只能用邮箱验证码登录。设一个密码后，两种方式都能登录。'}
      </p>
      {hasPassword && (
        <div className="field">
          <label htmlFor="current-password">当前密码</label>
          <input id="current-password" type="password" autoComplete="current-password" required maxLength={128}
            value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="new-password">新密码</label>
        <input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
          placeholder="至少 8 位" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="confirm-password">再输一次</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <div className="settings-actions">
        <button className="btn btn-primary" disabled={busy || password.length < 8 || !confirm || (hasPassword && !current)}>
          {busy ? '保存中…' : hasPassword ? '修改密码' : '设置密码'}
        </button>
        {hasPassword && <Link className="text-link" to="/forgot-password?next=%2Fsettings">忘记当前密码？</Link>}
        {msg && <span className={msg.ok ? 'ok-text' : 'form-error'} role="status">{msg.text}</span>}
      </div>
    </form>
  )
}
