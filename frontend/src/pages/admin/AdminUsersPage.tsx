import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatShortPrice, formatTime, type AdminUserRow } from '../../api'
import { useApi } from '../../useApi'
import { Stat } from './AdminPacksPage'

type Sort = 'created' | 'paid' | 'login'

const DAY = 86_400_000

/** 用户列表：注册时间、最近登录、消费和发电合计，点进去看详情。 */
export function AdminUsersPage() {
  const { data, error, loading } = useApi<AdminUserRow[]>('/api/admin/users')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('created')

  const users = data ?? []
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const list = users.filter((u) => !kw || `${u.email} ${u.display_name ?? ''}`.toLowerCase().includes(kw))
    const key: Record<Sort, (u: AdminUserRow) => number> = {
      created: (u) => Date.parse(u.created_at),
      paid: (u) => u.paid_cents + u.support_cents,
      login: (u) => (u.last_login_at ? Date.parse(u.last_login_at) : 0),
    }
    return [...list].sort((a, b) => key[sort](b) - key[sort](a))
  }, [users, q, sort])

  const now = Date.now()
  const paying = users.filter((u) => u.paid_order_count > 0).length
  const revenue = users.reduce((n, u) => n + u.paid_cents, 0)
  const support = users.reduce((n, u) => n + u.support_cents, 0)

  return (
    <section>
      <div className="stat-grid">
        <Stat label="用户总数" value={users.length} sub={`近 7 天新增 ${users.filter((u) => now - Date.parse(u.created_at) < 7 * DAY).length}`} />
        <Stat label="付费用户" value={paying} sub={users.length ? `占 ${Math.round((paying / users.length) * 100)}%` : '—'} />
        <Stat label="资源销售额" value={formatShortPrice(revenue)} sub="已付款订单" />
        <Stat label="发电合计" value={formatShortPrice(support)} sub="登录用户的发电，不含匿名" />
      </div>

      <div className="admin-bar">
        <div className="admin-filters">
          <input className="admin-search" type="search" placeholder="搜索邮箱 / 昵称…" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="搜索用户" />
          <div className="chip-tabs" role="tablist" aria-label="排序">
            {([['created', '最新注册'], ['login', '最近登录'], ['paid', '消费最多']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={sort === k} onClick={() => setSort(k)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {loading && <p className="state">加载中…</p>}
      {error && <p className="form-error">{error.message}</p>}
      {data && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>用户</th><th>注册</th><th>最近登录</th><th>已付订单</th><th>消费</th><th>发电</th><th>登录方式</th></tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} className="muted">没有符合条件的用户</td></tr>}
              {shown.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link to={`/admin/users/${u.id}`} className="user-cell">
                      <span className="account-avatar" aria-hidden="true">{(u.display_name || u.email).slice(0, 1).toUpperCase()}</span>
                      <span>
                        <b>{u.display_name || u.email.split('@')[0]}</b>
                        {u.is_admin && <span className="pill pill-accent">管理员</span>}
                        <small>{u.email}</small>
                      </span>
                    </Link>
                  </td>
                  <td>{formatTime(u.created_at)}</td>
                  <td>{u.last_login_at ? formatTime(u.last_login_at) : <span className="muted">—</span>}</td>
                  <td>{u.paid_order_count}</td>
                  <td className="px price-cell">{u.paid_cents ? formatShortPrice(u.paid_cents) : <span className="muted">—</span>}</td>
                  <td className="px price-cell">{u.support_cents ? formatShortPrice(u.support_cents) : <span className="muted">—</span>}</td>
                  <td>{u.has_password ? '验证码 + 密码' : '验证码'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
