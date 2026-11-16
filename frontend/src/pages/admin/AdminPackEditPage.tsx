import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteJson, patchJson, postJson, type AdminPack, type AdminSkill } from '../../api'
import { useApi } from '../../useApi'
import { ImageField } from './ImageField'

type Msg = { ok: boolean; text: string } | null

const yuan = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '')
const toCents = (v: string) => Math.round(parseFloat(v) * 100)

/** /admin/packs/new 新建；/admin/packs/:slug 编辑资料和技能。 */
export function AdminPackEditPage() {
  const { slug } = useParams()
  const { data: all } = useApi<AdminPack[]>('/api/admin/packs')
  const elements = [...new Set((all ?? []).map((p) => p.element))]

  return (
    <section className="pack-edit">
      <Link to="/admin/packs" className="back-link">← 资源列表</Link>
      {slug ? <EditPack key={slug} slug={slug} elements={elements} /> : <PackForm pack={null} elements={elements} onSaved={() => {}} />}
    </section>
  )
}

function EditPack({ slug, elements }: { slug: string; elements: string[] }) {
  const { data, error, reload } = useApi<AdminPack>(`/api/admin/packs/${slug}`)
  if (error) return <p className="state">加载失败：{error.message}</p>
  if (!data) return <p className="state">加载中…</p>
  return (
    <>
      <PackForm pack={data} elements={elements} onSaved={reload} />
      <SkillsSection pack={data} onChanged={reload} />
    </>
  )
}

