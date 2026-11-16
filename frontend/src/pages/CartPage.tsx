import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatPrice, postJson, type Order } from '../api'
import { useAuth } from '../auth'
import { useCart } from '../cart'
import { SiteHeader } from '../components/SiteHeader'

export function CartPage() {
  const { items, remove } = useCart()
  const { user, owned } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buyable = items.filter((i) => !owned.has(i.slug))
  const total = buyable.reduce((sum, i) => sum + i.price_cents, 0)

  const checkout = async () => {
    if (!user) {
      navigate('/login?next=/cart')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const order = await postJson<Order>('/api/orders', { slugs: buyable.map((i) => i.slug) })
      navigate(`/orders/${order.order_no}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <SiteHeader compact />
      <main className="container narrow">
        <h1 className="section-title" style={{ marginBottom: 32 }}>购物车</h1>
        {items.length === 0 ? (
          <div className="state" style={{ padding: '64px 0' }}>
            <p>购物车是空的</p>
            <Link className="btn btn-primary" to="/#packs">去挑特效包</Link>
          </div>
        ) : (
          <>
            <ul className="cart-list">
              {items.map((i) => (
                <li key={i.slug} className="cart-item">
                  <img src={i.cover_url} alt="" />
                  <div className="grow">
                    <Link to={`/packs/${i.slug}`} className="px" style={{ fontSize: 24 }}>{i.name}</Link>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {owned.has(i.slug) ? '你已经买过，结算时不会再收费' : '64×64 像素技能特效 · 可商用'}
                    </div>
                  </div>
                  <span className="px" style={{ fontSize: 24, color: owned.has(i.slug) ? 'var(--muted)' : 'var(--accent)' }}>
                    {owned.has(i.slug) ? '已购买' : formatPrice(i.price_cents)}
                  </span>
                  <button className="link-btn" onClick={() => remove(i.slug)} aria-label={`从购物车移除${i.name}`}>移除</button>
                </li>
              ))}
            </ul>
            <div className="cart-total">
              <div>
                <span className="muted">共 {buyable.length} 个特效包，合计 </span>
                <span className="px" style={{ fontSize: 36, color: 'var(--accent)' }}>{formatPrice(total)}</span>
              </div>
              <button className="btn btn-primary" onClick={checkout} disabled={busy || buyable.length === 0}>
                {busy ? '下单中…' : user ? '提交订单' : '登录后结算'}
              </button>
            </div>
            {error && <p className="form-error" role="alert" style={{ textAlign: 'right' }}>{error}</p>}
          </>
        )}
      </main>
    </>
  )
}
