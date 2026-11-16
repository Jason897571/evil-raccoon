import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { NotFoundError, STATUS_LABEL, formatPrice, formatTime, postJson, type Order } from '../api'
import { useAuth } from '../auth'
import { useCart } from '../cart'
import { SiteHeader } from '../components/SiteHeader'
import { useApi } from '../useApi'
import { NotFoundPage } from './NotFoundPage'

export function OrderPage() {
  const { orderNo = '' } = useParams()
  const fetched = useApi<Order>(`/api/orders/${encodeURIComponent(orderNo)}`)
  const [updated, setUpdated] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { devTools, refresh } = useAuth()
  const { remove } = useCart()

  const order = updated ?? fetched.data
  const paid = order?.status === 'paid'

  // 付款成功后，把这些包从购物车里拿掉
  useEffect(() => {
    if (paid && order) order.items.forEach((i) => remove(i.slug))
  }, [paid, order, remove])

  if (fetched.error instanceof NotFoundError) return <NotFoundPage />

  const act = async (action: 'mock-pay' | 'cancel') => {
    setBusy(true)
    setError(null)
    try {
      const next = await postJson<Order>(`/api/orders/${encodeURIComponent(orderNo)}/${action}`)
      setUpdated(next)
      if (next.status === 'paid') await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SiteHeader compact />
      <main className="container narrow">
        <div className="crumbs" style={{ paddingTop: 0, marginBottom: 20 }}>
          <Link to="/orders">← 我的订单</Link>
        </div>
        {fetched.loading && <p className="state">加载中…</p>}
        {fetched.error && !(fetched.error instanceof NotFoundError) && <p className="state">加载失败：{fetched.error.message}</p>}

        {order && (
          <>
            <div className="order-head">
              <div>
                <h1 className="section-title">订单 {STATUS_LABEL[order.status]}</h1>
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  订单号 {order.order_no} · 下单于 {formatTime(order.created_at)}
                  {order.paid_at && ` · 付款于 ${formatTime(order.paid_at)}`}
                </div>
              </div>
              <span className={`status status-${order.status}`}>{STATUS_LABEL[order.status]}</span>
            </div>

            <ul className="cart-list">
              {order.items.map((i) => (
                <li key={i.slug} className="cart-item">
                  <img src={i.cover_url} alt="" />
                  <div className="grow">
                    <Link to={`/packs/${i.slug}`} className="px" style={{ fontSize: 24 }}>{i.name}</Link>
                  </div>
                  <span className="px" style={{ fontSize: 24, color: 'var(--accent)' }}>{formatPrice(i.price_cents)}</span>
                </li>
              ))}
            </ul>

            <div className="cart-total">
              <div>
                <span className="muted">合计 </span>
                <span className="px" style={{ fontSize: 36, color: 'var(--accent)' }}>{formatPrice(order.total_cents)}</span>
              </div>
              {order.status === 'pending' && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="link-btn" onClick={() => void act('cancel')} disabled={busy}>取消订单</button>
                  {devTools ? (
                    <button className="btn btn-primary" onClick={() => void act('mock-pay')} disabled={busy}>
                      模拟支付（开发用）
                    </button>
                  ) : (
                    <button className="btn btn-primary" disabled>支付即将上线</button>
                  )}
                </div>
              )}
              {paid && <Link className="btn btn-primary" to="/library">去我的素材下载</Link>}
            </div>
            {error && <p className="form-error" role="alert" style={{ textAlign: 'right' }}>{error}</p>}
            {order.status === 'pending' && (
              <p className="muted" style={{ fontSize: 13, textAlign: 'right' }}>付款后，网盘链接会出现在「我的素材」里。</p>
            )}
          </>
        )}
      </main>
    </>
  )
}