function PackForm({ pack, elements, onSaved }: { pack: AdminPack | null; elements: string[]; onSaved: () => void }) {
  const navigate = useNavigate()
  const [f, setF] = useState({
    slug: pack?.slug ?? '',
    name: pack?.name ?? '',
    element: pack?.element ?? '',
    price: pack ? yuan(pack.price_cents) : '',
    sort_order: String(pack?.sort_order ?? 0),
    summary: pack?.summary ?? '',
    cover_url: pack?.cover_url ?? '',
    netdisk_url: pack?.netdisk_url ?? '',
    netdisk_code: pack?.netdisk_code ?? '',
    is_new: pack?.is_new ?? false,
    is_published: pack?.is_published ?? false,
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const price_cents = toCents(f.price)
    if (!Number.isFinite(price_cents) || price_cents < 0) {
      setMsg({ ok: false, text: '价格要填数字' })
      return
    }
    const body = {
      name: f.name.trim(), element: f.element.trim(), price_cents, sort_order: parseInt(f.sort_order) || 0,
      summary: f.summary, cover_url: f.cover_url.trim(), netdisk_url: f.netdisk_url, netdisk_code: f.netdisk_code,
      is_new: f.is_new, is_published: f.is_published,
    }
    setBusy(true)
    setMsg(null)
    try {
      if (pack) {
        await patchJson(`/api/admin/packs/${pack.slug}`, body)
        setMsg({ ok: true, text: '已保存' })
        onSaved()
      } else {
        const created = await postJson<AdminPack>('/api/admin/packs', { ...body, slug: f.slug.trim() })
        navigate(`/admin/packs/${created.slug}`, { replace: true })
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!pack || !window.confirm(`确定删除「${pack.name}」？包里的 ${pack.skill_count} 个技能会一起删掉，不能恢复。`)) return
    setBusy(true)
    try {
      await deleteJson(`/api/admin/packs/${pack.slug}`)
      navigate('/admin/packs', { replace: true })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
      setBusy(false)
    }
  }

  return (
    <form className="card edit-card" onSubmit={save}>
      <div className="edit-head">
        <h2 className="px">{pack ? pack.name : '添加资源'}</h2>
        {pack && <span className="muted" style={{ fontSize: 13 }}>{pack.skill_count} 个技能 · 已售 {pack.sold_count} 份</span>}
      </div>
      <div className="edit-grid">
        <div className="field">
          <label htmlFor="p-name">名称</label>
          <input id="p-name" required maxLength={64} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="血 2" />
        </div>
        <div className="field">
          <label htmlFor="p-slug">slug（网址里用，建好后不能改）</label>
          <input id="p-slug" required maxLength={64} pattern="[a-z0-9][a-z0-9\-]*" disabled={Boolean(pack)}
            value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} placeholder="blood-2" />
        </div>
        <div className="field">
          <label htmlFor="p-element">元素（首页筛选用）</label>
          <input id="p-element" required maxLength={16} list="element-list" value={f.element}
            onChange={(e) => set('element', e.target.value)} placeholder="血" />
          <datalist id="element-list">{elements.map((el) => <option key={el} value={el} />)}</datalist>
        </div>
        <div className="field">
          <label htmlFor="p-price">价格（元）</label>
          <input id="p-price" required inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="19.9" />
        </div>
        <div className="field">
          <label htmlFor="p-sort">排序（小的在前）</label>
          <input id="p-sort" inputMode="numeric" value={f.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
        </div>
        <div className="field wide">
          <label htmlFor="p-summary">简介</label>
          <textarea id="p-summary" rows={5} maxLength={5000} value={f.summary} onChange={(e) => set('summary', e.target.value)} />
        </div>
        <ImageField id="p-cover" label="封面（小红书封面图）" value={f.cover_url} onChange={(v) => set('cover_url', v)} wide />
        <div className="field">
          <label htmlFor="p-netdisk">网盘链接（付款后给买家）</label>
          <input id="p-netdisk" maxLength={512} value={f.netdisk_url} onChange={(e) => set('netdisk_url', e.target.value)} placeholder="https://pan.baidu.com/…" />
        </div>
        <div className="field">
          <label htmlFor="p-code">提取码</label>
          <input id="p-code" maxLength={32} value={f.netdisk_code} onChange={(e) => set('netdisk_code', e.target.value)} />
        </div>
      </div>
      <div className="tier-actions">
        <label className="check"><input type="checkbox" checked={f.is_published} onChange={(e) => set('is_published', e.target.checked)} /> 上架</label>
        <label className="check"><input type="checkbox" checked={f.is_new} onChange={(e) => set('is_new', e.target.checked)} /> 标记 NEW</label>
        <span className="grow" />
        {msg && <span className={msg.ok ? 'ok-text' : 'form-error'} role="status">{msg.text}</span>}
        {pack && <button type="button" className="text-btn danger" disabled={busy} onClick={() => void remove()}>删除资源</button>}
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? '保存中…' : pack ? '保存' : '创建，下一步加技能'}</button>
      </div>
    </form>
  )
}

function SkillsSection({ pack, onChanged }: { pack: AdminPack; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(pack.skills.length === 0)
  const [msg, setMsg] = useState<Msg>(null)

  const remove = async (s: AdminSkill) => {
    if (!window.confirm(`删除技能「${s.name}」？`)) return
    try {
      await deleteJson(`/api/admin/packs/${pack.slug}/skills/${s.code}`)
      setMsg({ ok: true, text: `已删除「${s.name}」` })
      onChanged()
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    }
  }

  return (
    <div className="card edit-card">
      <div className="edit-head">
        <h2 className="px">技能 <span className="muted">{pack.skills.length}</span></h2>
        {!adding && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>＋ 添加技能</button>}
      </div>
      {msg && <p className={msg.ok ? 'ok-text' : 'form-error'} role="status">{msg.text}</p>}
      <ul className="skill-admin-list">
        {pack.skills.map((s) => (
          <li key={s.code}>
            {editing === s.code ? (
              <SkillForm packSlug={pack.slug} skill={s} onDone={() => { setEditing(null); onChanged() }} onCancel={() => setEditing(null)} />
            ) : (
              <div className="skill-row">
                {s.preview_gif_url ? <img src={s.preview_gif_url} alt="" /> : <span className="thumb-empty" />}
                <div className="grow">
                  <b>{s.name}</b> <code>{s.code}</code>
                  <small>{s.phases || '—'} · 精灵图 {s.sheet_cols}×{s.sheet_rows}</small>
                </div>
                <div className="row-actions">
                  <button type="button" className="text-btn" onClick={() => setEditing(s.code)}>编辑</button>
                  <button type="button" className="text-btn danger" onClick={() => void remove(s)}>删除</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {adding && (
        <SkillForm packSlug={pack.slug} skill={null} onDone={() => { setAdding(false); onChanged() }} onCancel={() => setAdding(false)} />
      )}
    </div>
  )
}

function SkillForm({ packSlug, skill, onDone, onCancel }: {
  packSlug: string; skill: AdminSkill | null; onDone: () => void; onCancel: () => void
}) {
  const [f, setF] = useState({
    code: skill?.code ?? '',
    name: skill?.name ?? '',
    description: skill?.description ?? '',
    phases: skill?.phases ?? 'spawn / loop / end',
    preview_gif_url: skill?.preview_gif_url ?? '',
    sheet_url: skill?.sheet_url ?? '',
    sheet_cols: String(skill?.sheet_cols ?? 1),
    sheet_rows: String(skill?.sheet_rows ?? 1),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }))
  const prefix = skill ? skill.code : 'new'

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const body = {
      name: f.name.trim(), description: f.description, phases: f.phases, preview_gif_url: f.preview_gif_url.trim(),
      sheet_url: f.sheet_url.trim(), sheet_cols: parseInt(f.sheet_cols) || 1, sheet_rows: parseInt(f.sheet_rows) || 1,
    }
    setBusy(true)
    setError(null)
    try {
      if (skill) await patchJson(`/api/admin/packs/${packSlug}/skills/${skill.code}`, body)
      else await postJson(`/api/admin/packs/${packSlug}/skills`, { ...body, code: f.code.trim() })
      onDone()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="skill-form" onSubmit={save}>
      <div className="edit-grid">
        <div className="field">
          <label htmlFor={`${prefix}-code`}>代号（建好后不能改）</label>
          <input id={`${prefix}-code`} required maxLength={96} pattern="[a-z0-9][a-z0-9_\-]*" disabled={Boolean(skill)}
            value={f.code} onChange={(e) => set('code', e.target.value.toLowerCase())} placeholder="blood_01_blood_spike" />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-name`}>名称</label>
          <input id={`${prefix}-name`} required maxLength={64} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="血刺" />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-phases`}>阶段</label>
          <input id={`${prefix}-phases`} maxLength={2000} value={f.phases} onChange={(e) => set('phases', e.target.value)} />
        </div>
        <div className="field wide">
          <label htmlFor={`${prefix}-desc`}>描述</label>
          <textarea id={`${prefix}-desc`} rows={2} maxLength={5000} value={f.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <ImageField id={`${prefix}-gif`} label="预览 GIF（建议带水印）" value={f.preview_gif_url} onChange={(v) => set('preview_gif_url', v)} />
        <ImageField id={`${prefix}-sheet`} label="精灵图 PNG（建议带水印）" value={f.sheet_url} onChange={(v) => set('sheet_url', v)} />
        <div className="field">
          <label htmlFor={`${prefix}-cols`}>精灵图列数</label>
          <input id={`${prefix}-cols`} inputMode="numeric" value={f.sheet_cols} onChange={(e) => set('sheet_cols', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-rows`}>精灵图行数</label>
          <input id={`${prefix}-rows`} inputMode="numeric" value={f.sheet_rows} onChange={(e) => set('sheet_rows', e.target.value)} />
        </div>
      </div>
      <div className="tier-actions">
        {error && <span className="form-error" role="alert">{error}</span>}
        <span className="grow" />
        <button type="button" className="text-btn" onClick={onCancel}>取消</button>
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? '保存中…' : skill ? '保存技能' : '添加技能'}</button>
      </div>
    </form>
  )
}
