import { Link } from 'react-router-dom'
import { STATUS_LABEL, formatPrice, formatTime, type Order } from '../api'
import { SiteHeader } from '../components/SiteHeader'
import { useApi } from '../useApi'

export function OrdersPage() {
  const { data: orders, error, loading } = useApi<Order[]>('/api/orders')

  return (
    <>
      <SiteHeader compact />
      <main className="container narrow">
        <h1 className="section-title" style={{ marginBottom: 32 }}>我的订单</h1>
        {loading && <p className="state">加载中…</p>}
        {error && <p className="state">加载失败：{error.message}</p>}
        {orders?.length === 0 && (
          <div className="state" style={{ padding: '64px 0' }}>
            <p>还没有订单</p>
            <Link className="btn btn-primary" to="/#packs">去挑特效包</Link>
          </div>
        )}
        <ul className="cart-list">
          {orders?.map((o) => (
            <li key={o.order_no}>
              <Link to={`/orders/${o.order_no}`} className="cart-item order-row">
                <div className="grow">
                  <div className="px" style={{ fontSize: 24 }}>{o.items.map((i) => i.name).join('、')}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{o.order_no} · {formatTime(o.created_at)}</div>
                </div>
                <span className="px" style={{ fontSize: 24 }}>{formatPrice(o.total_cents)}</span>
                <span className={`status status-${o.status}`}>{STATUS_LABEL[o.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
