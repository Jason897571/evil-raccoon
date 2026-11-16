import { formatShortPrice, formatTime, type SupportPayment } from '../../api'
import { useApi } from '../../useApi'

export function AdminSupportersPage() {
  const { data, error, loading } = useApi<SupportPayment[]>('/api/admin/support/payments')
  const total = (data ?? []).reduce((sum, p) => sum + p.amount_cents, 0)

  return (
    <section>
      <div className="admin-bar">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>已付款的发电记录（最近 500 条）。钱直接进你的支付宝商户账户。</p>
        {data && <span className="px" style={{ fontSize: 24 }}>合计 <span style={{ color: 'var(--accent)' }}>{formatShortPrice(total)}</span></span>}
      </div>
      {loading && <p className="state">加载中…</p>}
      {error && <p className="form-error">{error.message}</p>}
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>时间</th><th>金额</th><th>档位</th><th>称呼</th><th>留言</th><th>单号</th></tr>
          </thead>
          <tbody>
            {data?.length === 0 && <tr><td colSpan={6} className="muted">还没有人发电</td></tr>}
            {data?.map((p) => (
              <tr key={p.out_trade_no}>
                <td>{formatTime(p.paid_at ?? p.created_at)}</td>
                <td className="px" style={{ color: 'var(--accent)', fontSize: 18 }}>{formatShortPrice(p.amount_cents)}</td>
                <td>{p.tier_name ?? '自定义'}</td>
                <td>{p.supporter_name ?? '—'}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 320 }}>{p.message ?? '—'}</td>
                <td><code>{p.out_trade_no}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
