import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { deleteJson, getJson, patchJson, postJson, uploadFile, type SupportInfo, type Tier } from '../../api'

type Draft = {
  name: string
  price: string // 元
  description: string
  is_active: boolean
  sort_order: string
}

const toDraft = (t?: Tier): Draft => ({
  name: t?.name ?? '',
  price: t ? (t.price_cents / 100).toString() : '',
  description: t?.description ?? '',
  is_active: t?.is_active ?? true,
  sort_order: String(t?.sort_order ?? 0),
})

function toPayload(d: Draft) {
  const price = Number(d.price)
  if (!d.name.trim()) throw new Error('名称不能为空')
  if (!Number.isFinite(price) || price < 0) throw new Error('价格要填数字')
  return {
    name: d.name.trim(),
    price_cents: Math.round(price * 100),
    description: d.description.trim(),
    is_active: d.is_active,
    sort_order: Number(d.sort_order) || 0,
  }
}

export function AdminTiersPage() {
  const [tiers, setTiers] = useState<Tier[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      setTiers(await getJson<Tier[]>('/api/admin/tiers'))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section>
      <AlipayQrCard />
      <div className="admin-bar">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          首页「每月发电」显示的建议档位，点「支持」会弹出上面的收款码。权益一行写一条，排序数字小的在前。
        </p>
        {!adding && <button className="btn btn-primary" onClick={() => setAdding(true)}>新增档位</button>}
      </div>
      {error && <p className="form-error">{error}</p>}
      {adding && (
        <TierForm
          key="new"
          onSave={async (d) => {
            await postJson('/api/admin/tiers', toPayload(d))
            setAdding(false)
            await load()
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {tiers?.length === 0 && !adding && <p className="state">还没有档位</p>}
      {tiers?.map((t) => (
        <TierForm
          key={t.id}
          tier={t}
          onSave={async (d) => {
            await patchJson(`/api/admin/tiers/${t.id}`, toPayload(d))
            await load()
          }}
          onDelete={async () => {
            if (!window.confirm(`确定删除「${t.name}」？`)) return
            await deleteJson(`/api/admin/tiers/${t.id}`)
            await load()
          }}
        />
      ))}
    </section>
  )
}

function TierForm({ tier, onSave, onCancel, onDelete }: {
  tier?: Tier
  onSave: (d: Draft) => Promise<void>
  onCancel?: () => void
  onDelete?: () => Promise<void>
}) {
  const [d, setD] = useState<Draft>(() => toDraft(tier))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const id = tier ? `t${tier.id}` : 'tnew'
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }))

  const run = async (fn: () => Promise<void>, okText?: string) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      if (okText) setMsg({ ok: true, text: okText })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(() => onSave(d), tier ? '已保存' : undefined)
  }

  return (
    <form className={`card tier-form${d.is_active ? '' : ' inactive'}`} onSubmit={submit}>
      <div className="tier-grid">
        <div className="field">
          <label htmlFor={`${id}-name`}>名称</label>
          <input id={`${id}-name`} value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={64} required />
        </div>
        <div className="field">
          <label htmlFor={`${id}-price`}>每月价格（元）</label>
          <input id={`${id}-price`} inputMode="decimal" value={d.price} onChange={(e) => set('price', e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor={`${id}-sort`}>排序</label>
          <input id={`${id}-sort`} inputMode="numeric" value={d.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
        </div>
        <div className="field wide">
          <label htmlFor={`${id}-desc`}>权益（一行一条）</label>
          <textarea id={`${id}-desc`} rows={3} value={d.description} onChange={(e) => set('description', e.target.value)} />
        </div>
      </div>
      <div className="tier-actions">
        <label className="check">
          <input type="checkbox" checked={d.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          在首页显示
        </label>
        <span className="grow" />
        {msg && <span className={msg.ok ? 'ok-text' : 'form-error'} role="status">{msg.text}</span>}
        {onDelete && <button type="button" className="link-btn" disabled={busy} onClick={() => void run(onDelete)}>删除</button>}
        {onCancel && <button type="button" className="link-btn" disabled={busy} onClick={onCancel}>取消</button>}
        <button className="btn btn-primary" style={{ height: 44, fontSize: 20 }} disabled={busy}>{tier ? '保存' : '创建'}</button>
      </div>
    </form>
  )
}

function AlipayQrCard() {
  const [info, setInfo] = useState<SupportInfo | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    getJson<SupportInfo>('/api/admin/support')
      .then((data) => {
        setInfo(data)
        setNote(data.alipay_note)
      })
      .catch((err: Error) => setMsg({ ok: false, text: err.message }))
  }, [])

  const run = async (fn: () => Promise<SupportInfo>, okText: string) => {
    setBusy(true)
    setMsg(null)
    try {
      const data = await fn()
      setInfo(data)
      setNote(data.alipay_note)
      setMsg({ ok: true, text: okText })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card qr-card">
      <div className="qr-preview">
        {info?.alipay_qr_url ? <img src={info.alipay_qr_url} alt="当前的支付宝收款码" /> : <span className="muted">还没上传</span>}
      </div>
      <div className="qr-form">
        <h2 className="px" style={{ margin: 0, fontSize: 24 }}>支付宝收款码</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          支持者扫这张码自愿付款，钱直接进你的支付宝，系统不记录金额。支付宝 App › 收钱 › 保存收款码图片后上传（PNG / JPG，5MB 以内）。
        </p>
        <label className="btn btn-primary upload-btn" style={{ height: 44, fontSize: 20 }}>
          {info?.alipay_qr_url ? '换一张' : '上传收款码'}
          <input
            type="file" accept="image/png,image/jpeg" disabled={busy} className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void run(() => uploadFile<SupportInfo>('/api/admin/support/alipay-qr', file), '收款码已更新')
            }}
          />
        </label>
        <div className="field">
          <label htmlFor="qr-note">收款说明（选填，弹窗里显示）</label>
          <input id="qr-note" value={note} maxLength={200} placeholder="比如：付款时备注你的昵称，我会记在感谢名单里" onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="tier-actions" style={{ marginTop: 0 }}>
          {msg && <span className={msg.ok ? 'ok-text' : 'form-error'} role="status">{msg.text}</span>}
          <span className="grow" />
          {info?.alipay_qr_url && (
            <button type="button" className="link-btn" disabled={busy}
              onClick={() => { if (window.confirm('删除收款码后，首页的支持弹窗会显示「还没设置」，确定吗？')) void run(() => deleteJson<SupportInfo>('/api/admin/support/alipay-qr'), '已删除') }}>
              删除收款码
            </button>
          )}
          <button type="button" className="btn btn-ghost" style={{ height: 44, fontSize: 20 }} disabled={busy}
            onClick={() => void run(() => patchJson<SupportInfo>('/api/admin/support', { alipay_note: note }), '说明已保存')}>
            保存说明
          </button>
        </div>
      </div>
    </div>
  )
}
