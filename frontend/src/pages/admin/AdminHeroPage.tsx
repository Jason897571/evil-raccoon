import { useState } from 'react'
import { putJson, type AdminHeroSlot, type AdminPack } from '../../api'
import { useApi } from '../../useApi'
import { ImageField } from './ImageField'

type Draft = { label: string; skill_code: string | null; gif_url: string }

const GROUPS = [
  { title: '左侧 2×2', range: [0, 4] },
  { title: '中间一排', range: [4, 8] },
  { title: '右侧 2×2', range: [8, 12] },
] as const

/** 首屏 12 格动图：按首页的位置排开，点一格改它的技能 / 标签 / 动图，最后一起保存。 */
export function AdminHeroPage() {
  const hero = useApi<AdminHeroSlot[]>('/api/admin/hero')
  const packs = useApi<AdminPack[]>('/api/admin/packs')

  if (hero.error || packs.error) return <p className="form-error">{(hero.error ?? packs.error)!.message}</p>
  if (!hero.data || !packs.data) return <p className="state">加载中…</p>
  return <HeroEditor key={JSON.stringify(hero.data)} initial={hero.data} packs={packs.data} onSaved={hero.reload} />
}

const toDraft = (s: AdminHeroSlot): Draft => ({ label: s.label, skill_code: s.skill_code, gif_url: s.gif_url })

function HeroEditor({ initial, packs, onSaved }: { initial: AdminHeroSlot[]; packs: AdminPack[]; onSaved: () => void }) {
  const empty: Draft = { label: '', skill_code: null, gif_url: '' }
  const start = Array.from({ length: 12 }, (_, i) => (initial[i] ? toDraft(initial[i]) : empty))
  const [slots, setSlots] = useState<Draft[]>(start)
  const [selected, setSelected] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const skillIndex = new Map(packs.flatMap((p) => p.skills.map((s) => [s.code, { skill: s, pack: p }] as const)))
  const dirty = JSON.stringify(slots) !== JSON.stringify(start)
  const cur = slots[selected]
  const curInfo = cur.skill_code ? skillIndex.get(cur.skill_code) : undefined

  const update = (i: number, patch: Partial<Draft>) => {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))
    setMsg(null)
  }

  const pickSkill = (code: string) => {
    const info = skillIndex.get(code)
    if (!info) return update(selected, { skill_code: null })
    // 换技能：动图换成它的预览图，标签换成所在资源的元素名（之后都还能手动改）
    update(selected, { skill_code: code, gif_url: info.skill.preview_gif_url, label: info.pack.element })
  }

  const swap = (offset: number) => {
    const j = selected + offset
    if (j < 0 || j > 11) return
    setSlots((prev) => {
      const next = [...prev]
      ;[next[selected], next[j]] = [next[j], next[selected]]
      return next
    })
    setSelected(j)
    setMsg(null)
  }

  const save = async () => {
    const bad = slots.findIndex((s) => !s.label.trim() || !s.gif_url.trim())
    if (bad >= 0) {
      setSelected(bad)
      setMsg({ ok: false, text: `第 ${bad + 1} 格还缺${slots[bad].label.trim() ? '动图' : '标签'}` })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await putJson('/api/admin/hero', { slots })
      onSaved()
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="admin-bar">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          首页最上面的 12 格动图，位置和首页一致。点一格修改，改完点「保存」一起生效。
        </p>
        <div className="settings-actions">
          {msg && <span className={msg.ok ? 'ok-text' : 'form-error'} role="status">{msg.text}</span>}
          {dirty && <button type="button" className="text-btn" onClick={() => { setSlots(start); setMsg(null) }}>撤销修改</button>}
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? '保存中…' : dirty ? '保存' : '已保存'}
          </button>
        </div>
      </div>

      <div className="hero-admin-grid">
        {GROUPS.map((g) => (
          <div key={g.title} className={`hero-admin-group${g.range[0] === 4 ? ' row' : ''}`}>
            <div className="hero-admin-group-title">{g.title}</div>
            <div className="hero-admin-tiles">
              {slots.slice(g.range[0], g.range[1]).map((s, k) => {
                const i = g.range[0] + k
                const info = s.skill_code ? skillIndex.get(s.skill_code) : undefined
                return (
                  <button key={i} type="button" className="hero-admin-tile" aria-pressed={selected === i}
                    onClick={() => setSelected(i)} aria-label={`第 ${i + 1} 格：${s.label || '未设置'}`}>
                    <span className="hero-admin-num">{i + 1}</span>
                    {s.gif_url ? <img className="pixelated" src={s.gif_url} alt="" /> : <span className="thumb-empty" />}
                    <span className="hero-admin-label">{s.label || '—'}</span>
                    {info && !info.pack.is_published && <span className="pill pill-bad">未上架</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="card edit-card" style={{ marginTop: 24 }}>
        <div className="edit-head">
          <h2 className="px">第 {selected + 1} 格</h2>
          <div className="row-actions">
            <button type="button" className="text-btn" disabled={selected === 0} onClick={() => swap(-1)}>← 和前一格交换</button>
            <button type="button" className="text-btn" disabled={selected === 11} onClick={() => swap(1)}>和后一格交换 →</button>
          </div>
        </div>
        <div className="edit-grid">
          <div className="field">
            <label htmlFor="hero-skill">技能</label>
            <select id="hero-skill" className="select" value={cur.skill_code ?? ''} onChange={(e) => pickSkill(e.target.value)}>
              <option value="">不关联技能（只用上传的动图）</option>
              {packs.map((p) => (
                <optgroup key={p.slug} label={`${p.name}${p.is_published ? '' : '（未上架）'}`}>
                  {p.skills.map((s) => <option key={s.code} value={s.code}>{s.name} · {s.code}</option>)}
                </optgroup>
              ))}
            </select>
            {curInfo && (
              <span className="hint">
                来自「{curInfo.pack.name}」{!curInfo.pack.is_published && '，这个资源还没上架'}
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="hero-label">格子下面的字</label>
            <input id="hero-label" maxLength={16} value={cur.label} onChange={(e) => update(selected, { label: e.target.value })} placeholder="火" />
          </div>
          <ImageField id="hero-gif" label="动图" value={cur.gif_url} onChange={(v) => update(selected, { gif_url: v })} wide />
        </div>
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 12 }}>
          选技能会自动换成它的预览图，那是<b>灰底 + 水印</b>的版本，放在首屏会和其他格子不搭。
          建议从这个技能的 zip 里拿透明底的 GIF 点「上传」替换（原来 12 格都是这样做的）。
        </p>
      </div>
    </section>
  )
}
