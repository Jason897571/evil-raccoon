import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { STATUS_LABEL, formatPrice, formatShortPrice, formatTime, postJson, type AdminUserDetail } from '../../api'
import { useAuth } from '../../auth'
import { useApi } from '../../useApi'
import { Stat } from './AdminPacksPage'

type Tab = 'orders' | 'owned' | 'support'

/** 用户详情：资料、消费统计、订单 / 已购资源 / 发电记录、账号安全。 */
export function AdminUserDetailPage() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const { data, error, loading, reload } = useApi<AdminUserDetail>(`/api/admin/users/${id}`)
  const [tab, setTab] = useState<Tab>('orders')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (loading) return <p className="state">加载中…</p>
  if (error || !data) return <p className="state">{error?.message ?? '用户不存在'}</p>

  const u = data.user
  const isSelf = me?.email === u.email
  const lastPaid = data.orders.find((o) => o.status === 'paid')

  const forceLogout = async () => {
    if (!window.confirm(`让 ${u.email} 在所有设备上退出登录？`)) return
    setBusy(true)
    setMsg(null)
    try {
      const { revoked } = await postJson<{ revoked: number }>(`/api/admin/users/${u.id}/logout-all`)
      setMsg({ ok: true, text: revoked ? `已让 ${revoked} 处登录下线` : '这个用户当前没有登录' })
      reload()
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'orders', label: '订单', count: data.orders.length },
    { key: 'owned', label: '已购资源', count: data.owned.length },
    { key: 'support', label: '发电记录', count: data.support_payments.length },
  ]

  return (
    <section className="user-detail">
      <Link to="/admin/users" className="back-link">← 用户列表</Link>

      <div className="card user-head">
        <span className="account-avatar big" aria-hidden="true">{(u.display_name || u.email).slice(0, 1).toUpperCase()}</span>
        <div className="grow">
          <div className="user-title">
            <h2 className="px">{u.display_name || u.email.split('@')[0]}</h2>
            {u.is_admin && <span className="pill pill-accent">管理员</span>}
            <span className="pill">{u.has_password ? '已设密码' : '仅验证码登录'}</span>
            {data.password_locked_until && <span className="pill pill-bad">密码登录锁定中</span>}
          </div>
          <div className="user-email">{u.email}</div>
          <div className="user-meta">
            <span>用户 ID #{u.id}</span>
            <span>注册于 {formatTime(u.created_at)}</span>
            <span>最近登录 {u.last_login_at ? formatTime(u.last_login_at) : '没有记录'}</span>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="资源消费" value={formatShortPrice(u.paid_cents)} sub={`已付 ${u.paid_order_count} 单 · 待付 ${data.pending_order_count} 单`} />
        <Stat label="已购资源" value={data.owned.length} sub={data.owned.length ? `最近：${data.owned[0].name}` : '还没买过'} />
        <Stat label="发电合计" value={formatShortPrice(u.support_cents)} sub={`${data.support_count} 次`} />
        <Stat label="最近付款" value={lastPaid?.paid_at ? formatTime(lastPaid.paid_at).slice(0, 10) : '—'}
          sub={lastPaid ? lastPaid.order_no : '还没有付款'} />
      </div>

      <div className="user-body">
        <div className="card user-lists">
          <div className="chip-tabs" role="tablist" aria-label="记录类型">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label} <span>{t.count}</span>
              </button>
            ))}
          </div>

          {tab === 'orders' && (
            data.orders.length === 0 ? <p className="muted">没有订单</p> : (
              <ul className="record-list">
                {data.orders.map((o) => (
                  <li key={o.order_no}>
                    <div className="grow">
                      <b>{o.items.map((i) => i.name).join('、')}</b>
                      <small><code>{o.order_no}</code> · 下单 {formatTime(o.created_at)}{o.paid_at && ` · 付款 ${formatTime(o.paid_at)}`}</small>
                    </div>
                    <span className="px price-cell">{formatPrice(o.total_cents)}</span>
                    <span className={`status status-${o.status}`}>{STATUS_LABEL[o.status]}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {tab === 'owned' && (
            data.owned.length === 0 ? <p className="muted">还没买过资源</p> : (
              <ul className="record-list">
                {data.owned.map((p) => (
                  <li key={p.slug}>
                    {p.cover_url ? <img src={p.cover_url} alt="" className="record-thumb" /> : <span className="thumb-empty" />}
                    <div className="grow">
                      <Link to={`/admin/packs/${p.slug}`}><b>{p.name}</b></Link>
                      <small><code>{p.order_no}</code>{p.paid_at && ` · ${formatTime(p.paid_at)}`}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}

          {tab === 'support' && (
            data.support_payments.length === 0 ? <p className="muted">没有发电记录</p> : (
              <ul className="record-list">
                {data.support_payments.map((p) => (
                  <li key={p.out_trade_no}>
                    <div className="grow">
                      <b>{p.tier_name ?? '自定义金额'}</b>{p.supporter_name && <span className="muted"> · {p.supporter_name}</span>}
                      <small>{p.message ? `「${p.message}」 · ` : ''}{formatTime(p.paid_at ?? p.created_at)}</small>
                    </div>
                    <span className="px price-cell">{formatShortPrice(p.amount_cents)}</span>
                    <span className={`status status-${p.status}`}>{p.status === 'paid' ? '已付款' : '待付款'}</span>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>

        <div className="card user-side">
          <h3 className="px">账号与安全</h3>
          <dl className="kv">
            <dt>角色</dt><dd>{u.is_admin ? '管理员' : '普通客户'}</dd>
            <dt>登录方式</dt><dd>{u.has_password ? '邮箱验证码、密码' : '邮箱验证码'}</dd>
            <dt>密码登录</dt>
            <dd>
              {data.password_locked_until
                ? <span className="form-error">锁定到 {formatTime(data.password_locked_until)}</span>
                : data.password_failures ? `连续输错 ${data.password_failures} 次` : '正常'}
            </dd>
            <dt>在线设备</dt><dd>{data.session_count} 处{data.last_session_at && `（最近 ${formatTime(data.last_session_at)}）`}</dd>
          </dl>
          {!isSelf && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy || data.session_count === 0} onClick={() => void forceLogout()}>
              强制下线
            </button>
          )}
          {msg && <p className={msg.ok ? 'ok-text' : 'form-error'} role="status">{msg.text}</p>}
        </div>
      </div>
    </section>
  )
}
