import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatShortPrice, getJson, NotFoundError, type SupportPayment } from '../api'
import { SiteHeader } from '../components/SiteHeader'

const POLL_MS = 3000
const MAX_TRIES = 10

/** 支付宝付完跳回来的页面。到账可能晚几秒，没到账就每 3 秒再查一次。 */
export function SupportThanksPage() {
  const [params] = useSearchParams()
  const no = params.get('no') ?? ''
  const [payment, setPayment] = useState<SupportPayment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)

  useEffect(() => {
    if (!no) return
    let cancelled = false
    getJson<SupportPayment>(`/api/support/payments/${encodeURIComponent(no)}`)
      .then((p) => { if (!cancelled) setPayment(p) })
      .catch((err: Error) => { if (!cancelled) setError(err instanceof NotFoundError ? '找不到这笔支付' : err.message) })
    return () => { cancelled = true }
  }, [no, tries])

  useEffect(() => {
    if (payment?.status !== 'pending' || tries >= MAX_TRIES) return
    const t = setTimeout(() => setTries((n) => n + 1), POLL_MS)
    return () => clearTimeout(t)
  }, [payment, tries])

  return (
    <>
      <SiteHeader compact />
      <main className="container auth-wrap" style={{ textAlign: 'center' }}>
        {!no && <p className="state">链接不完整。</p>}
        {error && <p className="state">{error}</p>}
        {payment?.status === 'paid' && (
          <>
            <img className="hero-avatar" src="/avatar-256.png" alt="" width={88} height={88} style={{ margin: '0 auto 20px', display: 'block' }} />
            <h1 className="section-title">谢谢你的支持！</h1>
            <p style={{ color: 'var(--text-2)' }}>
              已收到 <b className="px" style={{ color: 'var(--accent)', fontSize: 24 }}>{formatShortPrice(payment.amount_cents)}</b>
              {payment.tier_name && `（${payment.tier_name}）`}
              {payment.supporter_name && `，${payment.supporter_name}`}。浣熊会继续努力做新特效的。
            </p>
          </>
        )}
        {payment?.status === 'pending' && (
          <>
            <h1 className="section-title">正在确认付款…</h1>
            <p className="muted">
              {tries < MAX_TRIES ? '支付宝到账可能要几秒钟。' : '还没查到这笔付款。如果已经付过了，稍后刷新这个页面看看。'}
            </p>
            {tries >= MAX_TRIES && <button className="btn btn-ghost" onClick={() => setTries(0)}>再查一次</button>}
          </>
        )}
        <p style={{ marginTop: 40 }}><Link className="btn btn-primary" to="/">回到首页</Link></p>
      </main>
    </>
  )
}
