import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatShortPrice, postJson, type PayStart, type SupportInfo, type Tier } from '../api'
import { useAuth } from '../auth'

/** 首页「每月发电」：选档位或自定义金额，跳到支付宝付款。 */
export function SupportSection({ info }: { info: SupportInfo | null }) {
  const [picked, setPicked] = useState<Tier | null | undefined>(undefined) // undefined = 弹窗关着；null = 自定义金额
  const enabled = info?.pay_enabled ?? false

  return (
    <div className="support">
      <h2 className="section-title">每月发电</h2>
      <p style={{ margin: '18px 0 0', color: 'var(--text-3)' }}>
        喜欢我的作品，可以支持一下。选一个档位或者自己定金额，用支付宝付款。你的支持会变成下一个特效包。
      </p>

      {info?.tiers.map((t) => (
        <div className="plan" key={t.id}>
          <div>
            <div className="px" style={{ fontSize: 24 }}>{t.name}</div>
            {t.description && (
              <ul className="bullets" style={{ marginTop: 6 }}>
                {t.description.split('\n').filter((line) => line.trim()).map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span>
              <span className="px" style={{ fontSize: 36, color: 'var(--accent)' }}>{formatShortPrice(t.price_cents)}</span>
              <span className="muted"> / 月</span>
            </span>
            <button className="btn btn-primary" style={{ height: 48 }} disabled={!enabled} onClick={() => setPicked(t)}>支持</button>
          </div>
        </div>
      ))}

      <div className="plan plan-free">
        <div>
          <div className="px" style={{ fontSize: 24 }}>随意支持</div>
          <div className="muted" style={{ fontSize: 13 }}>金额自己定，一次也行</div>
        </div>
        <button className="btn btn-ghost" style={{ height: 48 }} disabled={!enabled} onClick={() => setPicked(null)}>自定义金额</button>
      </div>
      {info && !enabled && <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>在线支付暂未开放，过两天再来看看吧。</p>}

      {picked !== undefined && <SupportDialog tier={picked} onClose={() => setPicked(undefined)} />}
    </div>
  )
}

function SupportDialog({ tier, onClose }: { tier: Tier | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { user } = useAuth()
  const [amount, setAmount] = useState(tier ? '' : '10')
  const [name, setName] = useState(user?.display_name ?? '')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 卸载时元素会被移除，不在清理里 close()：开发模式下 effect 会跑两遍，close 会触发 onClose 把弹窗立刻关掉
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const pay = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const body: Record<string, unknown> = { name: name.trim() || null, message: message.trim() || null }
    if (tier) {
      body.tier_id = tier.id
    } else {
      const yuan = Number(amount)
      if (!Number.isFinite(yuan) || yuan < 1 || yuan > 5000) {
        setError('金额在 1 ~ 5000 元之间')
        return
      }
      body.amount_cents = Math.round(yuan * 100)
    }
    setBusy(true)
    try {
      const res = await postJson<PayStart>('/api/support/pay', body)
      window.location.assign(res.pay_url) // 整页跳到支付宝收银台
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={ref}
      className="support-dialog"
      aria-labelledby="support-dialog-title"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      <form className="support-dialog-body form" onSubmit={pay}>
        <h3 id="support-dialog-title" className="px" style={{ margin: 0, fontSize: 24 }}>
          {tier ? `${tier.name} · ${formatShortPrice(tier.price_cents)}` : '随意支持'}
        </h3>
        {!tier && (
          <>
            <label htmlFor="support-amount">金额（元）</label>
            <input id="support-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
          </>
        )}
        <label htmlFor="support-name">怎么称呼你（选填）</label>
        <input id="support-name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="昵称" />
        <label htmlFor="support-msg">想说的话（选填）</label>
        <input id="support-msg" value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} placeholder="比如想看什么元素的特效" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? '跳转中…' : '去支付宝付款'}</button>
        <button type="button" className="text-btn" onClick={onClose}>取消</button>
      </form>
    </dialog>
  )
}
