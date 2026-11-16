import { useEffect, useRef, useState } from 'react'
import { formatShortPrice, type SupportInfo, type Tier } from '../api'

/** 首页「每月发电」：建议档位 + 支付宝收款码。付款是扫码自愿付，系统不记录。 */
export function SupportSection({ info }: { info: SupportInfo | null }) {
  const [picked, setPicked] = useState<Tier | null | undefined>(undefined) // undefined = 弹窗关着；null = 自定义金额

  return (
    <div className="support">
      <h2 className="section-title">每月发电</h2>
      <p style={{ margin: '18px 0 0', color: 'var(--text-3)' }}>
        喜欢我的作品，可以用支付宝扫码支持一下。下面是建议金额，多少都行，你的支持会变成下一个特效包。
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
            <button className="btn btn-primary" style={{ height: 48 }} onClick={() => setPicked(t)}>支持</button>
          </div>
        </div>
      ))}

      <div className="plan plan-free">
        <div>
          <div className="px" style={{ fontSize: 24 }}>随意支持</div>
          <div className="muted" style={{ fontSize: 13 }}>金额自己定，一次也行</div>
        </div>
        <button className="btn btn-ghost" style={{ height: 48 }} onClick={() => setPicked(null)}>扫码支持</button>
      </div>

      {picked !== undefined && info && (
        <SupportDialog tier={picked} qrUrl={info.alipay_qr_url} note={info.alipay_note} onClose={() => setPicked(undefined)} />
      )}
    </div>
  )
}

function SupportDialog({ tier, qrUrl, note, onClose }: {
  tier: Tier | null
  qrUrl: string | null
  note: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  // 卸载时元素会被移除，不在清理里 close()：开发模式下 effect 会跑两遍，close 会触发 onClose 把弹窗立刻关掉
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="support-dialog"
      aria-labelledby="support-dialog-title"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      <div className="support-dialog-body">
        <h3 id="support-dialog-title" className="px" style={{ margin: 0, fontSize: 24 }}>
          {tier ? `${tier.name} · 建议 ${formatShortPrice(tier.price_cents)} / 月` : '随意支持'}
        </h3>
        {qrUrl ? (
          <>
            <img className="qr" src={qrUrl} alt="支付宝收款码" />
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              打开支付宝扫一扫，{tier ? `输入 ${formatShortPrice(tier.price_cents)}` : '金额随意'}即可。谢谢你！
            </p>
            {note && <p className="dev-hint" style={{ textAlign: 'left' }}>{note}</p>}
          </>
        ) : (
          <p className="state" style={{ padding: '32px 0' }}>收款码还没设置好，过两天再来看看吧。</p>
        )}
        <button className="btn btn-ghost" style={{ height: 44, fontSize: 20 }} onClick={onClose} autoFocus>关闭</button>
      </div>
    </dialog>
  )
}
