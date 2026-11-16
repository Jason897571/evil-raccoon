import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AFDIAN_URL, deleteJson, getJson, patchJson, postJson, type Tier } from '../../api'

type Draft = {
  name: string
  price: string // 元
  description: string
  link_url: string
  is_active: boolean
  sort_order: string
}

const toDraft = (t?: Tier): Draft => ({
  name: t?.name ?? '',
  price: t ? (t.price_cents / 100).toString() : '',
  description: t?.description ?? '',
  link_url: t?.link_url ?? '',
  is_active: t?.is_active ?? true,
  sort_order: String(t?.sort_order ?? 0),
})

function toPayload(d: Draft) {
  const price = Number(d.price)
  if (!d.name.trim()) throw new Error('名称不能为空')
  if (!Number.isFinite(price) || price < 0) throw new Error('价格要填数字')
  if (d.link_url.trim() && !/^https?:\/\//.test(d.link_url.trim())) throw new Error('链接要以 http:// 或 https:// 开头')
  return {
    name: d.name.trim(),
    price_cents: Math.round(price * 100),
    description: d.description.trim(),
    link_url: d.link_url.trim() || null,
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
      <div className="admin-bar">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          首页「每月发电」显示的档位。权益一行写一条；按钮链接不填就跳到爱发电主页。排序数字小的在前。
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
        <div className="field wide">
          <label htmlFor={`${id}-link`}>发电按钮链接</label>
          <input id={`${id}-link`} type="url" placeholder={AFDIAN_URL} value={d.link_url} onChange={(e) => set('link_url', e.target.value)} />
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
